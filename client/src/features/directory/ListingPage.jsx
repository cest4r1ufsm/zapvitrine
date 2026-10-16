import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { contactUrl, directoryRequest, mutate, routeUrl } from './shared';
import { Notice } from './controls';
import ListingActions from './ListingActions';
import './directory.css';

const DAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
export default function ListingPage() {
  const { publicId } = useParams();
  const { user } = useAuth();
  const [loadedListing, setListing] = useState(null);
  const listing = loadedListing?.publicId === publicId ? loadedListing : null;
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [reportMessage, setReportMessage] = useState('');
  const [sending, setSending] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    directoryRequest(`/directory/listings/${encodeURIComponent(publicId)}`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) { setListing(data); setError(''); } }).catch(err => { if (!controller.signal.aborted && err.name !== 'AbortError') setError(err.status === 404 ? 'Este perfil não está disponível.' : 'Não foi possível carregar este salão. Atualize a página para tentar novamente.'); });
    return () => controller.abort();
  }, [publicId]);
  const report = async event => {
    event.preventDefault(); setSending(true); setReportMessage('');
    try { await mutate(`/directory/listings/${encodeURIComponent(publicId)}/reports`, { reason }); setReason(''); setReportMessage('Denúncia recebida. Nossa equipe vai analisar o perfil.'); } catch (err) { setReportMessage(err.message); } finally { setSending(false); }
  };
  return <main className="directory-page directory-detail"><Link to="/explorar">← Buscar salões</Link><Notice error>{error}</Notice>{!listing && !error ? <p role="status">Carregando perfil…</p> : null}{listing ? <><h1>{listing.name}</h1><p className="directory-muted">{[listing.neighborhood, listing.city, listing.uf].filter(Boolean).join(' · ')}</p><p className="directory-detail-description">{listing.description}</p><div className="directory-actions">{listing.onlineBookingEnabled && listing.products?.length ? <a className="btn btn-primary" href="#agendar">Agendar uma visita</a> : null}{contactUrl(listing.phone) ? <a className="btn btn-secondary" href={contactUrl(listing.phone)} target="_blank" rel="noopener noreferrer">Conversar no WhatsApp</a> : null}{routeUrl(listing) ? <a className="btn btn-secondary" href={routeUrl(listing)} target="_blank" rel="noopener noreferrer">Como chegar</a> : null}{listing.storeSlug ? <Link className="btn btn-secondary" to={`/loja/${encodeURIComponent(listing.storeSlug)}`}>Ver serviços e fotos</Link> : null}</div><p className="directory-muted">A solicitação fica confirmada quando o salão aceitar.</p><ListingActions key={listing.publicId} listing={listing} /><section><h2>Localização</h2><p>{listing.location?.precision === 'exact' ? listing.address : 'Localização aproximada. Solicite o endereço ao estabelecimento antes de sair.'}</p></section><section><h2>Horários informados pelo salão</h2><p className="directory-muted">Horário local: {listing.timeZone}. Não indica disponibilidade para agendamento.</p><dl className="directory-hours">{DAYS.map((day, index) => <div key={day}><dt>{day}</dt><dd>{listing.hours?.[index]?.length ? listing.hours[index].map(period => `${period.start}–${period.end}`).join(', ') : 'Sem horário informado'}</dd></div>)}</dl></section><details className="directory-report"><summary>Informar um problema com este perfil</summary>{user ? <form onSubmit={report}><label>O que precisa ser verificado?<textarea required minLength={10} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} /></label><button className="btn btn-secondary" disabled={sending}>{sending ? 'Enviando…' : 'Enviar para análise'}</button><Notice>{reportMessage}</Notice></form> : <p><Link to={`/conta?returnTo=${encodeURIComponent(`/explorar/${publicId}`)}`}>Entre na sua conta</Link> para enviar uma denúncia.</p>}</details></> : null}</main>;
}
