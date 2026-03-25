import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { publicAPI, UPLOADS_URL } from '../services/api';

function formatPrice(value) {
  return 'R$ ' + value.toFixed(2).replace('.', ',');
}

function CartPanel({ cart, onUpdateQty, onClose, phone, storeName }) {
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  const sendWhatsApp = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let msg = `🛒 *Novo Pedido via ZapVitrine!*\n\n`;
    msg += `🏪 *${storeName}*\n\n`;
    msg += `📦 *Itens:*\n`;
    cart.forEach(item => {
      msg += `• ${item.qty}x ${item.name} — ${formatPrice(item.price * item.qty)}\n`;
    });
    msg += `\n💰 *Total: ${formatPrice(total)}*\n`;
    if (customerName) msg += `\n👤 Nome: ${customerName}`;
    if (customerPhone) msg += `\n📱 Tel: ${customerPhone}`;
    msg += `\n\n📅 Pedido em ${dateStr} às ${timeStr}`;

    const cleanPhone = phone.replace(/\D/g, '');
    const whatsPhone = cleanPhone.startsWith('55') ? cleanPhone : '55' + cleanPhone;
    const url = `https://wa.me/${whatsPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="cart-panel">
      <div className="cart-panel-overlay" onClick={onClose} />
      <div className="cart-panel-content">
        <div className="cart-panel-header">
          <h2>🛒 Seu Pedido</h2>
          <button className="cart-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="cart-items">
          {cart.map((item, i) => (
            <div key={i} className="cart-item">
              <div className="cart-item-info">
                <h4>{item.name}</h4>
                <span>{formatPrice(item.price)}</span>
              </div>
              <div className="cart-item-qty">
                <button onClick={() => onUpdateQty(item.id, item.qty - 1)}>−</button>
                <span>{item.qty}</span>
                <button onClick={() => onUpdateQty(item.id, item.qty + 1)}>+</button>
              </div>
            </div>
          ))}
        </div>
        <div className="cart-panel-footer">
          <div className="checkout-form">
            <div className="form-group">
              <label>Seu Nome</label>
              <input className="form-input" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Como quer ser chamado?" />
            </div>
            <div className="form-group">
              <label>Seu Telefone (opcional)</label>
              <input className="form-input" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="(11) 99999-9999" />
            </div>
          </div>
          <div className="cart-total">
            <span>Total</span>
            <span>{formatPrice(total)}</span>
          </div>
          <button className="whatsapp-btn" onClick={sendWhatsApp}>
            💬 Enviar Pedido via WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PublicStore() {
  const { slug } = useParams();
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [cart, setCart] = useState([]);
  const [showCart, setShowCart] = useState(false);

  useEffect(() => {
    publicAPI.getStore(slug)
      .then(data => {
        setStore(data);
        document.title = `${data.name} | ZapVitrine`;
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [slug]);

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      }
      return [...prev, { id: product.id, name: product.name, price: product.price, qty: 1 }];
    });
  };

  const updateQty = (id, qty) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(i => i.id !== id));
    } else {
      setCart(prev => prev.map(i => i.id === id ? { ...i, qty } : i));
    }
  };

  const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);
  const totalPrice = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  const filteredProducts = store?.products?.filter(p => !selectedCategory || p.categoryId === selectedCategory) || [];

  if (loading) return <div className="loading-spinner" style={{ minHeight: '100vh' }} />;

  if (error) {
    return (
      <div className="public-store" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="empty-state">
          <div className="empty-icon">😕</div>
          <h3>Loja não encontrada</h3>
          <p>Verifique se o endereço está correto</p>
        </div>
      </div>
    );
  }

  const themeColor = store.themeColor || '#6C63FF';

  return (
    <div className="public-store">
      <style>{`
        .public-store .category-tab.active { background: ${themeColor}; border-color: ${themeColor}; }
        .public-store .product-add-btn { background: ${themeColor}; }
        .public-store .cart-bar { border-color: ${themeColor}; }
        .public-store .cart-count { background: ${themeColor}; }
      `}</style>

      <section className="store-hero" style={{ background: `linear-gradient(135deg, ${themeColor}11, ${themeColor}05)` }}>
        <div className="store-hero-content">
          <div className="store-logo-large" style={{ borderColor: themeColor + '40' }}>
            {store.logoUrl ? <img src={UPLOADS_URL + store.logoUrl} alt={store.name} /> : '🏪'}
          </div>
          <h1>{store.name}</h1>
          {store.description && <p>{store.description}</p>}
          <div className="store-info-badges">
            {store.address && <span className="store-info-badge">📍 {store.address}</span>}
            {store.phone && <span className="store-info-badge">📱 WhatsApp</span>}
            {store.businessHours && <span className="store-info-badge">🕐 {store.businessHours.split('\n')[0]}</span>}
          </div>
        </div>
      </section>

      {store.categories.length > 0 && (
        <div className="category-tabs">
          <button className={`category-tab${!selectedCategory ? ' active' : ''}`} onClick={() => setSelectedCategory(null)}>
            Todos
          </button>
          {store.categories.map(cat => (
            <button
              key={cat.id}
              className={`category-tab${selectedCategory === cat.id ? ' active' : ''}`}
              onClick={() => setSelectedCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {filteredProducts.length === 0 ? (
        <div className="empty-state" style={{ padding: '80px 20px' }}>
          <div className="empty-icon">📦</div>
          <h3>Nenhum produto disponível</h3>
          <p>Esta loja ainda não adicionou produtos</p>
        </div>
      ) : (
        <div className="products-public-grid">
          {filteredProducts.map(product => (
            <div key={product.id} className="product-public-card" onClick={() => addToCart(product)}>
              <div className="product-public-img">
                {product.imageUrl ? <img src={UPLOADS_URL + product.imageUrl} alt={product.name} /> : <span className="placeholder">📷</span>}
              </div>
              <div className="product-public-info">
                <h3>{product.name}</h3>
                {product.description && <p>{product.description}</p>}
                <div className="product-public-footer">
                  <span className="product-public-price">{formatPrice(product.price)}</span>
                  <button className="product-add-btn" onClick={(e) => { e.stopPropagation(); addToCart(product); }}>+</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalItems > 0 && (
        <div className="cart-float">
          <div className="cart-bar" onClick={() => setShowCart(true)}>
            <div className="cart-count">{totalItems}</div>
            <div className="cart-info">
              <span>Ver pedido</span>
              <strong>{formatPrice(totalPrice)}</strong>
            </div>
            <span style={{ fontSize: '1.3rem' }}>💬</span>
          </div>
        </div>
      )}

      {showCart && (
        <CartPanel
          cart={cart}
          onUpdateQty={updateQty}
          onClose={() => setShowCart(false)}
          phone={store.phone}
          storeName={store.name}
        />
      )}
    </div>
  );
}
