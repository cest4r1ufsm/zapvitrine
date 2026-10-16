import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { directoryRequest, mutate, statusLabels } from './shared';
import { Notice } from './controls';
import ReviewsManager from './ReviewsManager';
import './directory.css';

export default function ModerationPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState('pending');
  const [reportOffset, setReportOffset] = useState(0);
  const [moreReports, setMoreReports] = useState(false);
  const [reports, setReports] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [reasons, setReasons] = useState({});
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (user?.role !== 'admin') return;
    const controller = new AbortController();
    directoryRequest(`/admin/directory?${new URLSearchParams({ status, offset })}`, { signal: controller.signal }).then(data => { setItems(data.items); setHasMore(Boolean(data.hasMore)); setLoading(false); }).catch(err => { if (err.name !== 'AbortError') { setError(err.message); setLoading(false); } });
    directoryRequest(`/admin/directory/reports?offset=${reportOffset}`, { signal: controller.signal }).then(data => { setReports(data.items); setMoreReports(Boolean(data.hasMore)); }).catch(err => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [user?.role, status, reload, offset, reportOffset]);
  const moderate = async (item, action) => {
    if (!window.confirm(`${action === 'publish' ? 'Publicar' : action === 'reject' ? 'Rejeitar' : 'Suspender'} o perfil de ${item.name}?`)) return;
    setBusy(item.publicId); setError(''); setMessage('');
    try { await mutate(`/admin/directory/${encodeURIComponent(item.publicId)}/moderate`, { version: item.version, action, reason: reasons[item.publicId] || '' }); setItems(current => current.filter(entry => entry.publicId !== item.publicId)); setMessage('Decisão registrada.'); } catch (err) { setError(err.message); } finally { setBusy(null); }
  };
  const resolveReport = async report => {
    setBusy(report.id); setError('');
    try { await mutate(`/admin/directory/reports/${encodeURIComponent(report.id)}/resolve`, { reason: reasons[report.id] || '' }); setReports(current => current.filter(item => item.id !== report.id)); setMessage('Denúncia analisada e encerrada.'); } catch (err) { setError(err.message); } finally { setBusy(null); }
  };
  const inspectReport = async report => {
    setBusy(report.id); setError('');
    try { const { listing } = await directoryRequest(`/admin/directory/listings/${encodeURIComponent(report.listing.publicId)}`); setItems([listing]); setHasMore(false); setMessage('Exibindo o perfil denunciado acima. Use Atualizar fila para voltar à fila completa.'); } catch (err) { setError(err.message); } finally { setBusy(null); }
  };
  if (user?.role !== 'admin') return <Notice error>Esta área é restrita à administração.</Notice>;
  return <section className="directory-owner"><h1>Moderação do diretório</h1><p>Confira identidade, contato, endereço e serviços antes de publicar.</p><label>Situação<select value={status} onChange={event => { setStatus(event.target.value); setOffset(0); setLoading(true); setItems([]); setError(''); }}>{['pending', 'published', 'rejected', 'suspended'].map(value => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label><Notice error>{error}</Notice><Notice>{message}</Notice><button className="btn btn-secondary" onClick={() => { setLoading(true); setError(''); setReload(value => value + 1); }}>Atualizar fila</button>{loading ? <p role="status">Carregando perfis…</p> : !items.length && !error ? <p>Nenhum perfil nesta fila.</p> : null}{items.map(item => <article className="directory-moderation-item" key={item.publicId}><h2>{item.name}</h2><p>{item.description}</p><dl><dt>Contato</dt><dd>{item.phone}</dd><dt>Endereço</dt><dd>{item.address} · {item.neighborhood} · Município {item.municipalityCode}</dd><dt>Localização pública</dt><dd>{item.locationPrecision === 'exact' ? 'Exata' : 'Aproximada'} · {item.latitude}, {item.longitude}</dd><dt>Serviços</dt><dd>{item.services.join(', ')}</dd></dl><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.latitude},${item.longitude}`)}`} target="_blank" rel="noopener noreferrer">Conferir localização</a><label>Motivo da decisão<textarea minLength={10} maxLength={1000} value={reasons[item.publicId] || ''} onChange={event => setReasons(previous => ({ ...previous, [item.publicId]: event.target.value }))} /></label><div className="directory-actions">{['pending', 'suspended'].includes(item.status) ? <><button disabled={Boolean(busy)} className="btn btn-primary" onClick={() => moderate(item, 'publish')}>Aprovar publicação</button><button disabled={Boolean(busy) || (reasons[item.publicId] || '').trim().length < 10} className="btn btn-secondary" onClick={() => moderate(item, 'reject')}>Solicitar ajustes</button></> : null}{item.status === 'published' ? <button disabled={Boolean(busy) || (reasons[item.publicId] || '').trim().length < 10} className="btn btn-secondary" onClick={() => moderate(item, 'suspend')}>Suspender perfil</button> : null}</div></article>)}<nav className="directory-pagination" aria-label="Páginas da moderação"><button className="btn btn-secondary" disabled={loading || !offset} onClick={() => { setLoading(true); setOffset(value => Math.max(0, value - 100)); }}>Anterior</button><span>Página {offset / 100 + 1}</span><button className="btn btn-secondary" disabled={loading || !hasMore} onClick={() => { setLoading(true); setOffset(value => value + 100); }}>Próxima</button></nav><section><h2>Denúncias abertas</h2>{!reports.length ? <p>Nenhuma denúncia pendente.</p> : reports.map(report => <article className="directory-moderation-item" key={report.id}><h3>{report.listing.name}</h3><p>{report.reason}</p><a href={`/explorar/${encodeURIComponent(report.listing.publicId)}`} target="_blank" rel="noopener noreferrer">Ver perfil público</a><button className="btn btn-secondary" disabled={Boolean(busy)} onClick={() => inspectReport(report)}>Abrir perfil para moderação</button><label>Conclusão da análise<textarea maxLength={1000} value={reasons[report.id] || ''} onChange={event => setReasons(previous => ({ ...previous, [report.id]: event.target.value }))} /></label><button className="btn btn-secondary" disabled={Boolean(busy) || (reasons[report.id] || '').trim().length < 5} onClick={() => resolveReport(report)}>Encerrar denúncia</button></article>)}<nav className="directory-pagination" aria-label="Páginas de denúncias"><button className="btn btn-secondary" disabled={!reportOffset || loading} onClick={() => setReportOffset(value => Math.max(0, value - 100))}>Denúncias anteriores</button><button className="btn btn-secondary" disabled={!moreReports || loading} onClick={() => setReportOffset(value => value + 100)}>Próximas denúncias</button></nav></section><ReviewsManager admin /></section>;
}
