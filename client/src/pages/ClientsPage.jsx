import { useState, useEffect } from 'react';
import api from '../services/api';
import PageGuide from '../components/PageGuide';

const GUIDE_STEPS = [
  'Esta lista é <strong>preenchida automaticamente</strong> — todo cliente que agendar pelo chatbot aparece aqui com nome e telefone.',
  'Use a <strong>barra de busca</strong> para encontrar um cliente por nome ou número de telefone.',
  'Clique em qualquer cliente para ver o <strong>histórico completo</strong>: todos os serviços realizados, datas, profissionais e valores.',
  'Ótimo para fidelização: você sabe quando foi a última visita e quais serviços o cliente prefere.',
];

const STATUS_LABEL = { pending: 'Aguardando', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado' };
const STATUS_COLOR = { pending: '#f59e0b', confirmed: '#3b82f6', completed: '#10b981', cancelled: '#ef4444' };

function formatDate(str) {
  const d = new Date(str);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function HistoryModal({ client, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/clients/${client.phone}/history`)
      .then(data => setData(data))
      .catch(() => setData({ orders: [] }))
      .finally(() => setLoading(false));
  }, [client.phone]);

  return (
    <div style={modal.overlay} onClick={onClose}>
      <div style={modal.box} onClick={e => e.stopPropagation()}>
        <div style={modal.header}>
          <div>
            <h2 style={{ margin: 0 }}>📋 Histórico</h2>
            <div style={{ color: '#666', fontSize: 14 }}>{client.name} · {client.phone}</div>
          </div>
          <button style={modal.closeBtn} onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Carregando...</div>
        ) : data.orders.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Nenhum agendamento encontrado.</div>
        ) : (
          <div style={modal.list}>
            {data.orders.map(order => (
              <div key={order.id} style={modal.item}>
                <div style={modal.itemTop}>
                  <span style={modal.itemService}>{order.product?.name || 'Serviço'}</span>
                  <span style={{ ...modal.itemStatus, background: STATUS_COLOR[order.status] + '22', color: STATUS_COLOR[order.status] }}>
                    {STATUS_LABEL[order.status] || order.status}
                  </span>
                </div>
                <div style={modal.itemDetail}>
                  {order.professional && <span>👤 {order.professional.name} · </span>}
                  {order.scheduledTime && <span>🕐 {order.scheduledTime} · </span>}
                  <span>📅 {formatDate(order.createdAt)}</span>
                  {order.totalPrice != null && <span> · 💰 R$ {order.totalPrice.toFixed(2).replace('.', ',')}</span>}
                </div>
                {order.notes && <div style={modal.itemNotes}>💬 {order.notes}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/clients')
      .then(data => setClients(data))
      .catch(() => setError('Erro ao carregar clientes'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  if (loading) return <div style={styles.loading}>Carregando...</div>;

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>📇 Clientes</h1>
      <p style={styles.subtitle}>Lista de clientes que já realizaram agendamentos. Clique em um cliente para ver o histórico completo.</p>

      <PageGuide pageKey="clients" title="Como usar a lista de clientes" steps={GUIDE_STEPS} color="#10b981" />

      {error && <div style={styles.error}>{error}</div>}

      <input
        style={styles.search}
        placeholder="🔍  Buscar por nome ou telefone..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {filtered.length === 0 ? (
        <div style={styles.empty}>
          {search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.\nOs clientes aparecerão aqui automaticamente após realizarem agendamentos pelo chatbot.'}
        </div>
      ) : (
        <div style={styles.list}>
          {filtered.map(client => (
            <div key={client.id} style={styles.card} onClick={() => setSelected(client)}>
              <div style={styles.avatar}>{client.name[0].toUpperCase()}</div>
              <div style={styles.info}>
                <div style={styles.name}>{client.name}</div>
                <div style={styles.phone}>📞 {client.phone}</div>
              </div>
              <div style={styles.meta}>
                <div style={styles.count}>{client.totalOrders} agendamento{client.totalOrders !== 1 ? 's' : ''}</div>
                {client.lastOrder && (
                  <div style={styles.last}>Último: {formatDate(client.lastOrder.createdAt)}</div>
                )}
              </div>
              <div style={styles.arrow}>›</div>
            </div>
          ))}
        </div>
      )}

      {selected && <HistoryModal client={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

const styles = {
  container: { maxWidth: 780, margin: '0 auto', padding: '32px 16px' },
  title: { fontSize: 26, fontWeight: 700, marginBottom: 6 },
  subtitle: { color: '#666', marginBottom: 24, fontSize: 14 },
  error: { background: '#fee2e2', color: '#dc2626', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 },
  loading: { textAlign: 'center', padding: 60, color: '#888' },
  search: { width: '100%', padding: '12px 16px', borderRadius: 10, border: '1px solid #ddd', fontSize: 15, marginBottom: 20, boxSizing: 'border-box' },
  empty: { textAlign: 'center', padding: 48, color: '#666', background: '#f9f9f9', borderRadius: 12, whiteSpace: 'pre-line' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '14px 18px', cursor: 'pointer', transition: 'box-shadow 0.15s' },
  avatar: { width: 44, height: 44, borderRadius: '50%', background: '#6C63FF', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 20, flexShrink: 0 },
  info: { flex: 1 },
  name: { fontWeight: 600, fontSize: 16 },
  phone: { fontSize: 13, color: '#888', marginTop: 2 },
  meta: { textAlign: 'right' },
  count: { fontWeight: 600, fontSize: 14, color: '#6C63FF' },
  last: { fontSize: 12, color: '#aaa', marginTop: 2 },
  arrow: { fontSize: 22, color: '#ccc', marginLeft: 4 },
};

const modal = {
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  box: { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '20px 24px', borderBottom: '1px solid #eee' },
  closeBtn: { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999', marginTop: -4 },
  list: { overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 12 },
  item: { background: '#f9f9f9', borderRadius: 10, padding: '12px 14px' },
  itemTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  itemService: { fontWeight: 600, fontSize: 15 },
  itemStatus: { fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 6 },
  itemDetail: { fontSize: 13, color: '#666' },
  itemNotes: { fontSize: 13, color: '#888', marginTop: 4, fontStyle: 'italic' },
};
