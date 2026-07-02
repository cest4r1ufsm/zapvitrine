import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function EyeIcon({ open }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function PasswordStrength({ password }) {
  if (!password) return null;

  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  const levels = [
    { label: 'Muito fraca', color: '#FF4757' },
    { label: 'Fraca', color: '#FF6B35' },
    { label: 'Boa', color: '#FFB800' },
    { label: 'Forte', color: '#00C48C' },
    { label: 'Muito forte', color: '#00C48C' },
  ];
  const level = levels[score] || levels[0];

  return (
    <div className="password-strength">
      <div className="strength-bars">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="strength-bar"
            style={{ background: i <= score ? level.color : 'var(--border)' }}
          />
        ))}
      </div>
      <span className="strength-label" style={{ color: level.color }}>{level.label}</span>
    </div>
  );
}

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }

    setLoading(true);
    try {
      await register(name, email, password);
      navigate('/verify-email-pending', { state: { email } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page auth-light">
      <div className="auth-glow" aria-hidden="true" />
      <div className="auth-container" style={{ maxWidth: '460px' }}>
        <div className="auth-logo">
          <Link to="/" className="auth-logo-link">
            <img src="/agtgestor-logo.svg" alt="AGTGestor" />
          </Link>
          <span className="auth-eyebrow">— Crie sua conta</span>
          <p>Comece grátis em menos de um minuto</p>
        </div>

        <div className="auth-card">
          <h2>Crie sua <em>conta</em></h2>
          <p className="auth-card-subtitle">Grátis para começar, sem cartão de crédito</p>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Seu nome</label>
              <input
                type="text"
                className="form-input"
                placeholder="Como quer ser chamado"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoComplete="name"
              />
            </div>

            <div className="form-group">
              <label>E-mail</label>
              <input
                type="email"
                className="form-input"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="form-group">
              <label>Senha</label>
              <div className="input-password-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Mínimo 8 caracteres"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
              <PasswordStrength password={password} />
            </div>

            <div className="form-group">
              <label>Confirmar senha</label>
              <div className="input-password-wrapper">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  className={`form-input ${confirmPassword && password !== confirmPassword ? 'input-error' : ''}`}
                  placeholder="Repita a senha"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowConfirm(!showConfirm)}
                  tabIndex={-1}
                >
                  <EyeIcon open={showConfirm} />
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <span className="field-error">As senhas não coincidem</span>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: '8px' }}
              disabled={loading}
            >
              {loading ? (
                <span className="btn-loading">
                  <span className="btn-spinner" /> Criando conta...
                </span>
              ) : 'Criar Conta Grátis'}
            </button>
          </form>

          <p className="auth-terms">
            Ao criar uma conta você concorda com nossos{' '}
            <a href="#" onClick={(e) => e.preventDefault()}>Termos de Uso</a>{' '}
            e{' '}
            <a href="#" onClick={(e) => e.preventDefault()}>Política de Privacidade</a>.
          </p>
        </div>

        <div className="auth-footer">
          Já tem conta? <Link to="/login">Fazer login</Link>
        </div>
      </div>
    </div>
  );
}
