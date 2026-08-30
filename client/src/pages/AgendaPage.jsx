import { useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { ordersAPI } from '../services/api';
import PageGuide from '../components/PageGuide';
import UIIcon from '../components/UIIcon';
import { btnPrimary } from '../styles/buttons';
import { tint } from '../styles/surfaces';

const AGENDA_GUIDE_STEPS = [
  'A <strong>grade semanal</strong> mostra todos os agendamentos posicionados pelo horário. Use as setas para navegar entre semanas.',
  'Clique em qualquer agendamento para ver os detalhes e alterar o status: <strong>Confirmar</strong>, <strong>Concluído</strong> ou <strong>Cancelar</strong>.',
  'Clique em <strong>+ Agendar</strong> para criar um agendamento manual. Esse recurso ajuda quando o cliente liga ou chega pessoalmente.',
  'No modal de novo agendamento, após escolher o serviço e a data, os <strong>horários disponíveis</strong> aparecem automaticamente.',
  'Agendamentos antigos (sem horário estruturado) aparecem na lista abaixo da grade.',
];

// ─── helpers ────────────────────────────────────────────────────────────────

const STATUS_COLOR  = { pending:'#f59e0b', confirmed:'#3b82f6', completed:'#10b981', cancelled:'#ef4444' };
const STATUS_LABEL  = { pending:'Aguardando', confirmed:'Confirmado', completed:'Concluído',  cancelled:'Cancelado' };
const WEEKDAY_SHORT = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];
const MONTH_NAMES   = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// Convenção do projeto: "fake UTC = BRT". Trabalhamos com um instante já
// deslocado em -3h e lemos SEMPRE os componentes em UTC — misturar getDay()/
// getDate() (locais) com toISOString() (UTC) aplicava o offset duas vezes e
// desalinhava a grade em um dia entre 00:00 e 03:00 BRT.
function nowBRT() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000);
}

function toLocalDateStr(date) {
  return date.toISOString().slice(0,10);
}

function weekStart(date) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // 0=Dom
  d.setUTCHours(12, 0, 0, 0); // meio-dia evita qualquer borda de arredondamento
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}

function parseBRT(isoStr) {
  // scheduledAt stored as "fake UTC" = local BRT
  const d = new Date(isoStr);
  return { h: d.getUTCHours(), m: d.getUTCMinutes() };
}

function formatTime(isoStr) {
  const { h, m } = parseBRT(isoStr);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function minutesToTop(h, m, startHour) {
  return ((h - startHour) * 60 + m) * (SLOT_PX / 60);
}

const SLOT_PX   = 60;  // px per hour
const START_HOUR = 7;
const END_HOUR   = 22;
const HOURS      = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

// ─── New Appointment Modal ───────────────────────────────────────────────────

function NewAppointmentModal({ onClose, onCreated, initialDate }) {
  const [professionals, setProfessionals] = useState([]);
  const [services, setServices]       = useState([]);
  const [slots, setSlots]             = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  const todayStr = (() => {
    return nowBRT().toISOString().slice(0, 10);
  })();

  const [form, setForm] = useState({
    productId: '',
    professionalId: '',
    customerName: '',
    customerPhone: '',
    date: initialDate || todayStr,
    time: '',
    notes: '',
    duration: '', // duração deste atendimento; vazio = usa o padrão do serviço
  });

  useEffect(() => {
    Promise.all([api.get('/professionals'), api.get('/products')]).then(([p, s]) => {
      setProfessionals(p.filter(x => x.active));
      setServices(s.filter(x => x.active));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.productId || !form.date) { setSlots([]); return; }
    // Duração inválida: não consulta (o servidor recusaria com 400)
    if (form.duration !== '' && !/^\d+$/.test(form.duration)) { setSlots([]); return; }
    setLoadingSlots(true);
    const params = new URLSearchParams({ date: form.date, serviceId: form.productId });
    if (form.professionalId) params.set('professionalId', form.professionalId);
    if (form.duration !== '') params.set('duration', form.duration);
    api.get(`/availability/slots?${params}`)
      .then(r => setSlots(r.slots || []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false));
  }, [form.productId, form.date, form.professionalId, form.duration]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.time) { setError('Selecione um horário'); return; }
    setSaving(true);
    try {
      const order = await api.post('/orders/manual', {
        productId:      parseInt(form.productId),
        professionalId: form.professionalId ? parseInt(form.professionalId) : null,
        customerName:   form.customerName,
        customerPhone:  form.customerPhone,
        date:           form.date,
        time:           form.time,
        notes:          form.notes || null,
        duration:       form.duration === '' ? null : parseInt(form.duration),
      });
      onCreated(order);
      onClose();
    } catch (err) {
      setError(err.message || 'Erro ao criar agendamento');
    } finally {
      setSaving(false);
    }
  }

  const set = (k, v) => setForm(f => ({ ...f, [k]: v, ...(k !== 'time' ? { time: '' } : {}) }));
  const selectedService = services.find(s => s.id === parseInt(form.productId));

  // Ao trocar o serviço, a duração volta para o padrão dele (que o usuário pode ajustar)
  const setService = (v) => {
    const svc = services.find(s => s.id === parseInt(v));
    setForm(f => ({ ...f, productId: v, time: '', duration: svc ? String(svc.duration) : '' }));
  };

  const duracaoNum = /^\d+$/.test(form.duration) ? parseInt(form.duration) : null;
  const duracaoInvalida = form.duration !== '' && (duracaoNum === null || duracaoNum < 1 || duracaoNum > 1440);
  const duracaoAlterada = !!selectedService && duracaoNum !== null && duracaoNum !== selectedService.duration;

  return (
    <div style={modal.overlay} onClick={onClose}>
      <div style={modal.box} onClick={e => e.stopPropagation()}>
        <div style={modal.header}>
          <h2 style={{ margin: 0 }}>Novo agendamento</h2>
          <button style={modal.closeBtn} aria-label="Fechar" onClick={onClose}><UIIcon name="close" /></button>
        </div>
        <form onSubmit={handleSubmit} style={modal.body}>
          {error && <div style={modal.error}>{error}</div>}

          <div style={modal.row}>
            <div style={modal.field}>
              <label style={modal.label}>Serviço *</label>
              <select style={modal.input} value={form.productId} onChange={e => setService(e.target.value)} required>
                <option value="">Selecione...</option>
                {services.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.duration} min, R$ {s.price.toFixed(2).replace('.',',')})</option>
                ))}
              </select>
            </div>
            {professionals.length > 0 && (
              <div style={modal.field}>
                <label style={modal.label}>Profissional</label>
                <select style={modal.input} value={form.professionalId} onChange={e => set('professionalId', e.target.value)}>
                  <option value="">Qualquer</option>
                  {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div style={modal.row}>
            <div style={modal.field}>
              <label style={modal.label}>Nome do cliente *</label>
              <input style={modal.input} value={form.customerName} onChange={e => set('customerName', e.target.value)} placeholder="Nome completo" required />
            </div>
            <div style={modal.field}>
              <label style={modal.label}>Telefone *</label>
              <input style={modal.input} value={form.customerPhone} onChange={e => set('customerPhone', e.target.value)} placeholder="5511999999999" required />
            </div>
          </div>

          {selectedService && (
            <div style={modal.row}>
              <div style={modal.field}>
                <label style={modal.label}>Duração deste atendimento (min) *</label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  step="5"
                  style={{ ...modal.input, ...(duracaoInvalida ? { borderColor: '#dc2626' } : {}) }}
                  value={form.duration}
                  onChange={e => setForm(f => ({ ...f, duration: e.target.value, time: '' }))}
                  required
                />
                <div style={modal.hint}>
                  {duracaoInvalida
                    ? <span style={{ color: '#dc2626' }}>Informe um número entre 1 e 1440 minutos.</span>
                    : duracaoAlterada
                      ? <>Duração ajustada. O padrão de <strong>{selectedService.name}</strong> é {selectedService.duration} min. Os horários abaixo já consideram o novo tempo.</>
                      : <>Padrão do serviço. Altere se este atendimento precisar de mais tempo.</>}
                </div>
              </div>
              <div style={modal.field} />
            </div>
          )}

          <div style={modal.row}>
            <div style={modal.field}>
              <label style={modal.label}>Data *</label>
              <input type="date" style={modal.input} value={form.date} min={todayStr} onChange={e => set('date', e.target.value)} required />
            </div>
            <div style={modal.field}>
              <label style={modal.label}>
                Horário * {loadingSlots && <span style={{ fontSize: 11, color: '#888' }}>buscando...</span>}
              </label>
              {slots.length > 0 ? (
                <select style={modal.input} value={form.time} onChange={e => setForm(f => ({ ...f, time: e.target.value }))} required>
                  <option value="">Selecione o horário</option>
                  {slots.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                // Nunca oferecer entrada livre aqui: era o caminho que permitia ao
                // admin agendar por cima de um bloqueio que ele mesmo criou.
                <div style={modal.slotsEmpty}>
                  {loadingSlots
                    ? 'Buscando horários...'
                    : !form.productId
                      ? 'Selecione o serviço primeiro.'
                      : 'Nenhum horário livre nesta data. O dia pode estar fechado, bloqueado ou lotado. Escolha outra data.'}
                </div>
              )}
            </div>
          </div>

          {selectedService && duracaoNum !== null && !duracaoInvalida && (
            <div style={modal.infoBox}>
              Duração: <strong>{duracaoNum}min</strong>
              {duracaoAlterada && ` (padrão: ${selectedService.duration}min)`}
              {selectedService.bufferTime > 0 && ` + ${selectedService.bufferTime}min intervalo`}
              {form.time && ` · Término previsto: ${addMinutesToTime(form.time, duracaoNum + selectedService.bufferTime)}`}
            </div>
          )}

          <div style={modal.field}>
            <label style={modal.label}>Observações</label>
            <textarea style={{ ...modal.input, resize: 'vertical' }} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Informações extras..." />
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" style={modal.btnSecondary} onClick={onClose}>Cancelar</button>
            <button type="submit" style={modal.btnPrimary} disabled={saving}>{saving ? 'Salvando...' : 'Confirmar Agendamento'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function addMinutesToTime(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`;
}

// ─── Order Detail Popover ────────────────────────────────────────────────────

function OrderCard({ order, onStatusChange }) {
  const [open, setOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [statusError, setStatusError] = useState('');

  const timeStr = order.scheduledAt ? formatTime(order.scheduledAt) : order.scheduledTime || '';
  // durationOverride: tempo personalizado definido para este atendimento
  const dur     = order.durationOverride || order.product?.duration || 30;
  const endStr  = order.scheduledAt ? addMinutesToTime(timeStr, dur) : '';
  const color   = STATUS_COLOR[order.status] || '#888';

  async function handleStatus(status) {
    setUpdating(true);
    try {
      await ordersAPI.updateStatus(order.id, status);
      onStatusChange(order.id, status);
      setStatusError('');
      setOpen(false);
    } catch (err) {
      // Falha silenciosa aqui fazia o admin acreditar que confirmou/cancelou.
      setStatusError(err.message || 'Não foi possível alterar o status.');
    }
    finally { setUpdating(false); }
  }

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => setOpen(!open)}
        style={{
          background: color + '22',
          border: `1px solid ${color}55`,
          borderRadius: 6,
          padding: '3px 6px',
          fontSize: 11,
          cursor: 'pointer',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          lineHeight: 1.4,
        }}
      >
        <strong style={{ color }}>{timeStr}{endStr ? ` a ${endStr}` : ''}</strong>
        <div style={{ color: '#333', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {order.customerName} · {order.product?.name}
        </div>
        {order.professional && <div style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{order.professional.name}</div>}
      </div>

      {open && (
        <div style={popover.box}>
          <div style={popover.header}>
            <span style={{ fontWeight: 700 }}>#{order.id} {order.customerName}</span>
            <button style={popover.closeBtn} aria-label="Fechar" onClick={() => setOpen(false)}><UIIcon name="close" /></button>
          </div>
          <div style={popover.row}><span><UIIcon name="services" size={15} /></span> {order.product?.name}</div>
          {order.professional && <div style={popover.row}><span><UIIcon name="professionals" size={15} /></span> {order.professional.name}</div>}
          <div style={popover.row}><span><UIIcon name="clock" size={15} /></span> {timeStr}{endStr ? ` às ${endStr}` : ''}</div>
          <div style={popover.row}><span><UIIcon name="phone" size={15} /></span> {order.customerPhone}</div>
          {order.notes && <div style={popover.row}><span><UIIcon name="chat" size={15} /></span> {order.notes}</div>}
          <div style={{ ...popover.row, alignItems: 'center' }}>
            <span><UIIcon name="check" size={15} /></span>
            <span style={{ background: color + '22', color, fontSize: 11, padding: '2px 8px', borderRadius: 6, fontWeight: 600 }}>
              {STATUS_LABEL[order.status]}
            </span>
          </div>
          {statusError && (
            <div style={{ background: '#fee2e2', color: '#dc2626', padding: '6px 10px', borderRadius: 6, fontSize: 12, marginTop: 6 }}>
              {statusError}
            </div>
          )}
          {order.status !== 'completed' && order.status !== 'cancelled' && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              {order.status !== 'confirmed'  && <button style={popover.actionBtn('#2563eb')} disabled={updating} onClick={() => handleStatus('confirmed')}>Confirmar</button>}
              {order.status !== 'completed'  && <button style={popover.actionBtn('#10b981')} disabled={updating} onClick={() => handleStatus('completed')}>Concluir</button>}
              <button style={popover.actionBtn('#ef4444')} disabled={updating} onClick={() => handleStatus('cancelled')}>Cancelar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Week Grid ───────────────────────────────────────────────────────────────

function WeekGrid({ weekDays, orders, onStatusChange }) {
  const ordersByDay = {};
  weekDays.forEach(d => { ordersByDay[toLocalDateStr(d)] = []; });

  orders.forEach(order => {
    if (!order.scheduledAt) return;
    const dateKey = new Date(order.scheduledAt).toISOString().slice(0, 10);
    if (ordersByDay[dateKey]) ordersByDay[dateKey].push(order);
  });

  return (
    <div style={grid.wrapper}>
      {/* Hour labels */}
      <div style={grid.hourCol}>
        <div style={grid.hourHeader} />
        {HOURS.map(h => (
          <div key={h} style={grid.hourLabel}>{String(h).padStart(2,'0')}:00</div>
        ))}
      </div>
      {/* Day columns */}
      {weekDays.map(day => {
        const dateStr  = toLocalDateStr(day);
        const dayOrders = ordersByDay[dateStr] || [];
        const today    = toLocalDateStr(nowBRT());
        const isToday  = (dateStr === today);

        return (
          <div key={dateStr} style={{ ...grid.dayCol, background: isToday ? 'var(--tint-surface)' : 'var(--bg-card)' }}>
            <div style={{ ...grid.dayHeader, color: isToday ? 'var(--ink-accent)' : 'var(--text-secondary)', fontWeight: isToday ? 700 : 500 }}>
              {WEEKDAY_SHORT[day.getUTCDay()]}<br />
              <span style={{ fontSize: 18, fontWeight: 700 }}>{day.getUTCDate()}</span>
            </div>
            <div style={grid.dayBody}>
              {HOURS.map(h => (
                <div key={h} style={grid.hourRow} />
              ))}
              {dayOrders.map(order => {
                const { h, m } = parseBRT(order.scheduledAt);
                if (h < START_HOUR || h >= END_HOUR) return null;
                const top    = minutesToTop(h, m, START_HOUR);
                // Altura = tempo REALMENTE ocupado na agenda (atendimento + intervalo),
                // que é o mesmo critério usado pelo servidor para liberar o próximo slot.
                const ocupado = (order.durationOverride || order.product?.duration || 30) + (order.product?.bufferTime || 0);
                const height  = Math.max((ocupado / 60) * SLOT_PX, 24);
                return (
                  <div key={order.id} style={{ position: 'absolute', top, minHeight: height, left: 2, right: 2, zIndex: 2 }}>
                    <OrderCard order={order} onStatusChange={onStatusChange} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AgendaPage() {
  const [anchor, setAnchor]       = useState(() => weekStart(nowBRT()));
  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalDate, setModalDate] = useState(null);
  const [loadError, setLoadError] = useState('');

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(anchor, i));

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const start = toLocalDateStr(anchor);
      const end   = toLocalDateStr(addDays(anchor, 6));
      const data  = await api.get(`/orders/agenda?start=${start}&end=${end}`);
      setOrders(Array.isArray(data) ? data : []);
    } catch (err) {
      // Não silenciar: uma agenda vazia por erro é indistinguível de uma
      // agenda vazia de verdade, e foi isso que mascarou a rota faltante.
      setOrders([]);
      setLoadError(err.message || 'Não foi possível carregar a agenda.');
    } finally {
      setLoading(false);
    }
  }, [anchor]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  function handleStatusChange(orderId, newStatus) {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
  }

  function handleCreated(order) {
    setOrders(prev => [...prev, order]);
  }

  const todayStr   = toLocalDateStr(nowBRT());
  const monthLabel = MONTH_NAMES[weekDays[0].getUTCMonth()];
  const yearLabel  = weekDays[0].getUTCFullYear();

  return (
    <div style={page.container}>
      <PageGuide pageKey="agenda" title="Como usar a Agenda" steps={AGENDA_GUIDE_STEPS} />
      {/* Header */}
      <div style={page.header}>
        <div>
          <h1 style={page.title}>Agenda</h1>
          <div style={page.subtitle}>{monthLabel} {yearLabel}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button style={page.navBtn} onClick={() => setAnchor(a => addDays(a, -7))}>‹ Semana anterior</button>
          <button style={page.todayBtn} onClick={() => setAnchor(weekStart(new Date(Date.now() - 3*60*60*1000)))}>Hoje</button>
          <button style={page.navBtn} onClick={() => setAnchor(a => addDays(a, 7))}>Próxima semana ›</button>
          <button style={page.newBtn} onClick={() => { setModalDate(todayStr); setShowModal(true); }}>+ Agendar</button>
        </div>
      </div>

      {loadError && (
        <div style={page.loadError}>
          {loadError}{' '}
          <button style={page.retryBtn} onClick={fetchOrders}>Tentar novamente</button>
        </div>
      )}

      {loading ? (
        <div style={page.loading}>Carregando agenda...</div>
      ) : (
        <div style={page.scrollArea}>
          <WeekGrid weekDays={weekDays} orders={orders} onStatusChange={handleStatusChange} />
        </div>
      )}

      {/* Legacy orders without scheduledAt */}
      {(() => {
        const legacy = orders.filter(o => !o.scheduledAt && o.scheduledTime);
        if (!legacy.length) return null;
        return (
          <div style={page.legacySection}>
            <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Agendamentos sem horário estruturado</h3>
            {legacy.map(o => (
              <div key={o.id} style={page.legacyCard}>
                <div style={{ fontWeight: 600 }}>{o.customerName} · {o.product?.name}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{o.scheduledTime} · {o.customerPhone}</div>
                {o.professional && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.professional.name}</div>}
                <span style={{ fontSize: 11, background: (STATUS_COLOR[o.status]||'#888')+'22', color: STATUS_COLOR[o.status]||'#888', padding:'2px 8px', borderRadius: 6, fontWeight: 600 }}>
                  {STATUS_LABEL[o.status]}
                </span>
              </div>
            ))}
          </div>
        );
      })()}

      {showModal && (
        <NewAppointmentModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
          initialDate={modalDate}
        />
      )}
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const page = {
  container:     { padding: '24px 16px', maxWidth: 1100, margin: '0 auto' },
  header:        { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 },
  title:         { fontSize: 26, fontWeight: 700, margin: 0 },
  subtitle:      { color: '#666', fontSize: 14, marginTop: 4 },
  // Grafite sóbrio + vidro contido, espelhando .btn/.btn-primary de sophisticated.css.
  // Estes botões usam estilo inline, então não herdam aquelas classes.
  navBtn: {
    background: 'var(--btn-surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-btn)',
    padding: '7px 14px', cursor: 'pointer', fontSize: 13,
    color: 'var(--text-primary)', fontWeight: 500,
    boxShadow: 'var(--btn-glass-shadow)',
    transition: 'background-color 180ms cubic-bezier(.2,.8,.2,1), border-color 180ms cubic-bezier(.2,.8,.2,1)',
  },
  todayBtn: {
    background: 'var(--btn-graphite)',
    border: '1px solid var(--btn-graphite)',
    borderRadius: 'var(--radius-btn)',
    padding: '7px 14px', cursor: 'pointer', fontSize: 13,
    color: '#fff', fontWeight: 600,
    boxShadow: 'var(--btn-glass-shadow)',
  },
  newBtn: {
    background: 'var(--btn-graphite)',
    color: '#fff',
    border: '1px solid var(--btn-graphite)',
    borderRadius: 'var(--radius-btn)',
    padding: '8px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 700,
    boxShadow: 'var(--btn-glass-shadow)',
    transition: 'transform 180ms cubic-bezier(.2,.8,.2,1), box-shadow 180ms cubic-bezier(.2,.8,.2,1)',
  },
  loading:       { textAlign: 'center', padding: 60, color: '#888' },
  loadError:     { background: '#fee2e2', color: '#dc2626', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 },
  retryBtn:      { background: 'var(--btn-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)', borderRadius: 'var(--radius-btn)', padding: '6px 12px', fontSize: 13, cursor: 'pointer', marginLeft: 4, boxShadow: 'var(--btn-glass-shadow)' },
  scrollArea:    { overflowX: 'auto' },
  legacySection: { marginTop: 24, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: 16 },
  legacyCard:    { background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: '10px 14px', marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 4 },
};

const grid = {
  wrapper:    { display: 'flex', minWidth: 700, border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' },
  hourCol:    { width: 52, flexShrink: 0, borderRight: '1px solid #e5e7eb' },
  hourHeader: { height: 52, borderBottom: '1px solid #e5e7eb' },
  hourLabel:  { height: SLOT_PX, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: 6, paddingTop: 2, fontSize: 10, color: '#aaa', boxSizing: 'border-box', borderBottom: '1px solid #f3f4f6' },
  dayCol:     { flex: 1, borderRight: '1px solid #e5e7eb', minWidth: 90 },
  dayHeader:  { height: 52, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #e5e7eb', fontSize: 11, gap: 0 },
  dayBody:    { position: 'relative', height: HOURS.length * SLOT_PX },
  hourRow:    { height: SLOT_PX, borderBottom: '1px solid #f3f4f6', boxSizing: 'border-box' },
};

const popover = {
  box:       { position: 'absolute', left: 0, top: '100%', zIndex: 50, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, minWidth: 230, boxShadow: '0 4px 20px rgba(0,0,0,0.15)' },
  header:    { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  closeBtn:  { background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: 16 },
  row:       { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, marginBottom: 5 },
  actionBtn: () => ({ background: 'var(--btn-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-btn)', padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, boxShadow: 'var(--btn-glass-shadow)' }),
};

const modal = {
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 },
  box:         { background: '#fff', borderRadius: 16, width: '100%', maxWidth: 600, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 24px', borderBottom: '1px solid #eee' },
  closeBtn:    { background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' },
  body:        { padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 },
  error:       { background: '#fee2e2', color: '#dc2626', padding: '8px 12px', borderRadius: 8, fontSize: 13 },
  row:         { display: 'flex', gap: 12 },
  field:       { flex: 1, display: 'flex', flexDirection: 'column', gap: 4 },
  label:       { fontSize: 13, fontWeight: 600, color: '#444' },
  input:       { padding: '9px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, width: '100%', boxSizing: 'border-box', background: '#fff' },
  infoBox:     { ...tint, padding: '8px 12px', fontSize: 13 },
  slotsEmpty:  { background: '#f9f9f9', border: '1px dashed #ddd', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#777', lineHeight: 1.4 },
  hint:        { fontSize: 12, color: '#777', marginTop: 5, lineHeight: 1.4 },
  btnPrimary:  { ...btnPrimary, fontWeight: 700, fontSize: 14 },
  btnSecondary:{ background: 'var(--btn-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-btn)', padding: '8px 16px', cursor: 'pointer', fontSize: 14, boxShadow: 'var(--btn-glass-shadow)' },
};
