import { useState, useEffect } from 'react';
import api from '../services/api';
import PageGuide from '../components/PageGuide';

const GUIDE_STEPS = [
  'Clique em <strong>+ Novo Bloqueio</strong> para bloquear um período em que não haverá atendimento.',
  '<strong>Data específica</strong> = bloqueia um único dia (ex: feriado, compromisso). <strong>Dia da semana recorrente</strong> = bloqueia toda semana aquele dia (ex: toda segunda-feira de folga).',
  '<strong>Dia todo</strong> bloqueia o dia inteiro. <strong>Horário específico</strong> permite bloquear apenas um intervalo (ex: 12h–14h para almoço).',
  'Você pode vincular um bloqueio a um <strong>profissional específico</strong> ou deixar em branco para bloquear toda a agenda.',
  'O chatbot <strong>nunca vai oferecer</strong> horários bloqueados — sem precisar criar serviços falsos!',
];

const WEEKDAYS = [
  { value: 'monday', label: 'Segunda-feira' },
  { value: 'tuesday', label: 'Terça-feira' },
  { value: 'wednesday', label: 'Quarta-feira' },
  { value: 'thursday', label: 'Quinta-feira' },
  { value: 'friday', label: 'Sexta-feira' },
  { value: 'saturday', label: 'Sábado' },
  { value: 'sunday', label: 'Domingo' },
];

const WEEKDAY_LABELS = Object.fromEntries(WEEKDAYS.map(d => [d.value, d.label]));

function formatDate(dateStr) {
  if (WEEKDAY_LABELS[dateStr]) return `Toda ${WEEKDAY_LABELS[dateStr]}`;
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export default function BlockedSlotsPage() {
  const [slots, setSlots] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    professionalId: '',
    isRecurring: false,
    date: '',
    weekday: 'monday',
    isFullDay: true,
    startTime: '09:00',
    endTime: '18:00',
    reason: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/blocked-slots'),
      api.get('/professionals'),
    ]).then(([slots, professionals]) => {
      setSlots(slots);
      setProfessionals(professionals);
    }).catch(() => setError('Erro ao carregar dados')).finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        professionalId: form.professionalId || null,
        date: form.isRecurring ? form.weekday : form.date,
        isFullDay: form.isFullDay,
        startTime: form.isFullDay ? null : form.startTime,
        endTime: form.isFullDay ? null : form.endTime,
        isRecurring: form.isRecurring,
        reason: form.reason || null,
      };
      const created = await api.post('/blocked-slots', payload);
      setSlots(prev => [created, ...prev]);
      setShowForm(false);
      setForm({ professionalId: '', isRecurring: false, date: '', weekday: 'monday', isFullDay: true, startTime: '09:00', endTime: '18:00', reason: '' });
    } catch {
      setError('Erro ao criar bloqueio');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Remover este bloqueio?')) return;
    try {
      await api.delete(`/blocked-slots/${id}`);
      setSlots(prev => prev.filter(s => s.id !== id));
    } catch {
      setError('Erro ao remover bloqueio');
    }
  }

  if (loading) return <div style={styles.loading}>Carregando...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>🚫 Bloqueio de Horários</h1>
          <p style={styles.subtitle}>Bloqueie datas ou dias da semana em que não haverá atendimento.</p>
        </div>
        <button style={styles.btnPrimary} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : '+ Novo Bloqueio'}
        </button>
      </div>

      <PageGuide pageKey="blocked-slots" title="Como bloquear horários" steps={GUIDE_STEPS} color="#ef4444" />

      {error && <div style={styles.error}>{error}</div>}

      {showForm && (
        <form onSubmit={handleSubmit} style={styles.formCard}>
          <h3 style={{ marginTop: 0, marginBottom: 20 }}>Novo Bloqueio</h3>

          <div style={styles.formRow}>
            <label style={styles.label}>Profissional (opcional)</label>
            <select style={styles.select} value={form.professionalId} onChange={e => setForm(f => ({ ...f, professionalId: e.target.value }))}>
              <option value="">Todos os profissionais</option>
              {professionals.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          <div style={styles.formRow}>
            <label style={styles.label}>Tipo de bloqueio</label>
            <div style={styles.toggleRow}>
              <button type="button" style={{ ...styles.toggleBtn, background: !form.isRecurring ? '#6C63FF' : '#eee', color: !form.isRecurring ? '#fff' : '#333' }}
                onClick={() => setForm(f => ({ ...f, isRecurring: false }))}>Data específica</button>
              <button type="button" style={{ ...styles.toggleBtn, background: form.isRecurring ? '#6C63FF' : '#eee', color: form.isRecurring ? '#fff' : '#333' }}
                onClick={() => setForm(f => ({ ...f, isRecurring: true }))}>Dia da semana (recorrente)</button>
            </div>
          </div>

          {form.isRecurring ? (
            <div style={styles.formRow}>
              <label style={styles.label}>Dia da semana</label>
              <select style={styles.select} value={form.weekday} onChange={e => setForm(f => ({ ...f, weekday: e.target.value }))}>
                {WEEKDAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          ) : (
            <div style={styles.formRow}>
              <label style={styles.label}>Data</label>
              <input type="date" style={styles.input} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} required={!form.isRecurring} />
            </div>
          )}

          <div style={styles.formRow}>
            <label style={styles.label}>Período</label>
            <div style={styles.toggleRow}>
              <button type="button" style={{ ...styles.toggleBtn, background: form.isFullDay ? '#6C63FF' : '#eee', color: form.isFullDay ? '#fff' : '#333' }}
                onClick={() => setForm(f => ({ ...f, isFullDay: true }))}>Dia todo</button>
              <button type="button" style={{ ...styles.toggleBtn, background: !form.isFullDay ? '#6C63FF' : '#eee', color: !form.isFullDay ? '#fff' : '#333' }}
                onClick={() => setForm(f => ({ ...f, isFullDay: false }))}>Horário específico</button>
            </div>
          </div>

          {!form.isFullDay && (
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ ...styles.formRow, flex: 1 }}>
                <label style={styles.label}>De</label>
                <input type="time" style={styles.input} value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} />
              </div>
              <div style={{ ...styles.formRow, flex: 1 }}>
                <label style={styles.label}>Até</label>
                <input type="time" style={styles.input} value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} />
              </div>
            </div>
          )}

          <div style={styles.formRow}>
            <label style={styles.label}>Motivo (opcional)</label>
            <input style={styles.input} placeholder="Ex: Feriado, Férias..." value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
          </div>

          <button type="submit" style={styles.btnPrimary} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar Bloqueio'}
          </button>
        </form>
      )}

      {slots.length === 0 ? (
        <div style={styles.empty}>
          <p>Nenhum bloqueio cadastrado.</p>
          <p style={{ fontSize: 13, color: '#888' }}>Adicione bloqueios para datas ou dias em que não haverá atendimento.</p>
        </div>
      ) : (
        <div style={styles.list}>
          {slots.map(slot => (
            <div key={slot.id} style={styles.card}>
              <div style={styles.cardIcon}>{slot.isRecurring ? '🔁' : '📅'}</div>
              <div style={styles.cardInfo}>
                <div style={styles.cardDate}>{formatDate(slot.date)}</div>
                <div style={styles.cardDetail}>
                  {slot.professional ? `👤 ${slot.professional.name}` : '👥 Todos os profissionais'}
                  {' · '}
                  {slot.isFullDay ? 'Dia todo' : `${slot.startTime} – ${slot.endTime}`}
                  {slot.reason ? ` · ${slot.reason}` : ''}
                </div>
              </div>
              <button style={styles.btnDelete} onClick={() => handleDelete(slot.id)} title="Remover">🗑️</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: 700, margin: '0 auto', padding: '32px 16px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title: { fontSize: 26, fontWeight: 700, marginBottom: 6 },
  subtitle: { color: '#666', fontSize: 14, margin: 0 },
  error: { background: '#fee2e2', color: '#dc2626', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 },
  loading: { textAlign: 'center', padding: 60, color: '#888' },
  formCard: { background: '#f8f8ff', border: '1px solid #e0dfff', borderRadius: 12, padding: 24, marginBottom: 28 },
  formRow: { marginBottom: 16 },
  label: { display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#444' },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' },
  select: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, background: '#fff' },
  toggleRow: { display: 'flex', gap: 8 },
  toggleBtn: { flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  btnPrimary: { background: '#6C63FF', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 15 },
  empty: { textAlign: 'center', padding: 48, color: '#666', background: '#f9f9f9', borderRadius: 12 },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '14px 18px' },
  cardIcon: { fontSize: 22 },
  cardInfo: { flex: 1 },
  cardDate: { fontWeight: 600, fontSize: 15 },
  cardDetail: { fontSize: 13, color: '#666', marginTop: 2 },
  btnDelete: { background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#ef4444' },
};
