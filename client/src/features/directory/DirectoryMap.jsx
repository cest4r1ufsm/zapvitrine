import { useEffect, useRef, useState } from 'react';
import { directoryRequest, queryString } from './shared';
import 'mapbox-gl/dist/mapbox-gl.css';

export default function DirectoryMap({ items, center, filters = {}, onSearchArea }) {
  const container = useRef(null);
  const mapRef = useRef(null);
  const [error, setError] = useState('');
  const [clusterMessage, setClusterMessage] = useState('');
  const [ready, setReady] = useState(false);
  const token = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN;
  useEffect(() => {
    if (!token) return;
    let disposed = false;
    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (disposed) return;
      const map = new mapboxgl.Map({ container: container.current, accessToken: token, style: 'mapbox://styles/mapbox/streets-v12', center: [-51.9, -14.2], zoom: 3, attributionControl: true });
      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl(), 'top-right');
      map.on('load', () => {
        if (disposed) return;
        map.addSource('national', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        map.addLayer({ id: 'national-clusters', type: 'circle', source: 'national', paint: { 'circle-color': '#526071', 'circle-radius': ['step', ['get', 'count'], 13, 10, 19, 100, 25], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
        map.addLayer({ id: 'national-labels', type: 'symbol', source: 'national', layout: { 'text-field': ['to-string', ['get', 'count']], 'text-size': 12 }, paint: { 'text-color': '#ffffff' } });
        map.on('click', 'national-clusters', event => { const feature = event.features?.[0]; if (feature) map.easeTo({ center: feature.geometry.coordinates, zoom: Math.min(map.getZoom() + 2, 17) }); });
        map.addSource('salons', { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, cluster: true, clusterRadius: 45 });
        map.addLayer({ id: 'clusters', type: 'circle', source: 'salons', filter: ['has', 'point_count'], paint: { 'circle-color': '#2b3441', 'circle-radius': 23 } });
        map.addLayer({ id: 'cluster-labels', type: 'symbol', source: 'salons', filter: ['has', 'point_count'], layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 13 }, paint: { 'text-color': '#ffffff' } });
        map.addLayer({ id: 'salon-points', type: 'circle', source: 'salons', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': '#2b3441', 'circle-radius': 9, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } });
        map.on('click', 'salon-points', event => {
          const item = event.features?.[0];
          if (!item) return;
          const link = document.createElement('a');
          link.textContent = item.properties.name;
          link.href = `/explorar/${encodeURIComponent(item.properties.publicId)}`;
          new mapboxgl.Popup().setLngLat(item.geometry.coordinates).setDOMContent(link).addTo(map);
        });
        map.on('click', 'clusters', async event => {
          const feature = event.features?.[0];
          if (!feature) return;
          try { const zoom = await map.getSource('salons').getClusterExpansionZoom(feature.properties.cluster_id); if (!disposed) map.easeTo({ center: feature.geometry.coordinates, zoom }); } catch { /* A replacement search can remove this cluster. */ }
        });
        setReady(true);
      });
      map.on('error', () => setError('Não foi possível carregar parte do mapa. Use a lista de salões.'));
    }).catch(() => { if (!disposed) setError('Mapa indisponível. A lista de salões continua disponível.'); });
    return () => { disposed = true; mapRef.current?.remove(); mapRef.current = null; };
  }, [token]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const features = items.filter(item => Number.isFinite(item.location?.lat) && Number.isFinite(item.location?.lng)).map(item => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [item.location.lng, item.location.lat] }, properties: { name: item.name, publicId: item.publicId } }));
    map.getSource('salons')?.setData({ type: 'FeatureCollection', features });
    if (features.length) {
      const coords = features.map(feature => feature.geometry.coordinates);
      map.fitBounds([[Math.min(...coords.map(c => c[0])), Math.min(...coords.map(c => c[1]))], [Math.max(...coords.map(c => c[0])), Math.max(...coords.map(c => c[1]))]], { padding: 65, maxZoom: 14, duration: 0 });
    } else if (center) map.jumpTo({ center: [center.lng, center.lat], zoom: 12 });
  }, [items, center, ready]);
  const filterKey = queryString({ service: filters.service, municipalityCode: filters.municipalityCode, openNow: filters.openNow, minPrice: filters.minPrice, maxPrice: filters.maxPrice });
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    let timer;
    let controller;
    let requestVersion = 0;
    let disposed = false;
    const refresh = () => {
      const version = ++requestVersion;
      clearTimeout(timer); controller?.abort();
      timer = setTimeout(() => {
        const bounds = map.getBounds();
        const west = Math.max(-180, bounds.getWest()), east = Math.min(180, bounds.getEast());
        const south = Math.max(-85, bounds.getSouth()), north = Math.min(85, bounds.getNorth());
        if (west >= east || south >= north) return;
        controller = new AbortController();
        directoryRequest(`/directory/clusters?${filterKey}&bbox=${[west, south, east, north].join(',')}`, { signal: controller.signal }).then(data => {
          if (disposed || version !== requestVersion) return;
          map.getSource('national')?.setData({ type: 'FeatureCollection', features: data.items.map(item => ({ type: 'Feature', properties: { count: item.count }, geometry: { type: 'Point', coordinates: [item.lng, item.lat] } })) });
          setClusterMessage(data.truncated ? 'Aproxime o mapa para detalhar esta região.' : '');
        }).catch(err => { if (!disposed && version === requestVersion && err.name !== 'AbortError') { map.getSource('national')?.setData({ type: 'FeatureCollection', features: [] }); setClusterMessage('Não foi possível atualizar os pontos desta região. A lista continua disponível.'); } });
      }, 350);
    };
    map.on('moveend', refresh); refresh();
    return () => { disposed = true; clearTimeout(timer); controller?.abort(); map.off('moveend', refresh); };
  }, [ready, filterKey]);
  return <section className={`directory-map-panel${!token ? ' is-unavailable' : ''}`} aria-label="Mapa dos resultados desta página">
    {token ? <div ref={container} className="directory-map" /> : <div className="directory-map-unavailable"><h2>Explore pela lista</h2><p>O mapa está indisponível neste momento. Você pode buscar cidades, ver perfis e entrar em contato pela lista.</p></div>}
    {error ? <p role="status" className="directory-map-message">{error}</p> : null}
    <p className="directory-map-caption">Os círculos contam os salões desta região com os filtros escolhidos. Pontos aproximados não indicam o endereço exato.</p>{clusterMessage ? <p className="directory-map-message" role="status">{clusterMessage}</p> : null}{ready ? <button className="btn btn-secondary directory-map-search" type="button" onClick={() => { const point = mapRef.current.getCenter(); onSearchArea?.({ lat: point.lat, lng: point.lng }); }}>Buscar perto do centro do mapa</button> : null}
  </section>;
}
