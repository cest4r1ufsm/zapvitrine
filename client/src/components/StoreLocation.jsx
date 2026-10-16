import { useState } from 'react';
import UIIcon from './UIIcon';
import './StoreLocation.css';

export default function StoreLocation({ name, address }) {
  const [failed, setFailed] = useState(false);
  const destination = String(address || '').trim();
  if (!destination) return null;
  const query = encodeURIComponent(destination);
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${query}`;
  return <section className="store-location" id="localizacao" aria-labelledby="store-location-title">
    <div className="store-location-heading">
      <div><h2 id="store-location-title">Seu próximo destino</h2><p>Encontre {name} e planeje sua chegada.</p></div>
      <UIIcon name="pin" size={24} />
    </div>
    <div className="store-location-map">
      {!failed ? <iframe
        key={destination}
        title={`Mapa do endereço de ${name}`}
        src={`https://www.google.com/maps?q=${query}&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
        onError={() => setFailed(true)}
      /> : <p role="status">Não foi possível carregar o mapa. Você pode abrir a rota abaixo.</p>}
    </div>
    <div className="store-location-footer">
      <div className="store-location-address"><span className="store-location-pin"><UIIcon name="pin" size={20} /></span><div><strong>{name}</strong><p>{destination}</p></div></div>
      <a className="store-location-route" href={directions} target="_blank" rel="noopener noreferrer">Como chegar <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg></a>
    </div>
  </section>;
}
