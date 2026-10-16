import { useEffect, useState } from 'react';
import { directoryRequest, UFS } from './shared';

export function Notice({ children, error = false }) {
  return children ? <p className={`directory-notice${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{children}</p> : null;
}
export function MunicipalityPicker({ value, onChange, initialLabel = '' }) {
  const [uf, setUf] = useState('');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('');
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setStatus('Buscando cidades…');
      directoryRequest(`/directory/municipalities?${new URLSearchParams({ q: query.trim(), uf })}`, { signal: controller.signal })
        .then(data => { setItems(data.items); setStatus(data.items.length ? '' : 'Nenhuma cidade encontrada. Confira a escrita.'); })
        .catch(error => { if (error.name !== 'AbortError') setStatus('Não foi possível buscar cidades. Tente novamente.'); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, uf]);
  return <div className="directory-city-picker">
    <label>Estado<select value={uf} onChange={event => { setUf(event.target.value); setItems([]); onChange(null); }}><option value="">Todo o Brasil</option>{UFS.map(item => <option key={item}>{item}</option>)}</select></label>
    <label>Cidade<input value={query} placeholder={initialLabel || 'Digite pelo menos 2 letras'} autoComplete="off" maxLength={100} onChange={event => { setQuery(event.target.value); setItems([]); setStatus(''); onChange(null); }} /></label>
    {value ? <p className="directory-selected">Cidade selecionada: {value.name} / {value.uf}</p> : null}
    {!value && query.trim().length >= 2 && items.length > 0 ? <ul className="directory-city-options" aria-label="Cidades encontradas">{items.map(city => <li key={city.code}><button type="button" onClick={() => { onChange(city); setQuery(''); setItems([]); setStatus(''); }}>{city.name} / {city.uf}</button></li>)}</ul> : null}
    <Notice>{status}</Notice>
  </div>;
}
