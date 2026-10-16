import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../services/api';
import { directoryRequest, mutate } from './shared';
import { Notice } from './controls';
import './directory.css';

function AccountAccess() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (creating) { await register(name, email, password, 'consumer'); setMessage('Confira seu e-mail e confirme o cadastro antes de entrar.'); setCreating(false); setPassword(''); }
      else { await login(email, password); const target = params.get('returnTo'); if (target && /^\/explorar\/[a-zA-Z0-9_-]+$/.test(target)) navigate(target); }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <section className="directory-account-access"><h1>{creating ? 'Crie sua conta gratuita' : 'Seus salões e agendamentos'}</h1><p>Entre para salvar favoritos, agendar e acompanhar seus atendimentos.</p><Notice error>{error}</Notice><Notice>{message}</Notice><form onSubmit={submit}>{creating ? <label>Seu nome<input autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label> : null}<label>E-mail<input required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label><label>Senha<input required type="password" minLength={creating ? 10 : 1} maxLength={128} autoComplete={creating ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} /></label>{creating ? <label className="directory-checkbox"><input type="checkbox" required />Li e aceito os <Link to="/termos">Termos de Uso</Link> e a <Link to="/privacidade">Política de Privacidade</Link>.</label> : <Link to="/forgot-password">Esqueci minha senha</Link>}<button className="btn btn-primary" disabled={busy}>{busy ? 'Aguarde…' : creating ? 'Criar conta' : 'Entrar'}</button><button type="button" className="btn btn-secondary" disabled={busy} onClick={() => { setCreating(value => !value); setError(''); }}>{creating ? 'Já tenho uma conta' : 'Criar conta gratuita'}</button></form>{!creating && email ? <button type="button" className="directory-text-button" disabled={busy} onClick={async () => { setBusy(true); try { await authAPI.resendVerification(email); setMessage('Se houver uma conta aguardando confirmação, enviaremos um novo e-mail.'); } catch (err) { setError(err.message); } finally { setBusy(false); } }}>Reenviar confirmação de e-mail</button> : null}</section>;
}

function AccountContent() {
  const { user, logout } = useAuth();
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState('bookings');
  const [more, setMore] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [favorites, setFavorites] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(null);
  const [reload, setReload] = useState(0);
  const [reviews, setReviews] = useState({});
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([directoryRequest(`/me/favorites?offset=${page * 50}`, { signal: controller.signal }), directoryRequest(`/me/bookings?offset=${page * 50}`, { signal: controller.signal })]).then(([saved, appointments]) => { setFavorites(saved.items); setBookings(appointments.items); setMore(Boolean(tab === 'bookings' ? appointments.hasMore : saved.hasMore)); setLoading(false); }).catch(err => { if (err.name !== 'AbortError') { setError(err.message); setLoading(false); } });
    return () => controller.abort();
  }, [reload, page, tab]);
  const cancel = async booking => {
    if (!window.confirm(`Cancelar seu atendimento em ${booking.storeName}?`)) return;
    setBusy(booking.id); setError('');
    try { await mutate(`/me/bookings/${booking.id}/cancel`, {}); setMessage('Cancelamento confirmado.'); setReload(value => value + 1); } catch (err) { setError(err.message); } finally { setBusy(null); }
  };
  const review = async (event, booking) => {
    event.preventDefault(); setBusy(booking.id); setError('');
    try { await mutate(`/me/bookings/${booking.id}/review`, { rating: Number(reviews[booking.id]?.rating || 5), text: reviews[booking.id]?.text || '' }); setMessage('Avaliação enviada para análise antes da publicação.'); setReload(value => value + 1); } catch (err) { setError(err.message); } finally { setBusy(null); }
  };
  return <><div className="directory-account-heading"><h1>Olá, {user.name}</h1><button className="btn btn-secondary" onClick={logout}>Sair da conta</button></div><Notice error>{error}</Notice><Notice>{message}</Notice><button className="directory-text-button" onClick={() => { setError(''); setLoading(true); setReload(value => value + 1); }}>Atualizar meus dados</button>{loading ? <p role="status">Carregando sua conta…</p> : null}<div className="flow-account-tabs" role="group" aria-label="Minha conta">{[['bookings', 'Agendamentos'], ['favorites', 'Favoritos']].map(([value, label]) => <button type="button" key={value} aria-pressed={tab === value} onClick={() => { setTab(value); setPage(0); setError(''); setLoading(true); }}>{label}</button>)}</div><section hidden={tab !== 'bookings'}><h2>Seus agendamentos</h2>{!loading && !error && !bookings.length ? <p>Você ainda não tem agendamentos pelo diretório.</p> : null}{bookings.map(booking => <article className="directory-result" key={booking.id}><h3>{booking.storeName}</h3><p>{booking.productName} · {String(booking.date).slice(0, 10).split('-').reverse().join('/')} às {booking.time}</p><p>Horário local: {booking.timeZone} · {({ pending: 'Aguardando confirmação', confirmed: 'Confirmado', completed: 'Concluído', cancelled: 'Cancelado' })[booking.status] || booking.status}</p>{booking.listingPublicId ? <Link to={`/explorar/${encodeURIComponent(booking.listingPublicId)}`}>{['completed', 'cancelled'].includes(booking.status) ? 'Agendar novamente' : 'Ver salão'}</Link> : null}{['pending', 'confirmed'].includes(booking.status) ? <button className="btn btn-secondary" disabled={busy !== null} onClick={() => cancel(booking)}>Cancelar agendamento</button> : null}{booking.status === 'completed' && !booking.reviewed ? <form className="directory-review-form" onSubmit={event => review(event, booking)}><label>Sua nota<select value={reviews[booking.id]?.rating || '5'} onChange={event => setReviews(previous => ({ ...previous, [booking.id]: { ...previous[booking.id], rating: event.target.value } }))}>{[5, 4, 3, 2, 1].map(rating => <option key={rating} value={rating}>{rating} de 5</option>)}</select></label><label>Como foi o atendimento?<textarea required minLength={10} maxLength={1000} value={reviews[booking.id]?.text || ''} onChange={event => setReviews(previous => ({ ...previous, [booking.id]: { ...previous[booking.id], text: event.target.value } }))} /></label><button className="btn btn-primary" disabled={busy !== null}>Enviar avaliação</button></form> : null}</article>)}</section><section hidden={tab !== 'favorites'}><h2>Salões favoritos</h2>{!loading && !error && !favorites.length ? <p>Salve os salões que você quer visitar.</p> : null}{favorites.map(item => <article className="directory-result" key={item.publicId}><h3><Link to={`/explorar/${encodeURIComponent(item.publicId)}`}>{item.name}</Link></h3><p>{item.city} / {item.uf}</p><button className="directory-text-button" disabled={busy !== null} onClick={async () => { setBusy(item.publicId); try { await directoryRequest(`/me/favorites/${encodeURIComponent(item.publicId)}`, { method: 'DELETE' }); setFavorites(current => current.filter(entry => entry.publicId !== item.publicId)); } catch (err) { setError(err.message); } finally { setBusy(null); } }}>Remover dos favoritos</button></article>)}</section><nav className="directory-pagination" aria-label="Páginas da minha conta"><button className="btn btn-secondary" disabled={!page || loading} onClick={() => { setLoading(true); setPage(value => Math.max(0, value - 1)); }}>Anteriores</button><span>Página {page + 1}</span><button className="btn btn-secondary" disabled={!more || loading} onClick={() => { setLoading(true); setPage(value => value + 1); }}>Próximos</button></nav><details className="directory-report"><summary>Excluir minha conta</summary><p>A exclusão é permanente. Agendamentos e obrigações de retenção são tratados conforme a Política de Privacidade.</p><form onSubmit={async event => { event.preventDefault(); if (!window.confirm('Excluir permanentemente sua conta?')) return; setBusy('delete'); setError(''); try { await authAPI.deleteAccount(deletePassword); await logout(); } catch (err) { setError(err.message); } finally { setBusy(null); } }}><label>Confirme sua senha<input type="password" autoComplete="current-password" required value={deletePassword} onChange={event => setDeletePassword(event.target.value)} /></label><button className="btn btn-secondary" disabled={busy !== null}>Excluir conta permanentemente</button></form></details>{user.role !== 'consumer' ? <Link to="/dashboard">Acessar meu negócio</Link> : null}</>;
}

export default function ConsumerAccount() {
  const { user, loading, sessionError, restoreSession } = useAuth();
  return <main className="directory-page directory-detail"><Link to="/explorar">← Encontrar salões</Link>{loading ? <p role="status">Verificando sua sessão…</p> : sessionError ? <><Notice error>{sessionError}</Notice><button className="btn btn-primary" onClick={restoreSession}>Tentar novamente</button></> : user ? <AccountContent /> : <AccountAccess />}</main>;
}
