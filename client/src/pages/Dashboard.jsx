import { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { storeAPI, categoriesAPI, productsAPI, adminAPI, ordersAPI, UPLOADS_URL } from '../services/api';

function Sidebar({ open, onClose }) {
  const { user, store, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');
  const [theme, setTheme] = useState(() => localStorage.getItem('zapvitrine_theme') || 'dark');

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('zapvitrine_theme', next);
    setTheme(next);
  };

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-header">
        <h1>⚡ ZapVitrine</h1>
        <p>{store?.name || 'Minha Loja'}</p>
      </div>
      <nav className="sidebar-nav">
        <Link to="/dashboard" className={`sidebar-link${isActive('/dashboard') && !isActive('/dashboard/loja') && !isActive('/dashboard/categorias') && !isActive('/dashboard/produtos') && !isActive('/dashboard/chatbot') && !isActive('/dashboard/pedidos') && !isActive('/dashboard/admin') ? ' active' : ''}`} onClick={onClose}>
          <span className="icon">🏠</span> Início
        </Link>
        <Link to="/dashboard/loja" className={`sidebar-link${isActive('/dashboard/loja') ? ' active' : ''}`} onClick={onClose}>
          <span className="icon">🏪</span> Minha Loja
        </Link>
        <Link to="/dashboard/categorias" className={`sidebar-link${isActive('/dashboard/categorias') ? ' active' : ''}`} onClick={onClose}>
          <span className="icon">📁</span> Categorias
        </Link>
        <Link to="/dashboard/produtos" className={`sidebar-link${isActive('/dashboard/produtos') ? ' active' : ''}`} onClick={onClose}>
          <span className="icon">📦</span> Produtos
        </Link>
        <Link to="/dashboard/chatbot" className={`sidebar-link${isActive('/dashboard/chatbot') ? ' active' : ''}`} onClick={onClose}>
          <span className="icon">🤖</span> Chatbot
        </Link>
        <Link to="/dashboard/pedidos" className={`sidebar-link${isActive('/dashboard/pedidos') ? ' active' : ''}`} onClick={onClose}>
          <span className="icon">📊</span> Pedidos
        </Link>
        {user?.role === 'admin' && (
          <Link to="/dashboard/admin" className={`sidebar-link${isActive('/dashboard/admin') ? ' active' : ''}`} onClick={onClose}>
            <span className="icon">⚙️</span> Admin
          </Link>
        )}
      </nav>
      <div className="sidebar-footer">
        <button className="theme-toggle-btn" onClick={toggleTheme}>
          <span className="icon">{theme === 'light' ? '🌙' : '☀️'}</span>
          {theme === 'light' ? 'Modo Escuro' : 'Modo Claro'}
        </button>
        <button className="sidebar-link" onClick={() => { logout(); navigate('/'); }}>
          <span className="icon">🚪</span> Sair
        </button>
      </div>
    </aside>
  );
}

function DashboardHome() {
  const { store } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    productsAPI.list().then(setProducts).catch(() => {});
    categoriesAPI.list().then(setCategories).catch(() => {});
  }, []);

  const storeUrl = `${window.location.origin}/loja/${store?.slug || ''}`;

  const copyLink = () => {
    navigator.clipboard.writeText(storeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Olá, {store?.name || 'Lojista'}! 👋</h1>
          <p>Aqui está o resumo da sua vitrine</p>
        </div>
      </div>

      <div className="store-link-card">
        <h3>🔗 Link da sua vitrine</h3>
        <div className="store-link-url">
          <span style={{ flex: 1 }}>{storeUrl}</span>
          <button className="btn btn-primary btn-sm" onClick={copyLink}>
            {copied ? '✅ Copiado!' : '📋 Copiar'}
          </button>
          <a href={storeUrl} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
            🔍 Abrir
          </a>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📦</div>
          <div className="stat-value">{products.length}</div>
          <div className="stat-label">Produtos cadastrados</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📁</div>
          <div className="stat-value">{categories.length}</div>
          <div className="stat-label">Categorias</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-value">{products.filter(p => p.active).length}</div>
          <div className="stat-label">Produtos ativos</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📱</div>
          <div className="stat-value">{store?.phone ? '✓' : '✗'}</div>
          <div className="stat-label">WhatsApp configurado</div>
        </div>
      </div>

      {(!store?.phone || products.length === 0) && (
        <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
          <h3 style={{ marginBottom: '12px' }}>🚀 Complete sua vitrine!</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
            {!store?.phone && 'Configure seu WhatsApp em "Minha Loja". '}
            {products.length === 0 && 'Adicione seus primeiros produtos em "Produtos".'}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            {!store?.phone && <Link to="/dashboard/loja" className="btn btn-primary">Configurar Loja</Link>}
            {products.length === 0 && <Link to="/dashboard/produtos" className="btn btn-secondary">Adicionar Produtos</Link>}
          </div>
        </div>
      )}
    </div>
  );
}

function StoreSettings() {
  const { store, refreshStore } = useAuth();
  const [form, setForm] = useState({ name: '', slug: '', description: '', phone: '', address: '', themeColor: '#6C63FF', businessHours: '' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (store) {
      setForm({
        name: store.name || '',
        slug: store.slug || '',
        description: store.description || '',
        phone: store.phone || '',
        address: store.address || '',
        themeColor: store.themeColor || '#6C63FF',
        businessHours: store.businessHours || '',
      });
    }
  }, [store]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await storeAPI.update(form);
      await refreshStore();
      setSuccess('Loja atualizada com sucesso!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('logo', file);
    try {
      await storeAPI.uploadLogo(formData);
      await refreshStore();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Minha Loja</h1>
          <p>Configure as informações da sua vitrine</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <form onSubmit={handleSave}>
        <div className="settings-grid">
          <div className="settings-section">
            <h3>📝 Informações Básicas</h3>
            <div className="logo-upload">
              <div className="logo-preview">
                {store?.logoUrl ? <img src={UPLOADS_URL + store.logoUrl} alt="Logo" /> : '🏪'}
              </div>
              <div>
                <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                  📷 Alterar Logo
                  <input type="file" accept="image/*" onChange={handleLogoUpload} style={{ display: 'none' }} />
                </label>
              </div>
            </div>
            <div className="form-group">
              <label>Nome da Loja</label>
              <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Barbearia do João" required />
            </div>
            <div className="form-group">
              <label>Link da Vitrine (slug)</label>
              <input className="form-input" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} placeholder="ex: barbearia-do-joao" required />
            </div>
            <div className="form-group">
              <label>Descrição</label>
              <textarea className="form-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descreva seu negócio..." rows={3} />
            </div>
          </div>

          <div className="settings-section">
            <h3>📞 Contato & Endereço</h3>
            <div className="form-group">
              <label>WhatsApp (com DDD)</label>
              <input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Ex: 11999998888" required />
            </div>
            <div className="form-group">
              <label>Endereço (opcional)</label>
              <input className="form-input" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Ex: Rua das Flores, 123" />
            </div>
            <div className="form-group">
              <label>Horário de Funcionamento</label>
              <textarea className="form-input" value={form.businessHours} onChange={e => setForm({ ...form, businessHours: e.target.value })} placeholder="Ex: Seg-Sex: 9h às 18h&#10;Sáb: 9h às 13h" rows={3} />
            </div>
            <div className="form-group">
              <label>Cor do Tema</label>
              <div className="color-picker-row">
                <input type="color" value={form.themeColor} onChange={e => setForm({ ...form, themeColor: e.target.value })} />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{form.themeColor}</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '24px', textAlign: 'right' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Salvando...' : '💾 Salvar Alterações'}
          </button>
        </div>
      </form>
    </div>
  );
}

function CategoriesPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [catName, setCatName] = useState('');
  const [error, setError] = useState('');

  const loadCategories = async () => {
    try {
      const data = await categoriesAPI.list();
      setCategories(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCategories(); }, []);

  const handleSave = async () => {
    if (!catName.trim()) return;
    try {
      if (editingCat) {
        await categoriesAPI.update(editingCat.id, { name: catName });
      } else {
        await categoriesAPI.create({ name: catName });
      }
      setCatName('');
      setEditingCat(null);
      setShowModal(false);
      loadCategories();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remover esta categoria?')) return;
    try {
      await categoriesAPI.delete(id);
      loadCategories();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="loading-spinner" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Categorias</h1>
          <p>Organize seus produtos em categorias</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingCat(null); setCatName(''); setShowModal(true); }}>
          ＋ Nova Categoria
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {categories.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <h3>Nenhuma categoria</h3>
          <p>Crie categorias para organizar seus produtos</p>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>Criar Primeira Categoria</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {categories.map(cat => (
            <div key={cat.id} className="category-card">
              <div className="category-card-info">
                <div className="cat-icon">📁</div>
                <div>
                  <h3>{cat.name}</h3>
                  <span>{cat._count?.products || 0} produtos</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn-icon" onClick={() => { setEditingCat(cat); setCatName(cat.name); setShowModal(true); }}>✏️</button>
                <button className="btn-icon" onClick={() => handleDelete(cat.id)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editingCat ? 'Editar Categoria' : 'Nova Categoria'}</h2>
            <div className="form-group">
              <label>Nome da Categoria</label>
              <input className="form-input" value={catName} onChange={e => setCatName(e.target.value)} placeholder="Ex: Cortes de Cabelo" autoFocus onKeyDown={e => e.key === 'Enter' && handleSave()} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProd, setEditingProd] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', price: '', categoryId: '' });
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      const [prods, cats] = await Promise.all([productsAPI.list(), categoriesAPI.list()]);
      setProducts(prods);
      setCategories(cats);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const openNew = () => {
    setEditingProd(null);
    setForm({ name: '', description: '', price: '', categoryId: '' });
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditingProd(p);
    setForm({ name: p.name, description: p.description || '', price: String(p.price), categoryId: p.categoryId ? String(p.categoryId) : '' });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.price) return;
    try {
      if (editingProd) {
        await productsAPI.update(editingProd.id, { ...form, price: parseFloat(form.price), categoryId: form.categoryId || null });
      } else {
        await productsAPI.create({ ...form, price: parseFloat(form.price), categoryId: form.categoryId || null });
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remover este produto?')) return;
    try {
      await productsAPI.delete(id);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleImageUpload = async (prodId, e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    try {
      await productsAPI.uploadImage(prodId, formData);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleActive = async (p) => {
    try {
      await productsAPI.update(p.id, { active: !p.active });
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="loading-spinner" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Produtos</h1>
          <p>Gerencie seus produtos e serviços</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>＋ Novo Produto</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {products.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <h3>Nenhum produto</h3>
          <p>Adicione seus produtos para que os clientes possam vê-los</p>
          <button className="btn btn-primary" onClick={openNew}>Adicionar Primeiro Produto</button>
        </div>
      ) : (
        <div className="items-grid">
          {products.map(p => (
            <div key={p.id} className="item-card">
              <div className="item-card-image">
                {p.imageUrl ? <img src={UPLOADS_URL + p.imageUrl} alt={p.name} /> : <span className="placeholder">📷</span>}
                <label style={{ position: 'absolute', bottom: 8, right: 8, cursor: 'pointer' }}>
                  <span className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem' }}>📷 Foto</span>
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleImageUpload(p.id, e)} />
                </label>
              </div>
              <div className="item-card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <h3>{p.name}</h3>
                  <span className={`badge ${p.active ? 'badge-active' : 'badge-inactive'}`} style={{ cursor: 'pointer' }} onClick={() => toggleActive(p)}>
                    {p.active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                {p.description && <p>{p.description}</p>}
                {p.category && <p style={{ fontSize: '0.8rem' }}>📁 {p.category.name}</p>}
                <div className="item-card-price">R$ {p.price.toFixed(2).replace('.', ',')}</div>
                <div className="item-card-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => openEdit(p)}>✏️ Editar</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p.id)}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editingProd ? 'Editar Produto' : 'Novo Produto'}</h2>
            <div className="form-group">
              <label>Nome</label>
              <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Corte Masculino" autoFocus />
            </div>
            <div className="form-group">
              <label>Descrição (opcional)</label>
              <textarea className="form-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descreva o produto..." rows={2} />
            </div>
            <div className="form-group">
              <label>Preço (R$)</label>
              <input className="form-input" type="number" step="0.01" min="0" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="Ex: 35.00" />
            </div>
            <div className="form-group">
              <label>Categoria</label>
              <select className="form-input" value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">Sem categoria</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSave}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminPage() {
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    adminAPI.getStores()
      .then(setStores)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const toggleStore = async (id) => {
    try {
      await adminAPI.toggleStore(id);
      const data = await adminAPI.getStores();
      setStores(data);
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <div className="loading-spinner" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Administração</h1>
          <p>Gerencie todos os comerciantes da plataforma</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Loja</th>
            <th>Dono</th>
            <th>E-mail</th>
            <th>Plano</th>
            <th>Produtos</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {stores.map(s => (
            <tr key={s.id}>
              <td><strong>{s.name}</strong></td>
              <td>{s.user.name}</td>
              <td>{s.user.email}</td>
              <td><span className={`badge badge-${s.user.plan === 'pro' ? 'pro' : 'free'}`}>{s.user.plan}</span></td>
              <td>{s._count.products}</td>
              <td><span className={`badge badge-${s.active ? 'active' : 'inactive'}`}>{s.active ? 'Ativo' : 'Inativo'}</span></td>
              <td><button className="btn btn-sm btn-secondary" onClick={() => toggleStore(s.id)}>{s.active ? 'Desativar' : 'Ativar'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChatbotPage() {
  const { store } = useAuth();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [products, setProducts] = useState([]);

  useEffect(() => {
    Promise.all([storeAPI.getChatbot(), productsAPI.list()])
      .then(([chatbot, prods]) => {
        setConfig(chatbot);
        setProducts(prods);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const updated = await storeAPI.updateChatbot(config);
      setConfig(updated);
      setSuccess('Chatbot atualizado com sucesso!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading-spinner" />;

  const webhookUrl = `${window.location.protocol}//${window.location.hostname}:3001/api/webhook/${store?.id || ''}`;
  const activeProducts = products.filter(p => p.active);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>🤖 Chatbot WhatsApp</h1>
          <p>Configure o atendimento automático da sua loja</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="settings-grid">
        {/* Coluna esquerda: Configurações */}
        <div className="settings-section">
          <h3>⚡ Ativação do Chatbot</h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', padding: '16px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: `1px solid ${config?.botEnabled ? 'var(--success)' : 'var(--border)'}` }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', flex: 1 }}>
              <div style={{ width: '48px', height: '28px', borderRadius: '14px', background: config?.botEnabled ? 'var(--success)' : 'var(--bg-input)', transition: 'var(--transition)', position: 'relative', cursor: 'pointer' }}
                onClick={() => setConfig({ ...config, botEnabled: !config.botEnabled })}>
                <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: 'white', position: 'absolute', top: '3px', left: config?.botEnabled ? '23px' : '3px', transition: 'var(--transition)', boxShadow: 'var(--shadow-sm)' }} />
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>{config?.botEnabled ? '🟢 Chatbot Ativado' : '🔴 Chatbot Desativado'}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{config?.botEnabled ? 'O bot está respondendo automaticamente' : 'Ative para responder clientes automaticamente'}</div>
              </div>
            </label>
          </div>

          <h3 style={{ marginTop: '24px' }}>💬 Mensagens</h3>
          <div className="form-group">
            <label>Mensagem de Boas-vindas</label>
            <textarea className="form-input" value={config?.botGreeting || ''}
              onChange={e => setConfig({ ...config, botGreeting: e.target.value })}
              placeholder={`Olá! 👋 Bem-vindo(a) à ${store?.name}!\nComo posso te ajudar?`}
              rows={3} />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Essa é a primeira mensagem que o cliente recebe ao enviar qualquer coisa</span>
          </div>

          <div className="form-group">
            <label>Mensagem Fora do Horário (opcional)</label>
            <textarea className="form-input" value={config?.botAwayMessage || ''}
              onChange={e => setConfig({ ...config, botAwayMessage: e.target.value })}
              placeholder="Estamos fora do horário de atendimento. Retornaremos em breve!"
              rows={2} />
          </div>

          <h3 style={{ marginTop: '24px' }}>🔑 API do WhatsApp Business</h3>
          <div style={{ padding: '12px', background: 'rgba(108, 99, 255, 0.08)', borderRadius: 'var(--radius-md)', marginBottom: '16px', border: '1px solid rgba(108, 99, 255, 0.2)' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              💡 Precisa de ajuda? <span style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 600 }}
                onClick={() => setShowGuide(!showGuide)}>{showGuide ? 'Fechar guia ↑' : 'Ver guia passo a passo ↓'}</span>
            </span>
          </div>

          {showGuide && (
            <div style={{ padding: '20px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', marginBottom: '20px', border: '1px solid var(--border)' }}>
              <h4 style={{ marginBottom: '12px' }}>📖 Como configurar o WhatsApp Business API</h4>
              <ol style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                <li>Acesse <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>developers.facebook.com</a> e crie um aplicativo</li>
                <li>Selecione <strong>"Business"</strong> como tipo do app</li>
                <li>No painel, vá em <strong>WhatsApp → Configuração da API</strong></li>
                <li>Copie o <strong>"Phone Number ID"</strong> e cole no campo abaixo</li>
                <li>Gere um <strong>"Access Token"</strong> permanente e cole abaixo</li>
                <li>Na seção <strong>Webhooks</strong>, configure:
                  <ul style={{ marginTop: '6px' }}>
                    <li>URL: <code style={{ background: 'var(--bg-dark)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.8rem' }}>{webhookUrl}</code></li>
                    <li>Token de verificação: o que você definir abaixo</li>
                    <li>Campos: <strong>messages</strong></li>
                  </ul>
                </li>
                <li>Pronto! O chatbot começará a responder automaticamente 🎉</li>
              </ol>
            </div>
          )}

          <div className="form-group">
            <label>Phone Number ID</label>
            <input className="form-input" value={config?.botPhoneId || ''}
              onChange={e => setConfig({ ...config, botPhoneId: e.target.value })}
              placeholder="Ex: 123456789012345" />
          </div>
          <div className="form-group">
            <label>Access Token</label>
            <input className="form-input" type="password" value={config?.botToken || ''}
              onChange={e => setConfig({ ...config, botToken: e.target.value })}
              placeholder="EAAxxxxxxxx..." />
          </div>
          <div className="form-group">
            <label>Token de Verificação do Webhook</label>
            <input className="form-input" value={config?.botWebhookToken || ''}
              onChange={e => setConfig({ ...config, botWebhookToken: e.target.value })}
              placeholder="Crie um token qualquer, ex: meu_token_secreto" />
          </div>

          <div className="form-group" style={{ marginTop: '8px' }}>
            <label>URL do Webhook (copie para o Facebook)</label>
            <div className="store-link-url" style={{ fontSize: '0.8rem' }}>
              <span style={{ flex: 1, wordBreak: 'break-all' }}>{webhookUrl}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(webhookUrl); }}>📋</button>
            </div>
          </div>

          <div style={{ marginTop: '20px', textAlign: 'right' }}>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : '💾 Salvar Configurações'}
            </button>
          </div>
        </div>

        {/* Coluna direita: Preview e Produtos */}
        <div>
          <div className="settings-section" style={{ marginBottom: '24px' }}>
            <h3>📱 Preview do Chatbot</h3>
            <div style={{ background: '#0B141A', borderRadius: 'var(--radius-lg)', padding: '20px', fontFamily: 'system-ui' }}>
              {/* Simulated WhatsApp chat */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {/* Customer message */}
                <div style={{ alignSelf: 'flex-end', background: '#005C4B', color: 'white', padding: '8px 12px', borderRadius: '8px 8px 0 8px', maxWidth: '80%', fontSize: '0.85rem' }}>
                  Oi, tudo bem?
                </div>
                {/* Bot response */}
                <div style={{ alignSelf: 'flex-start', background: '#1F2C34', color: 'white', padding: '10px 14px', borderRadius: '8px 8px 8px 0', maxWidth: '85%', fontSize: '0.85rem' }}>
                  <div style={{ marginBottom: '8px' }}>
                    {config?.botGreeting || `Olá! 👋 Bem-vindo(a) à ${store?.name}!`}
                  </div>
                  <div style={{ color: '#8696A0', fontSize: '0.8rem' }}>Como posso te ajudar?</div>
                </div>
                {/* Buttons */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {['📋 Ver Catálogo', '📦 Todos Produtos', '🛒 Fazer Pedido'].map(btn => (
                    <span key={btn} style={{ padding: '6px 14px', background: '#1F2C34', border: '1px solid #2A3942', borderRadius: '20px', fontSize: '0.8rem', color: '#53BDEB' }}>{btn}</span>
                  ))}
                </div>
                {/* Category selection */}
                <div style={{ alignSelf: 'flex-end', background: '#005C4B', color: 'white', padding: '8px 12px', borderRadius: '8px 8px 0 8px', maxWidth: '80%', fontSize: '0.85rem' }}>
                  📋 Ver Catálogo
                </div>
                {/* Product list */}
                <div style={{ alignSelf: 'flex-start', background: '#1F2C34', color: 'white', padding: '10px 14px', borderRadius: '8px 8px 8px 0', maxWidth: '85%', fontSize: '0.85rem' }}>
                  <div style={{ marginBottom: '6px', fontWeight: 600 }}>📦 Produtos disponíveis:</div>
                  {activeProducts.slice(0, 3).map(p => (
                    <div key={p.id} style={{ padding: '4px 0', borderBottom: '1px solid #2A3942', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{p.name}</span>
                      <span style={{ color: '#25D366', fontWeight: 600, marginLeft: '12px' }}>R$ {p.price.toFixed(2).replace('.', ',')}</span>
                    </div>
                  ))}
                  {activeProducts.length > 3 && <div style={{ color: '#8696A0', fontSize: '0.8rem', marginTop: '4px' }}>+{activeProducts.length - 3} mais...</div>}
                  {activeProducts.length === 0 && <div style={{ color: '#8696A0' }}>Nenhum produto ativo</div>}
                </div>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3>📦 Produtos no Chatbot ({activeProducts.length})</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
              Todos os produtos <strong>ativos</strong> aparecem automaticamente no chatbot. Para remover um produto do bot, desative-o na página de <a href="/dashboard/produtos" style={{ color: 'var(--primary)' }}>Produtos</a>.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
              {activeProducts.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <span style={{ flex: 1, fontSize: '0.9rem' }}>{p.name}</span>
                  <span style={{ color: 'var(--success)', fontWeight: 600, fontSize: '0.85rem' }}>R$ {p.price.toFixed(2).replace('.', ',')}</span>
                  <span className="badge badge-active">Ativo</span>
                </div>
              ))}
              {activeProducts.length === 0 && (
                <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                  Nenhum produto ativo. Adicione produtos primeiro.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({ pending: 0, confirmed: 0, completed: 0, cancelled: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      const [ordersData, statsData] = await Promise.all([
        ordersAPI.list(filter),
        ordersAPI.stats(),
      ]);
      setOrders(ordersData.orders);
      setStats(statsData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [filter]);

  const changeStatus = async (id, status) => {
    try {
      await ordersAPI.updateStatus(id, status);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteOrder = async (id) => {
    if (!confirm('Remover este pedido?')) return;
    try {
      await ordersAPI.delete(id);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const statusConfig = {
    pending: { label: 'Aguardando', emoji: '⏳', color: '#f59e0b' },
    confirmed: { label: 'Confirmado', emoji: '✅', color: '#10b981' },
    completed: { label: 'Concluído', emoji: '🎉', color: '#6366f1' },
    cancelled: { label: 'Cancelado', emoji: '❌', color: '#ef4444' },
  };

  const formatDate = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  const formatPhone = (phone) => {
    const clean = phone.replace(/^55/, '');
    if (clean.length === 11) {
      return `(${clean.slice(0,2)}) ${clean.slice(2,7)}-${clean.slice(7)}`;
    }
    return phone;
  };

  if (loading) return <div className="loading-spinner" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>📊 Pedidos</h1>
          <p>Gerencie os pedidos recebidos pelo chatbot</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '24px' }}>
        <div className="stat-card" onClick={() => setFilter('pending')} style={{ cursor: 'pointer', borderColor: filter === 'pending' ? '#f59e0b' : undefined }}>
          <div className="stat-icon">⏳</div>
          <div className="stat-value">{stats.pending}</div>
          <div className="stat-label">Aguardando</div>
        </div>
        <div className="stat-card" onClick={() => setFilter('confirmed')} style={{ cursor: 'pointer', borderColor: filter === 'confirmed' ? '#10b981' : undefined }}>
          <div className="stat-icon">✅</div>
          <div className="stat-value">{stats.confirmed}</div>
          <div className="stat-label">Confirmados</div>
        </div>
        <div className="stat-card" onClick={() => setFilter('completed')} style={{ cursor: 'pointer', borderColor: filter === 'completed' ? '#6366f1' : undefined }}>
          <div className="stat-icon">🎉</div>
          <div className="stat-value">{stats.completed}</div>
          <div className="stat-label">Concluídos</div>
        </div>
        <div className="stat-card" onClick={() => setFilter('all')} style={{ cursor: 'pointer', borderColor: filter === 'all' ? 'var(--primary)' : undefined }}>
          <div className="stat-icon">📦</div>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total</div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {['all', 'pending', 'confirmed', 'completed', 'cancelled'].map(s => (
          <button key={s}
            onClick={() => setFilter(s)}
            style={{ padding: '8px 16px', borderRadius: 'var(--radius-full)', border: `1px solid ${filter === s ? 'var(--primary)' : 'var(--border)'}`, background: filter === s ? 'var(--primary)' : 'var(--bg-card)', color: filter === s ? 'white' : 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 500, transition: 'var(--transition)' }}>
            {s === 'all' ? '📦 Todos' : `${statusConfig[s]?.emoji} ${statusConfig[s]?.label}`}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {orders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3>Nenhum pedido {filter !== 'all' ? statusConfig[filter]?.label.toLowerCase() : ''}</h3>
          <p>Os pedidos feitos pelo chatbot aparecerão aqui automaticamente</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {orders.map(order => {
            const sc = statusConfig[order.status] || statusConfig.pending;
            return (
              <div key={order.id} style={{ background: 'var(--bg-card)', border: `1px solid var(--border)`, borderRadius: 'var(--radius-lg)', padding: '20px', borderLeft: `4px solid ${sc.color}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Pedido #{order.id}</span>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>{order.product?.name || 'Produto removido'}</h3>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ padding: '4px 12px', borderRadius: 'var(--radius-full)', background: `${sc.color}22`, color: sc.color, fontSize: '0.8rem', fontWeight: 600 }}>
                      {sc.emoji} {sc.label}
                    </span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)' }}>
                      R$ {(order.totalPrice || 0).toFixed(2).replace('.', ',')}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>👤</span>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cliente</div>
                      <div style={{ fontWeight: 600 }}>{order.customerName}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>📱</span>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Telefone</div>
                      <a href={`https://wa.me/${order.customerPhone}`} target="_blank" rel="noreferrer" style={{ color: '#25D366', fontWeight: 600 }}>
                        {formatPhone(order.customerPhone)}
                      </a>
                    </div>
                  </div>
                  {order.scheduledTime && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>🕐</span>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Horário</div>
                        <div style={{ fontWeight: 600, color: '#f59e0b' }}>{order.scheduledTime}</div>
                      </div>
                    </div>
                  )}
                  {order.customerAddress && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>📍</span>
                      <div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Endereço</div>
                        <div style={{ fontWeight: 600 }}>{order.customerAddress}</div>
                      </div>
                    </div>
                  )}
                </div>

                {order.notes && (
                  <div style={{ padding: '10px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', marginBottom: '14px', fontSize: '0.85rem' }}>
                    💬 <em>{order.notes}</em>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>📅 {formatDate(order.createdAt)}</span>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {order.status === 'pending' && (
                      <>
                        <button className="btn btn-sm" style={{ background: '#10b981', color: 'white', border: 'none' }} onClick={() => changeStatus(order.id, 'confirmed')}>✅ Confirmar</button>
                        <button className="btn btn-sm" style={{ background: '#ef4444', color: 'white', border: 'none' }} onClick={() => changeStatus(order.id, 'cancelled')}>❌ Recusar</button>
                      </>
                    )}
                    {order.status === 'confirmed' && (
                      <button className="btn btn-sm" style={{ background: '#6366f1', color: 'white', border: 'none' }} onClick={() => changeStatus(order.id, 'completed')}>🎉 Concluir</button>
                    )}
                    {(order.status === 'completed' || order.status === 'cancelled') && (
                      <button className="btn btn-sm btn-secondary" onClick={() => deleteOrder(order.id)}>🗑️ Remover</button>
                    )}
                    <a href={`https://wa.me/${order.customerPhone}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ background: '#25D366', color: 'white', border: 'none', textDecoration: 'none' }}>💬 WhatsApp</a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="dashboard">
      <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>☰</button>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main-content">
        <Routes>
          <Route index element={<DashboardHome />} />
          <Route path="loja" element={<StoreSettings />} />
          <Route path="categorias" element={<CategoriesPage />} />
          <Route path="produtos" element={<ProductsPage />} />
          <Route path="chatbot" element={<ChatbotPage />} />
          <Route path="pedidos" element={<OrdersPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  );
}
