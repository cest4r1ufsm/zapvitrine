import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authAPI.forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-logo">
          <h1>AGTgestor</h1>
          <p>Gestão de agenda e atendimentos</p>
        </div>

        <div className="auth-card">
          {sent ? (
            <div className="auth-success-state">
              <div className="auth-success-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                  <polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <h2>E-mail enviado!</h2>
              <p>
                Enviamos um link de redefinição de senha para <strong>{email}</strong>.
                Verifique sua caixa de entrada (e o spam, se não encontrar).
              </p>
              <p className="auth-info-small">O link expira em 1 hora.</p>
              <Link to="/login" className="btn btn-primary" style={{ display: 'inline-block', marginTop: '8px' }}>
                Voltar ao login
              </Link>
            </div>
          ) : (
            <>
              <div className="auth-back">
                <Link to="/login" className="auth-back-link">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                  Voltar ao login
                </Link>
              </div>
              <h2>Esqueceu sua senha?</h2>
              <p className="auth-card-subtitle">
                Informe seu e-mail e enviaremos um link para você criar uma nova senha.
              </p>

              {error && <div className="alert alert-error">{error}</div>}

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
                    autoFocus
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%', marginTop: '8px' }}
                  disabled={loading}
                >
                  {loading ? (
                    <span className="btn-loading">
                      <span className="btn-spinner" /> Enviando...
                    </span>
                  ) : 'Enviar link de redefinição'}
                </button>
              </form>
            </>
          )}
        </div>

        {!sent && (
          <div className="auth-footer">
            Lembrou a senha? <Link to="/login">Fazer login</Link>
          </div>
        )}
      </div>
    </div>
  );
}
