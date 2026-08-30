import { useState, useEffect } from 'react';
import api from '../services/api';
import PageGuide from '../components/PageGuide';
import UIIcon from '../components/UIIcon';
import { btnPrimary, toggleOn, toggleOff } from '../styles/buttons';
import { panel } from '../styles/surfaces';

const GUIDE_STEPS = [
  'Clique em <strong>+ Novo Bloqueio</strong> para bloquear um período em que não haverá atendimento.',
  '<strong>Data específica</strong> bloqueia um único dia, como um feriado ou compromisso. Já o <strong>dia da semana recorrente</strong> repete o bloqueio toda semana, como uma segunda-feira de folga.',
  '<strong>Dia todo</strong> bloqueia o dia inteiro. <strong>Horário específico</strong> permite bloquear apenas um intervalo, como das 12h às 14h para o almoço.',
  'Você pode vincular um bloqueio a um <strong>profissional específico</strong> ou deixar em branco para bloquear toda a agenda.',
  'O chatbot <strong>nunca vai oferecer</strong> horários bloqueados. Você não precisa criar serviços falsos para ocupar a agenda.',
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
const WEEKDAY_ORDER = Object.fromEntries(WEEKDAYS.map((d, i) => [d.value, i]));

// Aceita "HH:MM" (com ou sem segundos) e devolve minutos; null quando o valor é inválido.
function toMinutes(value) {
  const m = /^(\d{1,2}):([0-5]\d)/.exec(String(value ?? '').trim());
  if (!m) return null;
  const hours = parseInt(m[1], 10);
  if (hours > 23) return null;
  return hours * 60 + parseInt(m[2], 10);
}

// Um bloqueio por horário só bloqueia algo se tiver início e fim válidos e início < fim.
function isInvalidSlot(slot) {
  if (slot.isFullDay) return false;
  const start = toMinutes(slot.startTime);
  const end = toMinutes(slot.endTime);
  return start === null || end === null || start >= end;
}

function formatDate(dateStr) {
  const raw = String(dateStr ?? '').trim();
  if (!raw) return '(sem data)';
  const label = WEEKDAY_LABELS[raw.toLowerCase()];
  if (label) return `Toda ${label}`;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(raw);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return raw;
}

// O backend ordena por uma coluna que mistura datas e dias da semana; reordenamos aqui:
// recorrentes na ordem real da semana, depois as datas específicas em ordem cronológica.
function sortSlots(slots) {
  return [...slots].sort((a, b) => {
    const aw = WEEKDAY_ORDER[String(a.date ?? '').trim().toLowerCase()];
    const bw = WEEKDAY_ORDER[String(b.date ?? '').trim().toLowerCase()];
    const aRecurring = aw !== undefined;
    const bRecurring = bw !== undefined;
    if (aRecurring && bRecurring) return aw - bw;
    if (aRecurring) return -1;
    if (bRecurring) return 1;
    return String(a.date ?? '').localeCompare(String(b.date ?? ''));
  });
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
    isFullDay: false,
    startTime: '12:00',
    endTime: '14:00',
    reason: '',
  });
  // Enquanto o admin não escolher o período, nenhum dos dois botões aparece como "já escolhido".
  const [periodChosen, setPeriodChosen] = useState(false);
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
    setError('');

    if (!form.isRecurring && !form.date) {
      setError('Escolha a data do bloqueio.');
      return;
    }
    if (!form.isFullDay) {
      if (!form.startTime || !form.endTime) {
        setError('Preencha os horários de início e término do bloqueio.');
        return;
      }
      const start = toMinutes(form.startTime);
      const end = toMinutes(form.endTime);
      if (start === null || end === null) {
        setError('Informe horários válidos no formato HH:MM.');
        return;
      }
      if (start >= end) {
        setError('O horário de término deve ser posterior ao de início.');
        return;
      }
    }

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
      setPeriodChosen(false);
      setForm({ professionalId: '', isRecurring: false, date: '', weekday: 'monday', isFullDay: false, startTime: '12:00', endTime: '14:00', reason: '' });
    } catch (err) {
      setError(err.message || 'Erro ao criar bloqueio');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Remover este bloqueio?')) return;
    setError('');
    try {
      await api.delete(`/blocked-slots/${id}`);
      setSlots(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      setError(err.message || 'Erro ao remover bloqueio');
    }
  }

  if (loading) return <div style={styles.loading}>Carregando...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Bloqueio de horários</h1>
          <p style={styles.subtitle}>Bloqueie datas ou dias da semana em que não haverá atendimento.</p>
        </div>
        <button style={styles.btnPrimary} onClick={() => { setError(''); setShowForm(!showForm); }}>
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
              <button type="button" style={{ ...styles.toggleBtn, ...(!form.isRecurring ? toggleOn : toggleOff) }}
                onClick={() => setForm(f => ({ ...f, isRecurring: false }))}>Data específica</button>
              <button type="button" style={{ ...styles.toggleBtn, ...(form.isRecurring ? toggleOn : toggleOff) }}
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
              <button type="button" style={{ ...styles.toggleBtn, ...(periodChosen && form.isFullDay ? toggleOn : toggleOff) }}
                onClick={() => { setPeriodChosen(true); setForm(f => ({ ...f, isFullDay: true })); }}>Dia todo</button>
              <button type="button" style={{ ...styles.toggleBtn, ...(periodChosen && !form.isFullDay ? toggleOn : toggleOff) }}
                onClick={() => { setPeriodChosen(true); setForm(f => ({ ...f, isFullDay: false })); }}>Horário específico</button>
            </div>
            <div style={styles.hint}>
              <strong>Dia todo</strong> bloqueia as 24 horas. <strong>Horário específico</strong> bloqueia apenas o intervalo abaixo, como das 12:00 às 14:00 para o almoço.
            </div>
          </div>

          {!form.isFullDay && (
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ ...styles.formRow, flex: 1 }}>
                <label style={styles.label}>De</label>
                <input type="time" style={styles.input} value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} required />
              </div>
              <div style={{ ...styles.formRow, flex: 1 }}>
                <label style={styles.label}>Até</label>
                <input type="time" style={styles.input} value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} required />
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
          {sortSlots(slots).map(slot => {
            const invalid = isInvalidSlot(slot);
            return (
            <div key={slot.id} style={invalid ? { ...styles.card, borderColor: '#fca5a5', background: '#fff7f7' } : styles.card}>
              <div style={styles.cardIcon}><UIIcon name={slot.isRecurring ? 'refresh' : 'calendar'} /></div>
              <div style={styles.cardInfo}>
                <div style={styles.cardDate}>{formatDate(slot.date)}</div>
                <div style={styles.cardDetail}>
                  {slot.professional ? slot.professional.name : 'Todos os profissionais'}
                  {' · '}
                  {slot.isFullDay ? 'Dia todo' : `${slot.startTime || '--:--'} às ${slot.endTime || '--:--'}`}
                  {slot.reason ? ` · ${slot.reason}` : ''}
                </div>
                {invalid && <div style={styles.cardInvalid}>Este bloqueio é inválido e não afeta a agenda. Remova-o e crie outro.</div>}
              </div>
              <button style={styles.btnDelete} onClick={() => handleDelete(slot.id)} title="Remover"><UIIcon name="delete" /></button>
            </div>
            );
          })}
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
  formCard: { ...panel, padding: 24, marginBottom: 28 },
  formRow: { marginBottom: 16 },
  label: { display: 'block', fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#444' },
  hint: { fontSize: 12, color: '#666', marginTop: 6 },
  input: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' },
  select: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14, background: '#fff' },
  toggleRow: { display: 'flex', gap: 8 },
  toggleBtn: { flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  btnPrimary: btnPrimary,
  empty: { textAlign: 'center', padding: 48, color: '#666', background: '#f9f9f9', borderRadius: 12 },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  card: { display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '14px 18px' },
  cardIcon: { fontSize: 22 },
  cardInfo: { flex: 1 },
  cardDate: { fontWeight: 600, fontSize: 15 },
  cardDetail: { fontSize: 13, color: '#666', marginTop: 2 },
  cardInvalid: { fontSize: 12, color: '#dc2626', fontWeight: 600, marginTop: 4 },
  btnDelete: { width: 34, height: 34, display: 'inline-grid', placeItems: 'center', background: 'var(--btn-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-btn)', boxShadow: 'var(--btn-glass-shadow)', cursor: 'pointer', fontSize: 18, color: 'var(--text-secondary)' },
};
