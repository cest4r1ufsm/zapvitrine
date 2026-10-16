import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { directoryRequest } from './shared';
import { Notice } from './controls';
import BookingFlow from './BookingFlow';

export default function ListingActions({ listing }) {
  const { user } = useAuth();
  const [favorite, setFavorite] = useState(false);
  const [reviewOffset, setReviewOffset] = useState(0);
  const [reviewMore, setReviewMore] = useState(false);
  const [reviewStats, setReviewStats] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [reviewsError, setReviewsError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    directoryRequest(`/directory/listings/${encodeURIComponent(listing.publicId)}/reviews?offset=${reviewOffset}`, { signal: controller.signal }).then(data => { if (controller.signal.aborted) return; setReviewsError(''); setReviews(data.items); setReviewMore(Boolean(data.hasMore)); setReviewStats(data.count ? { count: data.count, average: data.average } : null); }).catch(err => { if (!controller.signal.aborted && err.name !== 'AbortError') setReviewsError('As avaliações estão indisponíveis. Tente novamente mais tarde.'); });
    if (user) directoryRequest(`/me/favorites/${encodeURIComponent(listing.publicId)}`, { signal: controller.signal }).then(data => setFavorite(Boolean(data.saved))).catch(err => { if (err.name !== 'AbortError') setError('Não foi possível consultar seus favoritos.'); });
    return () => controller.abort();
  }, [listing.publicId, user, reviewOffset]);
  const toggleFavorite = async () => {
    setBusy(true); setError('');
    try { await directoryRequest(`/me/favorites/${encodeURIComponent(listing.publicId)}`, { method: favorite ? 'DELETE' : 'PUT', body: '{}' }); setFavorite(value => !value); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <><div className="booking-favorite"><Notice error>{error}</Notice>{user ? <button className="directory-text-button" aria-pressed={favorite} disabled={busy} onClick={toggleFavorite}>{favorite ? 'Salão salvo' : 'Salvar salão'}</button> : <Link to={`/conta?returnTo=${encodeURIComponent(`/explorar/${listing.publicId}`)}`}>Salvar salão</Link>}</div>{listing.onlineBookingEnabled && listing.products?.length ? <BookingFlow key={listing.publicId} listing={listing} /> : <p>Agendamento pelo WhatsApp do salão.</p>}<section><h2>Avaliações de atendimentos</h2>{reviewStats ? <p>{new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(reviewStats.average)} de 5 · {reviewStats.count} avaliações publicadas</p> : null}<Notice error>{reviewsError}</Notice>{!reviewsError && !reviews.length ? <p>Este salão ainda não tem avaliações publicadas de atendimentos pelo aplicativo.</p> : reviews.map(review => <article className="directory-result" key={review.id}><strong>Nota {review.rating} de 5</strong><p>{review.text}</p>{review.response ? <p><strong>Resposta do salão:</strong> {review.response}</p> : null}</article>)}<nav className="directory-pagination" aria-label="Páginas de avaliações"><button className="btn btn-secondary" disabled={!reviewOffset} onClick={() => setReviewOffset(value => Math.max(0, value - 20))}>Anteriores</button><button className="btn btn-secondary" disabled={!reviewMore} onClick={() => setReviewOffset(value => value + 20)}>Próximas</button></nav></section></>;
}
