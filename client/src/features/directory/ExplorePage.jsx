import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { directoryRequest, queryString } from './shared';
import { MunicipalityPicker, Notice } from './controls';
import './directory.css';

const DirectoryMap = lazy(() => import('./DirectoryMap'));
const LIMIT = 20;
export default function ExplorePage() {
  const [city, setCity] = useState(null);
  const [service, setService] = useState('');
  const [services, setServices] = useState([]);
  const [openNow, setOpenNow] = useState(false);
  const [maxPrice, setMaxPrice] = useState('');
  const [radius, setRadius] = useState('10');
  const [center, setCenter] = useState(null);
  const [query, setQuery] = useState(null);
  const [result, setResult] = useState({ items: [], hasMore: false });
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [locationMessage, setLocationMessage] = useState('');
  const locationRequest = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    directoryRequest('/directory/services', { signal: controller.signal }).then(data => setServices(data.items)).catch(() => {});
    return () => { controller.abort(); locationRequest.current += 1; };
  }, []);
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    directoryRequest(`/directory?${queryString(query)}`, { signal: controller.signal })
      .then(data => { setResult(data); setBusy(false); })
      .catch(err => { if (err.name !== 'AbortError') { setError(err.message); setBusy(false); } });
    return () => controller.abort();
  }, [query]);
  const search = (offset = 0, position = center) => {
    if (!position && !city) { setError('Selecione uma cidade ou use Perto de mim. No mapa, você também pode explorar outras regiões.'); return; }
    setBusy(true); setError(''); setResult({ items: [], hasMore: false });
    setQuery({ service, openNow: openNow ? true : undefined, maxPrice, ...(position ? { lat: position.lat, lng: position.lng, radiusKm: radius } : { municipalityCode: city?.code }), limit: LIMIT, offset });
  };
  const locate = () => {
    if (!navigator.geolocation) { setLocationMessage('Este dispositivo não disponibiliza localização. Selecione uma cidade.'); return; }
    const id = ++locationRequest.current;
    setLocating(true); setLocationMessage('');
    navigator.geolocation.getCurrentPosition(position => {
      if (id !== locationRequest.current) return;
      setLocating(false);
      const point = { lat: position.coords.latitude, lng: position.coords.longitude };
      setCenter(point); setCity(null);
      setLocationMessage(position.coords.accuracy > 1000 ? 'Localização aproximada. Se preferir, pesquise por cidade.' : 'Busca próxima da sua localização.');
      search(0, point);
    }, () => { if (id === locationRequest.current) { setLocating(false); setLocationMessage('Não conseguimos acessar sua localização. Selecione uma cidade para continuar.'); } }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  };
  return <div className="directory-page">
    <header className="directory-header"><Link to="/" aria-label="AgenteGestor, início"><img src="/agtgestor-logo.svg" alt="AgenteGestor" width="165" height="40" /></Link><nav aria-label="Navegação"><Link to="/dashboard/diretorio">Cadastrar meu salão</Link><Link to="/conta">Minha conta</Link></nav></header>
    <main id="directory-main" className="directory-content">
      <div className="directory-intro"><h1>Encontre seu próximo salão.</h1><p>Seu serviço, no lugar e no horário certos.</p></div>
      <form className="directory-search" onSubmit={event => { event.preventDefault(); locationRequest.current += 1; setLocating(false); search(); }}>
        <MunicipalityPicker value={city} onChange={value => { setCity(value); setCenter(null); locationRequest.current += 1; setLocating(false); setLocationMessage(''); }} />
        <label>Serviço<select value={service} onChange={event => setService(event.target.value)}><option value="">Todos os serviços</option>{services.map(item => <option key={item.slug} value={item.slug}>{item.name}</option>)}</select></label>
        <details className="directory-filters"><summary>Filtros{(maxPrice || openNow) ? ' ativos' : ''}</summary><div>        {center ? <label>Distância<select value={radius} onChange={event => setRadius(event.target.value)}>{[5, 10, 25, 50].map(km => <option key={km} value={km}>Até {km} km</option>)}</select></label> : null}
        <label>Preço até (R$)<input type="number" min="0" max="100000" step="0.01" value={maxPrice} onChange={event => setMaxPrice(event.target.value)} placeholder="Sem limite" /></label><label className="directory-checkbox"><input type="checkbox" checked={openNow} onChange={event => setOpenNow(event.target.checked)} />Aberto agora</label></div></details><div className="directory-actions"><button className="btn btn-primary" disabled={busy} type="submit">{busy ? 'Buscando…' : 'Buscar salões'}</button><button className="btn btn-secondary" disabled={locating} onClick={locate} type="button">{locating ? 'Localizando…' : 'Perto de mim'}</button></div>
      </form>
      <Notice>{locationMessage}</Notice>
      <Notice error>{error && `Não foi possível buscar salões: ${error}`}</Notice>
      <div className="directory-results-layout">
        <section className="directory-results" aria-label="Resultados da busca" aria-busy={busy}>
          <h2>{query ? 'Salões encontrados' : 'Sua busca começa aqui'}</h2>
          <p className="directory-muted">{query ? 'O preço considera os serviços associados à sua busca. Confirme valores e disponibilidade com o salão.' : 'Escolha uma cidade, use sua localização ou explore o mapa do Brasil.'}</p>
          {busy ? <p role="status" className="directory-empty">Buscando estabelecimentos…</p> : null}
          {!busy && query && !error && !result.items.length ? <div className="directory-empty"><h3>Nenhum salão nesta busca</h3><p>Tente outra cidade, amplie a distância ou remova o filtro de serviço.</p></div> : null}
          {result.items.map(item => <article className="directory-result" key={item.publicId}><div className="directory-result-heading"><h3><Link to={`/explorar/${encodeURIComponent(item.publicId)}`}>{item.name}</Link></h3>{Number.isFinite(item.distanceKm) ? <span>{new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(item.distanceKm)} km{item.location?.precision === 'approximate' ? ' aprox.' : ''}</span> : null}</div><p>{[item.neighborhood, item.city, item.uf].filter(Boolean).join(' · ')}</p><p>{item.openNow ? 'Aberto agora' : 'Consulte os horários'}{Number.isFinite(item.priceFrom) ? ` · Serviços a partir de ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(item.priceFrom)}` : ''}</p><p className="directory-description">{item.description}</p><div className="directory-tags">{item.services.slice(0, 4).map(slug => <span key={slug}>{services.find(serviceItem => serviceItem.slug === slug)?.name || slug}</span>)}</div><Link className="directory-profile-link" to={`/explorar/${encodeURIComponent(item.publicId)}`}>Conhecer salão <span aria-hidden="true">→</span></Link></article>)}
          {query && !busy && !error ? <nav className="directory-pagination" aria-label="Páginas dos resultados"><button className="btn btn-secondary" disabled={!query.offset} onClick={() => { setBusy(true); setResult({ items: [], hasMore: false }); setQuery(previous => ({ ...previous, offset: Math.max(0, previous.offset - LIMIT) })); }}>Anterior</button><span>Página {Math.floor(query.offset / LIMIT) + 1}</span><button className="btn btn-secondary" disabled={!result.hasMore} onClick={() => { setBusy(true); setResult({ items: [], hasMore: false }); setQuery(previous => ({ ...previous, offset: previous.offset + LIMIT })); }}>Próxima</button></nav> : null}
        </section>
        <Suspense fallback={<p role="status">Preparando o mapa…</p>}><DirectoryMap items={result.items} center={center} filters={query || { service, maxPrice, openNow: openNow ? true : undefined }} onSearchArea={point => { setCity(null); setCenter(point); search(0, point); }} /></Suspense>
      </div>
    </main><footer className="directory-footer"><Link to="/privacidade">Privacidade</Link><Link to="/termos">Termos de uso</Link><span>Seu salão pode aparecer aqui gratuitamente.</span></footer>
  </div>;
}
