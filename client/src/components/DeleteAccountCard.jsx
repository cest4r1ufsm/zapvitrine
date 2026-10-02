import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';

// Exclusão de conta dentro do app — exigida pela Play Store.
export default function DeleteAccountCard({ isPlaySubscriber }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await authAPI.deleteAccount(password);
      logout();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" id="excluir-conta" style={{ maxWidth: 600, margin: '32px auto 0', padding: '24px 20px' }}>
      <h3 style={{ marginBottom: '8px' }}>Excluir conta</h3>
      <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '16px' }}>
        Apaga para sempre sua conta, sua loja, serviços, profissionais, agenda, clientes e imagens.
        O WhatsApp é desconectado. Não dá para desfazer.
      </p>
      {isPlaySubscriber && (
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '16px' }}>
          Sua assinatura do Google Play não é cancelada sozinha. Cancele antes na Play Store.
        </p>
      )}

      {!open ? (
        <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
          Excluir minha conta
        </button>
      ) : (
        <form onSubmit={handleDelete}>
          <div className="form-group">
            <label htmlFor="delete-password">Digite sua senha para confirmar</label>
            <input
              id="delete-password"
              className="form-input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p role="alert" style={{ color: 'var(--danger, #ef4444)', marginBottom: '12px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-danger" disabled={loading || !password}>
              {loading ? 'Excluindo...' : 'Excluir para sempre'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={loading}
              onClick={() => { setOpen(false); setPassword(''); setError(''); }}>
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
