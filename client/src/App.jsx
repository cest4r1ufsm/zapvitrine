import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Dashboard from './pages/Dashboard';
import PublicStore from './pages/PublicStore';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import { VerifyEmailPage, VerifyEmailPendingPage } from './pages/VerifyEmailPage';
import LegalPage from './pages/LegalPage';

const ConsumerAccount = lazy(() => import('./features/directory/ConsumerAccount'));
const ExplorePage = lazy(() => import('./features/directory/ExplorePage'));
const ListingPage = lazy(() => import('./features/directory/ListingPage'));

function SessionRecovery() {
  const { sessionError, restoreSession, logout } = useAuth();
  return <main className="auth-page"><div className="auth-card">
    <h1>Conexão interrompida</h1><p role="alert">{sessionError}</p>
    <button className="btn btn-primary" onClick={restoreSession}>Tentar novamente</button>
    <button className="btn btn-secondary" onClick={logout}>Sair da conta</button>
  </div></main>;
}

function PrivateRoute({ children, businessOnly = false }) {
  const { user, loading, sessionError } = useAuth();
  if (loading) return <div className="loading-spinner" />;
  if (sessionError) return <SessionRecovery />;
  if (user && businessOnly && user.role === 'consumer') return <Navigate to="/conta" replace />;
  return user ? children : <Navigate to="/login" />;
}

function GuestRoute({ children }) {
  const { user, loading, sessionError } = useAuth();
  if (loading) return <div className="loading-spinner" />;
  if (sessionError) return <SessionRecovery />;
  return !user ? children : <Navigate to="/dashboard" />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/conta" element={<Suspense fallback={<p role="status">Carregando conta…</p>}><ConsumerAccount /></Suspense>} />
          <Route path="/explorar" element={<Suspense fallback={<p role="status">Carregando busca…</p>}><ExplorePage /></Suspense>} />
          <Route path="/explorar/:publicId" element={<Suspense fallback={<p role="status">Carregando perfil…</p>}><ListingPage /></Suspense>} />
          <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
          <Route path="/forgot-password" element={<GuestRoute><ForgotPasswordPage /></GuestRoute>} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/verify-email-pending" element={<VerifyEmailPendingPage />} />
          <Route path="/dashboard/*" element={<PrivateRoute businessOnly><Dashboard /></PrivateRoute>} />
          <Route path="/loja/:slug" element={<PublicStore />} />
          <Route path="/privacidade" element={<LegalPage page="privacidade" />} />
          <Route path="/termos" element={<LegalPage page="termos" />} />
          <Route path="/excluir-conta" element={<LegalPage page="excluir-conta" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
