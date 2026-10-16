import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
const labels = { pending: 'A confirmar', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado' };
export default function TodayAppointments({ timeZone = 'America/Sao_Paulo' }) {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const day = ['year', 'month', 'day'].map(type => parts.find(part => part.type === type).value).join('-');
  useEffect(() => {
    let active = true;
    api.get(`/orders/agenda?start=${day}&end=${day}`).then(data => { if (active) { setOrders((Array.isArray(data) ? data : []).filter(order => order.status !== 'cancelled').sort((a, b) => String(a.scheduledAt || '').localeCompare(String(b.scheduledAt || '')))); setError(''); setLoading(false); } }).catch(() => { if (active) { setError('Não foi possível carregar o dia.'); setLoading(false); } });
    return () => { active = false; };
  }, [day, reload]);
  return <section className="flow-daily" aria-labelledby="today-heading">
    <div className="flow-daily-heading"><h2 id="today-heading">Sua agenda hoje</h2><Link className="btn btn-secondary" to="/dashboard/agenda">Abrir agenda</Link></div>
    {loading ? <p role="status">Carregando atendimentos…</p> : error ? <p role="alert">{error} <button className="btn btn-secondary" onClick={() => { setLoading(true); setReload(value => value + 1); }}>Tentar novamente</button></p> : orders.length ? <>
      <p>{orders.length} atendimento(s){orders.some(order => order.status === 'pending') ? ` · ${orders.filter(order => order.status === 'pending').length} a confirmar` : ''}</p>
      {orders.slice(0, 6).map(order => <Link to="/dashboard/agenda" className="flow-daily-item" key={order.id}><time>{order.scheduledAt ? String(order.scheduledAt).slice(11, 16) : order.scheduledTime || 'Sem horário'}</time><span><strong>{order.customerName}</strong><small>{order.product?.name || 'Atendimento'}{order.professional?.name ? ` · ${order.professional.name}` : ''}</small></span><span>{labels[order.status] || order.status}</span></Link>)}
      {orders.length > 6 && <Link to="/dashboard/agenda">Ver todos os atendimentos</Link>}
    </> : <p>Sem atendimentos hoje. <Link to="/dashboard/agenda">Adicionar um agendamento</Link></p>}
  </section>;
}
