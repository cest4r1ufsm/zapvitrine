import { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { storeAPI, categoriesAPI, productsAPI, adminAPI, ordersAPI, whatsappAPI, UPLOADS_URL } from '../services/api';
import BillingPage from './BillingPage';
import ProfessionalsPage from './ProfessionalsPage';
import BlockedSlotsPage from './BlockedSlotsPage';
import ClientsPage from './ClientsPage';
import AgendaPage from './AgendaPage';
import OnboardingModal, { useOnboarding, STORAGE_KEY as ONBOARDING_KEY } from './OnboardingModal';
import PageGuide from '../components/PageGuide';

function Sidebar({ open, onClose }) {
  const { user, store, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/');
  const [theme, setTheme] = useState(() => localStorage.getItem('pedidoprontobot_theme') || 'light');

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('pedidoprontobot_theme', next);
    setTheme(next);
  };

  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-header">
        <Link to="/" className="sidebar-logo-link">
          <img src="/agtgestor-logo.svg" alt="AGTGestor" className="sidebar-logo-img" />
        </Link>
        <p>{store?.name || 'Minha Agenda'}</p>
      </div>
      <nav className="sidebar-nav">
        <Link to="/dashboard" className={`sidebar-link${isActive('/dashboard') && !isActive('/dashboard/loja') && !isActive('/dashboard/categorias') && !isActive('/dashboard/servicos') && !isActive('/dashboard/agenda') && !isActive('/dashboard/chatbot') && !isActive('/dashboard/pedidos') && !isActive('/dashboard/admin') ? ' active' : ''}`} onClick={onClose}>
          <span className="icon">🏠</span> Início
        </Link>
        <Link to="/dashboard/loja" className={`sidebar-link${isActive('/dashboard/loja') ? ' active' : ''}`} onClick={onClose}>
          <span className="icon">🏪</span> Minha Loja
        </Link>
        <Link to="/dashboard/categorias" className={`sidebar-link${isActive('/dashboard/categorias') ? ' active' : ''}`} onClick={onClose}>
          <span className="icon">📁</span> Categorias
        </Link>
        <Link to="/dashboard/servicos" className={`sidebar-link${isActive('/dashboard/servicos') ? ' active' : ''}`} onClick={onClose}>
          <span className="icon">🛠️</span> Serviços
        </Link>
        <Link to="/dashboard/agenda" className={`sidebar-link${isActive('/dashboard/agenda') ? ' active' : ''}`} onClick={onClose}>
          <span className="icon">📅</span> Agenda
        </Link>
        <Link to="/dashboard/chatbot" className={`sidebar-link${isActive('/dashboard/chatbot') ? ' active' : ''}`} onClick={onClose}>
          <span className="icon">🤖</span> Chatbot
        </Link>
        <Link to="/dashboard/pedidos" className={`sidebar-link${isActive('/dashboard/pedidos') ? ' active' : ''}`} onClick={onClose}>
          <span className="icon">📊</span> Pedidos
        </Link>
        <Link to="/dashboard/profissionais" className={`sidebar-link${isActive('/dashboard/profissionais') ? ' active' : ''}`} onClick={onClose}>
          <span className="icon">👥</span> Profissionais
        </Link>
        <Link to="/dashboard/bloqueios" className={`sidebar-link${isActive('/dashboard/bloqueios') ? ' active' : ''}`} onClick={onClose}>
          <span className="icon">🚫</span> Bloqueios
        </Link>
        <Link to="/dashboard/clientes" className={`sidebar-link${isActive('/dashboard/clientes') ? ' active' : ''}`} onClick={onClose}>
          <span className="icon">📇</span> Clientes
        </Link>
        <Link to="/dashboard/billing" className={`sidebar-link${isActive('/dashboard/billing') ? ' active' : ''}`} onClick={onClose}>
          <span className="icon">💳</span> Assinatura
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

function OnboardingChecklist({ products, store, professionals }) {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('agtgestor_checklist_done') === 'true');

  const steps = [
    { done: !!(store?.schedulingConfig), label: 'Configurar horários de atendimento', path: '/dashboard/loja', desc: 'Defina os dias e horários que você trabalha' },
    { done: products.length > 0, label: 'Cadastrar pelo menos um serviço', path: '/dashboard/servicos', desc: 'Adicione seus serviços com preço e duração' },
    { done: professionals?.length > 0, label: 'Adicionar profissionais (opcional)', path: '/dashboard/profissionais', desc: 'Cadastre sua equipe para seleção no chatbot' },
    { done: store?.botEnabled, label: 'Conectar o WhatsApp', path: '/dashboard/chatbot', desc: 'Escaneie o QR Code para ativar o chatbot' },
  ];

  const completed = steps.filter(s => s.done).length;
  const allDone = completed === steps.length;

  if (dismissed) return null;

  return (
    <div style={{ background: allDone ? '#f0fdf4' : '#f8f8ff', border: `1px solid ${allDone ? '#86efac' : '#c4b5fd'}`, borderRadius: 14, padding: '20px 24px', marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h3 style={{ margin: '0 0 4px', fontSize: 17 }}>{allDone ? '🎉 Configuração completa!' : '🚀 Configure seu sistema'}</h3>
          <p style={{ margin: 0, fontSize: 13, color: '#666' }}>{allDone ? 'Seu sistema está pronto para receber agendamentos.' : `${completed} de ${steps.length} etapas concluídas`}</p>
        </div>
        {allDone && <button onClick={() => { setDismissed(true); localStorage.setItem('agtgestor_checklist_done','true'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 20 }}>✕</button>}
      </div>
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {steps.map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', borderRadius: 10, padding: '10px 14px', border: `1px solid ${step.done ? '#86efac' : '#e5e7eb'}`, cursor: step.done ? 'default' : 'pointer' }}
            onClick={() => !step.done && navigate(step.path)}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: step.done ? '#10b981' : '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14, color: step.done ? '#fff' : '#aaa', fontWeight: 700 }}>
              {step.done ? '✓' : i + 1}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: step.done ? '#059669' : '#333', textDecoration: step.done ? 'line-through' : 'none' }}>{step.label}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 1 }}>{step.desc}</div>
            </div>
            {!step.done && <span style={{ color: '#6C63FF', fontSize: 13, fontWeight: 600 }}>Configurar →</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardHome() {
  const { store } = useAuth();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [copied, setCopied] = useState(false);
  const { show: showOnboarding, setShow: setShowOnboarding } = useOnboarding();

  useEffect(() => {
    productsAPI.list().then(setProducts).catch(() => {});
    categoriesAPI.list().then(setCategories).catch(() => {});
    import('../services/api').then(m => m.default.get('/professionals').then(setProfessionals).catch(() => {}));
  }, []);

  const storeUrl = `${window.location.origin}/loja/${store?.slug || ''}`;

  const copyLink = () => {
    navigator.clipboard.writeText(storeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      {showOnboarding && <OnboardingModal onClose={() => setShowOnboarding(false)} />}
      <div className="page-header">
        <div>
          <h1>Olá, {store?.name || 'Lojista'}! 👋</h1>
          <p>Aqui está o resumo da sua vitrine</p>
        </div>
        <button onClick={() => { localStorage.removeItem(ONBOARDING_KEY); setShowOnboarding(true); }}
          style={{ background: '#f0efff', border: '1px solid #c4b5fd', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, color: '#6C63FF', fontWeight: 600 }}>
          📖 Ver tutorial
        </button>
      </div>
      <OnboardingChecklist products={products} store={store} professionals={professionals} />

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
          <div className="stat-icon">🛠️</div>
          <div className="stat-value">{products.length}</div>
          <div className="stat-label">Serviços cadastrados</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">📁</div>
          <div className="stat-value">{categories.length}</div>
          <div className="stat-label">Categorias</div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">✅</div>
          <div className="stat-value">{products.filter(p => p.active).length}</div>
          <div className="stat-label">Serviços ativos</div>
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
            {products.length === 0 && 'Adicione seus primeiros serviços em "Serviços".'}
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
            {!store?.phone && <Link to="/dashboard/loja" className="btn btn-primary">Configurar Loja</Link>}
            {products.length === 0 && <Link to="/dashboard/servicos" className="btn btn-secondary">Adicionar Serviços</Link>}
          </div>
        </div>
      )}
    </div>
  );
}

function StoreSettings() {
  const { store, refreshStore } = useAuth();
  const DEFAULT_SCHED = { slotInterval: 30, hours: { monday:{active:true,open:'09:00',close:'18:00'}, tuesday:{active:true,open:'09:00',close:'18:00'}, wednesday:{active:true,open:'09:00',close:'18:00'}, thursday:{active:true,open:'09:00',close:'18:00'}, friday:{active:true,open:'09:00',close:'18:00'}, saturday:{active:true,open:'09:00',close:'13:00'}, sunday:{active:false,open:'09:00',close:'18:00'} } };
  const [form, setForm] = useState({ name: '', slug: '', description: '', phone: '', address: '', themeColor: '#6C63FF', businessHours: '' });
  const [sched, setSched] = useState(DEFAULT_SCHED);
  const DAY_NAMES = [{key:'monday',label:'Segunda'},{key:'tuesday',label:'Terça'},{key:'wednesday',label:'Quarta'},{key:'thursday',label:'Quinta'},{key:'friday',label:'Sexta'},{key:'saturday',label:'Sábado'},{key:'sunday',label:'Domingo'}];
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
      if (store.schedulingConfig) {
        try { setSched(JSON.parse(store.schedulingConfig)); } catch {}
      }
    }
  }, [store]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await storeAPI.update({ ...form, schedulingConfig: JSON.stringify(sched) });
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

      <PageGuide pageKey="store-settings" title="Como configurar sua loja" steps={[
        'Preencha o <strong>nome, telefone e endereço</strong> da sua empresa nas informações básicas.',
        'Em <strong>Configuração de Agenda</strong>, ative os dias que você atende marcando a caixinha de cada dia.',
        'Defina o <strong>horário de início e fim</strong> de cada dia ativo — o chatbot só vai oferecer horários dentro desse intervalo.',
        'O <strong>intervalo entre slots</strong> define o espaçamento dos horários (30 min = oferece 9:00, 9:30, 10:00... | 60 min = 9:00, 10:00, 11:00...).',
        'Clique em <strong>Salvar Alterações</strong> no final da página para confirmar tudo.',
      ]} color="#f59e0b" />

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
              <label>Horário de Funcionamento (descrição)</label>
              <textarea className="form-input" value={form.businessHours} onChange={e => setForm({ ...form, businessHours: e.target.value })} placeholder="Ex: Seg-Sex: 9h às 18h&#10;Sáb: 9h às 13h" rows={2} />
            </div>
            <div className="form-group">
              <label>⚙️ Configuração de Agenda (para agendamento automático)</label>
              <div style={{ background: '#f8f8ff', border: '1px solid #e0dfff', borderRadius: 10, padding: '12px 14px', marginTop: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Intervalo entre slots:</span>
                  <select style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }} value={sched.slotInterval} onChange={e => setSched(s => ({ ...s, slotInterval: parseInt(e.target.value) }))}>
                    {[15,20,30,45,60].map(v => <option key={v} value={v}>{v} min</option>)}
                  </select>
                </div>
                {DAY_NAMES.map(({ key, label }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, width: 90, cursor: 'pointer' }}>
                      <input type="checkbox" checked={sched.hours[key]?.active ?? false}
                        onChange={e => setSched(s => ({ ...s, hours: { ...s.hours, [key]: { ...s.hours[key], active: e.target.checked } } }))} />
                      <span style={{ fontSize: 13, fontWeight: sched.hours[key]?.active ? 600 : 400, color: sched.hours[key]?.active ? '#333' : '#aaa' }}>{label}</span>
                    </label>
                    {sched.hours[key]?.active && (
                      <>
                        <input type="time" style={{ padding: '3px 6px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}
                          value={sched.hours[key]?.open || '09:00'}
                          onChange={e => setSched(s => ({ ...s, hours: { ...s.hours, [key]: { ...s.hours[key], open: e.target.value } } }))} />
                        <span style={{ fontSize: 12, color: '#888' }}>até</span>
                        <input type="time" style={{ padding: '3px 6px', borderRadius: 6, border: '1px solid #ddd', fontSize: 13 }}
                          value={sched.hours[key]?.close || '18:00'}
                          onChange={e => setSched(s => ({ ...s, hours: { ...s.hours, [key]: { ...s.hours[key], close: e.target.value } } }))} />
                      </>
                    )}
                    {!sched.hours[key]?.active && <span style={{ fontSize: 12, color: '#aaa' }}>— Fechado</span>}
                  </div>
                ))}
              </div>
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
          <p>Organize seus serviços em categorias</p>
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
          <p>Crie categorias para organizar seus serviços</p>
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
                  <span>{cat._count?.products || 0} serviços</span>
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

function ServicesPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProd, setEditingProd] = useState(null);
  const [form, setForm] = useState({ name: '', description: '', price: '', categoryId: '', duration: '30', bufferTime: '0' });
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
    setForm({ name: '', description: '', price: '', categoryId: '', duration: '30', bufferTime: '0' });
    setShowModal(true);
  };

  const openEdit = (p) => {
    setEditingProd(p);
    setForm({ name: p.name, description: p.description || '', price: String(p.price), categoryId: p.categoryId ? String(p.categoryId) : '', duration: String(p.duration ?? 30), bufferTime: String(p.bufferTime ?? 0) });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.price) return;
    try {
      if (editingProd) {
        await productsAPI.update(editingProd.id, { ...form, price: parseFloat(form.price), categoryId: form.categoryId || null, duration: parseInt(form.duration)||30, bufferTime: parseInt(form.bufferTime)||0 });
      } else {
        await productsAPI.create({ ...form, price: parseFloat(form.price), categoryId: form.categoryId || null, duration: parseInt(form.duration)||30, bufferTime: parseInt(form.bufferTime)||0 });
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remover este serviço?')) return;
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
          <h1>Serviços</h1>
          <p>Gerencie seus serviços</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>＋ Novo Serviço</button>
      </div>

      <PageGuide pageKey="services" title="Como cadastrar serviços" steps={[
        'Clique em <strong>+ Novo Serviço</strong> para adicionar um serviço (ex: Corte Masculino, Barba, Manicure).',
        'Preencha o <strong>nome</strong>, <strong>preço</strong> e, muito importante, a <strong>duração em minutos</strong> — o sistema usa isso para calcular os horários disponíveis.',
        'O campo <strong>Intervalo após</strong> é o tempo de descanso/limpeza depois do atendimento. Ex: 10 min de limpeza após cada corte.',
        'Serviços <strong>inativos</strong> (clique no toggle de status) não aparecem para agendamento no chatbot.',
        'Você pode adicionar uma <strong>foto</strong> ao serviço — ela aparece na vitrine pública da sua loja.',
      ]} />

      {error && <div className="alert alert-error">{error}</div>}

      {products.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🛠️</div>
          <h3>Nenhum serviço</h3>
          <p>Adicione seus serviços para que os clientes possam vê-los</p>
          <button className="btn btn-primary" onClick={openNew}>Adicionar Primeiro Serviço</button>
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
            <h2>{editingProd ? 'Editar Serviço' : 'Novo Serviço'}</h2>
            <div className="form-group">
              <label>Nome</label>
              <input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ex: Corte Masculino" autoFocus />
            </div>
            <div className="form-group">
              <label>Descrição (opcional)</label>
              <textarea className="form-input" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descreva o serviço..." rows={2} />
            </div>
            <div className="form-group">
              <label>Preço (R$)</label>
              <input className="form-input" type="number" step="0.01" min="0" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="Ex: 35.00" />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>⏱ Duração (min)</label>
                <input className="form-input" type="number" min="5" step="5" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} placeholder="30" />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>🔄 Intervalo após (min)</label>
                <input className="form-input" type="number" min="0" step="5" value={form.bufferTime} onChange={e => setForm({ ...form, bufferTime: e.target.value })} placeholder="0" />
              </div>
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
            <th>Serviços</th>
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
  const [products, setProducts] = useState([]);
  const [waStatus, setWaStatus] = useState({ status: 'disconnected', qr: null, phone: null, error: null });
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    Promise.all([storeAPI.getChatbot(), productsAPI.list(), whatsappAPI.status()])
      .then(([chatbot, prods, status]) => {
        setConfig(chatbot);
        setProducts(prods);
        setWaStatus(status);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Poll WhatsApp status while connecting or waiting for QR scan
  useEffect(() => {
    const shouldPoll = waStatus.status === 'connecting' || waStatus.status === 'qr' || waStatus.status === 'reconnecting';
    if (!shouldPoll) return;
    const interval = setInterval(async () => {
      try {
        const status = await whatsappAPI.status();
        setWaStatus(status);
        if (status.status === 'connected' || status.status === 'disconnected' || status.status === 'error') {
          clearInterval(interval);
          setConnecting(false);
        }
      } catch (err) {
        console.error('Poll error:', err);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [waStatus.status]);

  const handleConnect = async () => {
    setConnecting(true);
    setError('');
    try {
      const result = await whatsappAPI.connect();
      setWaStatus(result);
    } catch (err) {
      setError(err.message);
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Desconectar o WhatsApp? O chatbot será desativado.')) return;
    setDisconnecting(true);
    setError('');
    try {
      await whatsappAPI.disconnect();
      setWaStatus({ status: 'disconnected', qr: null, phone: null, error: null });
      setConfig(prev => ({ ...prev, botEnabled: false }));
    } catch (err) {
      setError(err.message);
    } finally {
      setDisconnecting(false);
    }
  };

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

  const activeProducts = products.filter(p => p.active);
  const isConnected = waStatus.status === 'connected';

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
          <h3>📱 Conexão com WhatsApp</h3>

          {/* Status card */}
          <div style={{ padding: '20px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: `1px solid ${isConnected ? 'var(--success)' : 'var(--border)'}`, marginBottom: '24px' }}>
            {isConnected ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 6px var(--success)' }} />
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--success)' }}>WhatsApp Conectado</div>
                    {waStatus.phone && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>+{waStatus.phone}</div>}
                  </div>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  O chatbot está ativo e respondendo automaticamente seus clientes pelo WhatsApp.
                </p>
                <button className="btn btn-secondary" onClick={handleDisconnect} disabled={disconnecting} style={{ width: '100%' }}>
                  {disconnecting ? 'Desconectando...' : '🔌 Desconectar WhatsApp'}
                </button>
              </div>
            ) : waStatus.status === 'qr' && waStatus.qr ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontWeight: 600, marginBottom: '12px' }}>📷 Escaneie o QR Code</div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Abra o WhatsApp no seu celular → Menu → Dispositivos conectados → Conectar dispositivo
                </p>
                <img src={waStatus.qr} alt="QR Code WhatsApp" style={{ width: '220px', height: '220px', borderRadius: 'var(--radius-md)', border: '4px solid var(--border)' }} />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '12px' }}>O QR Code expira em 60 segundos. Aguardando leitura...</p>
              </div>
            ) : waStatus.status === 'connecting' || waStatus.status === 'reconnecting' ? (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <div className="loading-spinner" style={{ margin: '0 auto 16px' }} />
                <div style={{ fontWeight: 600 }}>Aguardando QR Code...</div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '8px' }}>Isso pode levar alguns segundos</p>
              </div>
            ) : waStatus.status === 'error' ? (
              <div>
                <div style={{ color: 'var(--error)', fontWeight: 600, marginBottom: '8px' }}>❌ Erro de conexão</div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>{waStatus.error || 'Não foi possível conectar. Tente novamente.'}</p>
                <button className="btn btn-primary" onClick={handleConnect} disabled={connecting} style={{ width: '100%' }}>
                  🔄 Tentar Novamente
                </button>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                  <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>WhatsApp Desconectado</div>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Conecte seu WhatsApp para ativar o chatbot. É rápido — basta escanear um QR Code com o celular.
                </p>
                <ol style={{ paddingLeft: '18px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <li>Clique em <strong>"Conectar WhatsApp"</strong></li>
                  <li>Abra o WhatsApp no seu celular</li>
                  <li>Vá em <strong>Menu → Dispositivos conectados → Conectar dispositivo</strong></li>
                  <li>Escaneie o QR Code que aparecerá aqui</li>
                </ol>
                <button className="btn btn-primary" onClick={handleConnect} disabled={connecting} style={{ width: '100%' }}>
                  {connecting ? 'Iniciando...' : '📱 Conectar WhatsApp'}
                </button>
              </div>
            )}
          </div>

          {isConnected && (
            <>
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

              <h3 style={{ marginTop: '8px' }}>💬 Mensagens</h3>
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

              <div style={{ marginTop: '20px', textAlign: 'right' }}>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                  {saving ? 'Salvando...' : '💾 Salvar Configurações'}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Coluna direita: Preview e Produtos */}
        <div>
          <div className="settings-section" style={{ marginBottom: '24px' }}>
            <h3>📱 Preview do Chatbot</h3>
            <div style={{ background: '#0B141A', borderRadius: 'var(--radius-lg)', padding: '20px', fontFamily: 'system-ui' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ alignSelf: 'flex-end', background: '#005C4B', color: 'white', padding: '8px 12px', borderRadius: '8px 8px 0 8px', maxWidth: '80%', fontSize: '0.85rem' }}>
                  Oi, tudo bem?
                </div>
                <div style={{ alignSelf: 'flex-start', background: '#1F2C34', color: 'white', padding: '10px 14px', borderRadius: '8px 8px 8px 0', maxWidth: '85%', fontSize: '0.85rem' }}>
                  <div style={{ marginBottom: '8px' }}>
                    {config?.botGreeting || `Olá! 👋 Bem-vindo(a) à ${store?.name}!`}
                  </div>
                  <div style={{ color: '#8696A0', fontSize: '0.8rem' }}>Como posso te ajudar?</div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {['📋 Ver Catálogo', '🛒 Fazer Pedido', '📄 Meus Pedidos'].map(btn => (
                    <span key={btn} style={{ padding: '6px 14px', background: '#1F2C34', border: '1px solid #2A3942', borderRadius: '20px', fontSize: '0.8rem', color: '#53BDEB' }}>{btn}</span>
                  ))}
                </div>
                <div style={{ alignSelf: 'flex-end', background: '#005C4B', color: 'white', padding: '8px 12px', borderRadius: '8px 8px 0 8px', maxWidth: '80%', fontSize: '0.85rem' }}>
                  📋 Ver Catálogo
                </div>
                <div style={{ alignSelf: 'flex-start', background: '#1F2C34', color: 'white', padding: '10px 14px', borderRadius: '8px 8px 8px 0', maxWidth: '85%', fontSize: '0.85rem' }}>
                  <div style={{ marginBottom: '6px', fontWeight: 600 }}>🛠️ Serviços disponíveis:</div>
                  {activeProducts.slice(0, 3).map(p => (
                    <div key={p.id} style={{ padding: '4px 0', borderBottom: '1px solid #2A3942', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{p.name}</span>
                      <span style={{ color: '#25D366', fontWeight: 600, marginLeft: '12px' }}>R$ {p.price.toFixed(2).replace('.', ',')}</span>
                    </div>
                  ))}
                  {activeProducts.length > 3 && <div style={{ color: '#8696A0', fontSize: '0.8rem', marginTop: '4px' }}>+{activeProducts.length - 3} mais...</div>}
                  {activeProducts.length === 0 && <div style={{ color: '#8696A0' }}>Nenhum serviço ativo</div>}
                </div>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3>🛠️ Serviços no Chatbot ({activeProducts.length})</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px' }}>
              Todos os serviços <strong>ativos</strong> aparecem automaticamente no chatbot. Para remover um serviço do bot, desative-o na página de <a href="/dashboard/servicos" style={{ color: 'var(--primary)' }}>Serviços</a>.
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
                  Nenhum serviço ativo. Adicione serviços primeiro.
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

function ChatbotPaywall() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>🤖 Chatbot WhatsApp</h1>
          <p>Conecte seu WhatsApp e comece a atender automaticamente</p>
        </div>
      </div>
      <div className="card" style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔒</div>
        <h2 style={{ marginBottom: '16px' }}>Recurso Premium</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '32px', maxWidth: '500px', margin: '0 auto 32px', lineHeight: '1.6' }}>
          O Chatbot Automático é uma funcionalidade exclusiva para assinantes Premium. 
          Desbloqueie agora para conectar o sistema ao seu número e assistir o robô receber pedidos sozinho 24/7.
        </p>
        <Link to="/dashboard/billing" className="btn btn-primary" style={{ padding: '16px 32px', fontSize: '1.1rem', fontWeight: 600 }}>
          ✨ Desbloquear Chatbot Premium
        </Link>
      </div>
    </div>
  );
}

function _AgendaPageLegacy_REMOVED() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(null);

  useEffect(() => {
    ordersAPI.list('all')
      .then(data => setOrders(data.orders || []))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const scheduled = orders.filter(o => o.scheduledTime);

  // Calendar helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const weekDays = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  // Map orders by creation day (day of month, same month/year)
  const ordersByDay = {};
  scheduled.forEach(o => {
    const d = new Date(o.createdAt);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!ordersByDay[day]) ordersByDay[day] = [];
      ordersByDay[day].push(o);
    }
  });

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const statusConfig = {
    pending:   { label: 'Aguardando', color: '#f59e0b' },
    confirmed: { label: 'Confirmado', color: '#10b981' },
    completed: { label: 'Concluído',  color: '#6366f1' },
    cancelled: { label: 'Cancelado',  color: '#ef4444' },
  };

  const selectedOrders = selectedDay ? (ordersByDay[selectedDay] || []) : scheduled;

  if (loading) return <div className="loading-spinner" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>📅 Agenda</h1>
          <p>Visualize os agendamentos em formato de calendário</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {/* Calendário */}
      <div className="settings-section" style={{ marginBottom: '24px' }}>
        {/* Navegação do mês */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <button className="btn btn-secondary btn-sm" onClick={prevMonth}>‹ Anterior</button>
          <h3 style={{ margin: 0, fontWeight: 700 }}>{monthNames[month]} {year}</h3>
          <button className="btn btn-secondary btn-sm" onClick={nextMonth}>Próximo ›</button>
        </div>

        {/* Dias da semana */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
          {weekDays.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', padding: '4px 0' }}>{d}</div>
          ))}
        </div>

        {/* Células do calendário */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
            const hasOrders = !!ordersByDay[day];
            const isSelected = selectedDay === day;
            return (
              <div
                key={day}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                style={{
                  padding: '8px 4px',
                  borderRadius: 'var(--radius-sm)',
                  textAlign: 'center',
                  cursor: hasOrders ? 'pointer' : 'default',
                  background: isSelected ? 'var(--primary)' : isToday ? 'rgba(108,99,255,0.12)' : 'var(--bg-elevated)',
                  border: `1px solid ${isSelected ? 'var(--primary)' : isToday ? 'var(--primary)' : 'var(--border)'}`,
                  color: isSelected ? 'white' : 'var(--text-primary)',
                  position: 'relative',
                  transition: 'var(--transition)',
                  minHeight: '48px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '4px',
                }}
              >
                <span style={{ fontSize: '0.9rem', fontWeight: isToday ? 700 : 400 }}>{day}</span>
                {hasOrders && (
                  <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {ordersByDay[day].slice(0, 3).map(o => (
                      <div key={o.id} style={{ width: '7px', height: '7px', borderRadius: '50%', background: isSelected ? 'rgba(255,255,255,0.8)' : (statusConfig[o.status]?.color || '#6366f1') }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {selectedDay && (
          <div style={{ marginTop: '12px', padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            Mostrando agendamentos do dia <strong>{selectedDay} de {monthNames[month]}</strong> —{' '}
            <span style={{ color: 'var(--primary)', cursor: 'pointer' }} onClick={() => setSelectedDay(null)}>ver todos</span>
          </div>
        )}
      </div>

      {/* Lista de agendamentos */}
      <div className="settings-section">
        <h3 style={{ marginBottom: '16px' }}>
          {selectedDay ? `Agendamentos — ${selectedDay} de ${monthNames[month]}` : 'Todos os Agendamentos'}
          <span style={{ marginLeft: '10px', fontSize: '0.85rem', fontWeight: 400, color: 'var(--text-muted)' }}>({selectedOrders.length})</span>
        </h3>

        {selectedOrders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📅</div>
            <h3>{selectedDay ? 'Nenhum agendamento neste dia' : 'Nenhum agendamento ainda'}</h3>
            <p>Os agendamentos feitos pelo chatbot aparecerão aqui</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {selectedOrders.map(order => {
              const sc = statusConfig[order.status] || statusConfig.pending;
              const d = new Date(order.createdAt);
              return (
                <div key={order.id} style={{ background: 'var(--bg-elevated)', border: `1px solid var(--border)`, borderLeft: `4px solid ${sc.color}`, borderRadius: 'var(--radius-md)', padding: '16px', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 700 }}>{order.customerName}</span>
                      <span style={{ padding: '2px 10px', borderRadius: 'var(--radius-full)', background: `${sc.color}22`, color: sc.color, fontSize: '0.75rem', fontWeight: 600 }}>{sc.label}</span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <span>🛠️ {order.product?.name || 'Serviço removido'}</span>
                      <span>🕐 <strong style={{ color: 'var(--text-primary)' }}>{order.scheduledTime}</strong></span>
                      <span>📱 <a href={`https://wa.me/${order.customerPhone}`} target="_blank" rel="noreferrer" style={{ color: '#25D366' }}>{order.customerPhone}</a></span>
                      {order.notes && <span>💬 {order.notes}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--success)' }}>R$ {(order.totalPrice || 0).toFixed(2).replace('.', ',')}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{d.toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { store } = useAuth();
  const isPremium =
    store?.subscriptionStatus === 'active' ||
    (store?.trialEndsAt && new Date(store.trialEndsAt) > new Date());

  return (
    <div className="dashboard dashboard-light">
      <div className="dashboard-glow" aria-hidden="true" />
      <button className="menu-toggle" onClick={() => setSidebarOpen(true)}>☰</button>
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} style={{position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99}} />}
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className="main-content">
        <Routes>
          <Route path="" element={<DashboardHome />} />
          <Route path="loja" element={<StoreSettings />} />
          <Route path="categorias" element={<CategoriesPage />} />
          <Route path="servicos" element={<ServicesPage />} />
          <Route path="agenda" element={<AgendaPage />} />
          <Route path="chatbot" element={isPremium ? <ChatbotPage /> : <ChatbotPaywall />} />
          <Route path="pedidos" element={<OrdersPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="profissionais" element={<ProfessionalsPage />} />
          <Route path="bloqueios" element={<BlockedSlotsPage />} />
          <Route path="clientes" element={<ClientsPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Routes>
      </main>
    </div>
  );
}
