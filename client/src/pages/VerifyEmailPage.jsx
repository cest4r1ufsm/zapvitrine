import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authAPI } from '../services/api';

// Page shown when user clicks the verification link from email (/verify-email?token=...)
export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [message, setMessage] = useState('');
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Link de verificação inválido.');
      return;
    }
    authAPI.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch((err) => {
        setStatus('error');
        setMessage(err.message || 'Token inválido ou já utilizado.');
      });
  }, [token]);

  return (
    <div className="auth-page auth-light">
      <div className="auth-glow" aria-hidden="true" />
      <div className="auth-container">
        <div className="auth-logo">
          <Link to="/" className="auth-logo-link">
            <img src="/agtgestor-logo.svg" alt="AGTGestor" />
          </Link>
          <span className="auth-eyebrow">— Confirme seu e-mail</span>
          <p>Falta só um passo para ativar sua conta</p>
        </div>

        <div className="auth-card" style={{ textAlign: 'center' }}>
          {status === 'loading' && (
            <div className="auth-loading-state">
              <div className="auth-spinner-lg" />
              <h2>Verificando <em>e-mail…</em></h2>
              <p>Aguarde um momento.</p>
            </div>
          )}

          {status === 'success' && (
            <div className="auth-success-state">
              <div className="auth-success-icon" style={{ color: 'var(--success)' }}>
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <h2>E-mail <em>confirmado</em></h2>
              <p>
                Sua conta foi ativada com sucesso. Agora você já pode entrar e começar a usar o AGTgestor.
              </p>
              <Link
                to="/login"
                state={{ success: 'E-mail confirmado! Faça login para acessar sua conta.' }}
                className="btn btn-primary btn-lg"
                style={{ display: 'inline-block', marginTop: '16px', padding: '14px 40px' }}
              >
                Ir para o login
              </Link>
            </div>
          )}

          {status === 'error' && (
            <div className="auth-error-state">
              <div className="auth-error-icon">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
              </div>
              <h2>Link <em>inválido</em></h2>
              <p>{message || 'Este link de verificação é inválido ou já foi utilizado.'}</p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '16px', flexWrap: 'wrap' }}>
                <Link to="/login" className="btn btn-outline">
                  Ir para o login
                </Link>
                <Link to="/register" className="btn btn-primary">
                  Criar nova conta
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Page shown right after registration (/verify-email-pending)
export function VerifyEmailPendingPage() {
  const [searchParams] = useSearchParams();
  // React Router stores state in window.history.state.usr
  const routeState = (() => {
    try { return window.history.state?.usr || {}; } catch { return {}; }
  })();
  const email = routeState.email || searchParams.get('email') || '';
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState('');

  const handleResend = async () => {
    if (!email) return;
    setResendLoading(true);
    setResendMessage('');
    try {
      await authAPI.resendVerification(email);
      setResendMessage('E-mail reenviado! Verifique sua caixa de entrada.');
    } catch {
      setResendMessage('Erro ao reenviar. Tente novamente.');
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
          <span className="auth-eyebrow">— Confirme seu e-mail</span>
          <p>Falta só um passo para ativar sua conta</p>
        </div>

        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="auth-success-icon" style={{ color: 'var(--primary)' }}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>

          <h2>Confirme seu <em>e-mail</em></h2>

          <p className="auth-card-subtitle" style={{ lineHeight: 1.7 }}>
            Enviamos um link de confirmação para{' '}
            {email ? <strong className="auth-mono-mail">{email}</strong> : 'seu e-mail'}.
            <br />
            Clique no link para ativar sua conta.
          </p>

          <div className="auth-checklist">
            <div className="auth-check-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span>Verifique sua caixa de entrada</span>
            </div>
            <div className="auth-check-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span>Verifique a pasta de spam</span>
            </div>
            <div className="auth-check-item">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              <span>Clique no link de confirmação</span>
            </div>
          </div>

          {resendMessage && (
            <div className={`alert ${resendMessage.includes('Erro') ? 'alert-error' : 'alert-success'}`} style={{ textAlign: 'left', marginBottom: '16px' }}>
              {resendMessage}
            </div>
          )}

          {email && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={handleResend}
              disabled={resendLoading}
              style={{ marginBottom: '12px' }}
            >
              {resendLoading ? 'Reenviando...' : 'Reenviar e-mail de confirmação'}
            </button>
          )}
        </div>

        <div className="auth-footer">
          Já confirmou? <Link to="/login">Fazer login</Link>
        </div>
      </div>
    </div>
  );
}
