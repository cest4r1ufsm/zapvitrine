import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';

function EyeIcon({ open }) {
  return open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Show success message if coming from email verification or password reset
  const successMessage = location.state?.success || '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setNeedsVerification(false);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err) {
      if (err.message === 'E-mail não confirmado') {
        setNeedsVerification(true);
        setError('Você ainda não confirmou seu e-mail. Verifique sua caixa de entrada.');
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setResendSuccess('');
    try {
      await authAPI.resendVerification(email);
      setResendSuccess('E-mail de confirmação reenviado! Verifique sua caixa de entrada.');
    } catch {
      setResendSuccess('Erro ao reenviar. Tente novamente.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="auth-page auth-light">
      <div className="auth-glow" aria-hidden="true" />
      <div className="auth-container">
        <div className="auth-logo">
          <Link to="/" className="auth-logo-link">
            <img src="/agtgestor-logo.svg" alt="AGTGestor" />
          </Link>
          <span className="auth-eyebrow">Acesse sua conta</span>
          <p>Gestão de agenda e atendimentos</p>
        </div>

        <div className="auth-card">
          <h2>Entre na sua <em>conta</em></h2>

          {successMessage && (
            <div className="alert alert-success">{successMessage}</div>
          )}

          {error && (
            <div className="alert alert-error">
              {error}
              {needsVerification && email && (
                <div style={{ marginTop: '10px' }}>
                  <button
                    type="button"
                    className="auth-link-btn"
                    onClick={handleResend}
                    disabled={resendLoading}
                  >
                    {resendLoading ? 'Reenviando...' : 'Reenviar e-mail de confirmação'}
                  </button>
                </div>
              )}
              {resendSuccess && (
                <div style={{ marginTop: '8px', color: 'var(--success)', fontSize: '13px' }}>
                  {resendSuccess}
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit}>
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
              <div className="form-label-row">
                <label>Senha</label>
                <Link to="/forgot-password" className="auth-label-link">Esqueci minha senha</Link>
              </div>
              <div className="input-password-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="form-input"
                  placeholder="Sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: '8px' }}
              disabled={loading}
            >
              {loading ? (
                <span className="btn-loading">
                  <span className="btn-spinner" /> Entrando...
                </span>
              ) : 'Entrar'}
            </button>
          </form>
        </div>

        <div className="auth-footer">
          Ainda não tem conta? <Link to="/register">Criar conta grátis</Link>
        </div>
      </div>
    </div>
  );
}
