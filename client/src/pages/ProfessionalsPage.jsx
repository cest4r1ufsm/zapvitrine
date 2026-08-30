import { useState, useEffect } from 'react';
import api from '../services/api';
import PageGuide from '../components/PageGuide';
import UIIcon from '../components/UIIcon';
import { btnPrimary } from '../styles/buttons';
import { avatar } from '../styles/surfaces';

const GUIDE_STEPS = [
  'Clique em <strong>+ Adicionar</strong> e digite o nome do profissional (ex: João, Maria).',
  'Profissionais <strong>ativos</strong> aparecem para o cliente escolher no chatbot antes de agendar.',
  'Para desativar temporariamente durante férias ou folgas, use a ação de pausar. O profissional deixa de aparecer no chatbot, mas não é excluído.',
  '<strong>Sem profissionais cadastrados</strong>, o chatbot pula essa etapa e agenda normalmente.',
];

export default function ProfessionalsPage() {
  const [professionals, setProfessionals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { fetchProfessionals(); }, []);

  async function fetchProfessionals() {
    try {
      const data = await api.get('/professionals');
      setProfessionals(data);
    } catch {
      setError('Erro ao carregar profissionais');
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const created = await api.post('/professionals', { name: newName.trim() });
      setProfessionals(prev => [...prev, created]);
      setNewName('');
    } catch {
      setError('Erro ao adicionar profissional');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(prof) {
    try {
      const updated = await api.patch(`/professionals/${prof.id}`, { active: !prof.active });
      setProfessionals(prev => prev.map(p => p.id === prof.id ? updated : p));
    } catch {
      setError('Erro ao atualizar profissional');
    }
  }

  async function handleEdit(prof) {
    if (editingId === prof.id) {
      if (!editingName.trim()) return;
      try {
        const updated = await api.patch(`/professionals/${prof.id}`, { name: editingName.trim() });
        setProfessionals(prev => prev.map(p => p.id === prof.id ? updated : p));
        setEditingId(null);
      } catch {
        setError('Erro ao editar profissional');
      }
    } else {
      setEditingId(prof.id);
      setEditingName(prof.name);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Remover este profissional?')) return;
    try {
      await api.delete(`/professionals/${id}`);
      setProfessionals(prev => prev.filter(p => p.id !== id));
    } catch {
      setError('Erro ao remover profissional');
    }
  }

  if (loading) return <div style={styles.loading}>Carregando...</div>;

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Profissionais</h1>
      <p style={styles.subtitle}>Gerencie os profissionais da sua equipe. O cliente escolherá o profissional no chatbot antes de agendar.</p>
      <PageGuide pageKey="professionals" title="Como gerenciar profissionais" steps={GUIDE_STEPS} />

      {error && <div style={styles.error}>{error}</div>}

      <form onSubmit={handleAdd} style={styles.form}>
        <input
          style={styles.input}
          placeholder="Nome do profissional..."
          value={newName}
          onChange={e => setNewName(e.target.value)}
          maxLength={60}
        />
        <button type="submit" style={styles.btnPrimary} disabled={saving || !newName.trim()}>
          {saving ? 'Adicionando...' : '+ Adicionar'}
        </button>
      </form>

      {professionals.length === 0 ? (
        <div style={styles.empty}>
          <p>Nenhum profissional cadastrado ainda.</p>
          <p style={{ fontSize: 13, color: '#888' }}>Adicione os profissionais da sua equipe para que os clientes possam escolher pelo chatbot.</p>
        </div>
      ) : (
        <div style={styles.list}>
          {professionals.map(prof => (
            <div key={prof.id} style={{ ...styles.card, opacity: prof.active ? 1 : 0.55 }}>
              <div style={styles.cardLeft}>
                <div style={styles.avatar}>{prof.name[0].toUpperCase()}</div>
                {editingId === prof.id ? (
                  <input
                    style={styles.inputInline}
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <div>
                    <div style={styles.profName}>{prof.name}</div>
                    <div style={styles.profStatus}>{prof.active ? 'Ativo' : 'Inativo'}</div>
                  </div>
                )}
              </div>
              <div style={styles.cardActions}>
                <button style={styles.btnIcon} onClick={() => handleEdit(prof)} title={editingId === prof.id ? 'Salvar' : 'Editar'}>
                  <UIIcon name={editingId === prof.id ? 'check' : 'edit'} />
                </button>
                {editingId === prof.id && (
                  <button style={styles.btnIcon} onClick={() => setEditingId(null)} title="Cancelar"><UIIcon name="close" /></button>
                )}
                <button style={styles.btnIcon} onClick={() => handleToggle(prof)} title={prof.active ? 'Desativar' : 'Ativar'}>
                  <UIIcon name={prof.active ? 'pause' : 'play'} size={16} />
                </button>
                <button style={{ ...styles.btnIcon, color: '#ef4444' }} onClick={() => handleDelete(prof.id)} title="Remover"><UIIcon name="delete" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { maxWidth: 700, margin: '0 auto', padding: '32px 16px' },
  title: { fontSize: 26, fontWeight: 700, marginBottom: 6 },
  subtitle: { color: '#666', marginBottom: 28, fontSize: 14 },
  error: { background: '#fee2e2', color: '#dc2626', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontSize: 14 },
  loading: { textAlign: 'center', padding: 60, color: '#888' },
  form: { display: 'flex', gap: 10, marginBottom: 28 },
  input: { flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd', fontSize: 15 },
  inputInline: { padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)', fontSize: 15, width: 200 },
  btnPrimary: btnPrimary,
  empty: { textAlign: 'center', padding: 48, color: '#666', background: '#f9f9f9', borderRadius: 12 },
  list: { display: 'flex', flexDirection: 'column', gap: 12 },
  card: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '14px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  cardLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  avatar: { ...avatar, width: 42, height: 42, borderRadius: '50%', fontSize: 18 },
  profName: { fontWeight: 600, fontSize: 16 },
  profStatus: { fontSize: 12, color: '#888', marginTop: 2 },
  cardActions: { display: 'flex', gap: 6 },
  btnIcon: { width: 34, height: 34, display: 'inline-grid', placeItems: 'center', background: 'var(--btn-surface)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 18, padding: 0, borderRadius: 'var(--radius-btn)', boxShadow: 'var(--btn-glass-shadow)' },
};
