import { useEffect, useState } from 'react';
import { directoryRequest, mutate } from './shared';
import { Notice } from './controls';

export default function ReviewsManager({ admin = false }) {
  const [items, setItems] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    directoryRequest(`${admin ? '/admin/directory/reviews' : '/me/reviews'}?offset=${offset}`, { signal: controller.signal }).then(data => { setItems(data.items); setHasMore(Boolean(data.hasMore)); }).catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [admin, offset, reload]);
  const act = async (review, action) => {
    setBusy(review.id); setError(''); setMessage('');
    try {
      if (admin) await mutate(`/admin/directory/reviews/${encodeURIComponent(review.id)}/moderate`, { action, reason: drafts[review.id] || '' });
      else await mutate(`/me/reviews/${encodeURIComponent(review.id)}/respond`, { response: drafts[review.id] || '' });
      setMessage(admin ? 'Decisão registrada.' : 'Resposta enviada para análise.'); setReload(value => value + 1);
    } catch (err) { setError(err.message); } finally { setBusy(null); }
  };
  return <section className="directory-review-manager"><h2>{admin ? 'Moderação de avaliações' : 'Avaliações dos seus atendimentos'}</h2><Notice error>{error}</Notice><Notice>{message}</Notice><button className="directory-text-button" onClick={() => { setError(''); setReload(value => value + 1); }}>Atualizar avaliações</button>{items.map(review => <article className="directory-result" key={review.id}><h3>{review.listing?.name || `Nota ${review.rating} de 5`}</h3>{admin ? <p>Nota {review.rating} de 5 · {review.status === 'pending' ? 'Em análise' : review.status === 'published' ? 'Publicada' : 'Rejeitada'}</p> : null}<p>{review.text}</p>{review.response ? <p><strong>Resposta do salão:</strong> {review.response}</p> : null}<label>{admin ? 'Motivo da decisão' : 'Sua resposta pública'}<textarea maxLength={1000} value={drafts[review.id] || ''} onChange={event => setDrafts(previous => ({ ...previous, [review.id]: event.target.value }))} /></label><div className="directory-actions">{admin ? <>{review.status === 'pending' ? <><button className="btn btn-primary" disabled={busy !== null} onClick={() => act(review, 'publish')}>Publicar avaliação</button><button className="btn btn-secondary" disabled={busy !== null || (drafts[review.id] || '').trim().length < 5} onClick={() => act(review, 'reject')}>Rejeitar avaliação</button></> : null}{review.responseStatus === 'pending' ? <><button className="btn btn-primary" disabled={busy !== null} onClick={() => act(review, 'publish-response')}>Publicar resposta</button><button className="btn btn-secondary" disabled={busy !== null || (drafts[review.id] || '').trim().length < 5} onClick={() => act(review, 'reject-response')}>Rejeitar resposta</button></> : null}</> : <button className="btn btn-primary" disabled={busy !== null || (drafts[review.id] || '').trim().length < 5} onClick={() => act(review)}>Enviar resposta</button>}</div></article>)}<nav className="directory-pagination" aria-label="Páginas de avaliações"><button className="btn btn-secondary" disabled={!offset || busy !== null} onClick={() => setOffset(value => Math.max(0, value - (admin ? 100 : 50)))}>Anteriores</button><button className="btn btn-secondary" disabled={!hasMore || busy !== null} onClick={() => setOffset(value => value + (admin ? 100 : 50))}>Próximas</button></nav></section>;
}
