import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import UIIcon from '../../components/UIIcon';
import { directoryRequest, mutate, queryString, routeUrl } from './shared';
import { Notice } from './controls';

const money = value => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
function readDraft(key) {
  try {
    const draft = JSON.parse(sessionStorage.getItem(key));
    return draft && Date.now() - draft.savedAt < 30 * 60000 ? draft : {};
  } catch { return {}; }
}
export default function BookingFlow({ listing }) {
  const { user } = useAuth();
  const key = `agt-booking:${listing.publicId}`;
  const [draft] = useState(() => readDraft(key));
  const [step, setStep] = useState(draft.time ? 2 : draft.productId ? 1 : 0);
  const [productId, setProductId] = useState(draft.productId || '');
  const [professionalId, setProfessionalId] = useState(draft.professionalId || '');
  const [date, setDate] = useState(draft.date || '');
  const [time, setTime] = useState(draft.time || '');
  const [phone, setPhone] = useState('');
  const [availability, setAvailability] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [uncertain, setUncertain] = useState(Boolean(draft.uncertain));
  const idempotency = useRef(draft.idempotency || null);
  const heading = useRef(null);
  const previousStep = useRef(step);
  const product = listing.products?.find(item => String(item.id) === String(productId));
  const requiresProfessional = availability?.professionals?.length > 0;
  const selectedProfessional = availability?.professionals?.find(item => String(item.id) === String(professionalId));
  
  const dateParts = new Intl.DateTimeFormat('en', { timeZone: listing.timeZone || 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const today = ['year', 'month', 'day'].map(type => dateParts.find(part => part.type === type).value).join('-');
  const selectionValid = product && date >= today && time && availability?.slots?.includes(time) && (!requiresProfessional || selectedProfessional);

  useEffect(() => {
    if (!date || !productId) return;
    const controller = new AbortController();
    let active = true;
    directoryRequest(`/directory/listings/${encodeURIComponent(listing.publicId)}/availability?${queryString({ productId, professionalId, date })}`, { signal: controller.signal })
      .then(data => { if (active) { setAvailability(data); setLoading(false); } })
      .catch(err => { if (active && err.name !== 'AbortError') { setError('Não foi possível consultar os horários. Tente novamente.'); setLoading(false); } });
    return () => { active = false; controller.abort(); };
  }, [listing.publicId, productId, professionalId, date, reload]);

  useEffect(() => {
    if (previousStep.current !== step) { heading.current?.focus(); previousStep.current = step; }
    if (receipt) return;
    try { sessionStorage.setItem(key, JSON.stringify({ productId, professionalId, date, time, uncertain, idempotency: idempotency.current, savedAt: Date.now() })); } catch { /* booking remains usable without storage */ }
  }, [key, productId, professionalId, date, time, step, receipt, uncertain]);

  const change = (setter, value) => {
    setter(value); setTime(''); setAvailability(null); setError(''); setLoading(Boolean(value)); idempotency.current = null;
  };
  const book = async event => {
    event.preventDefault();
    if (busy || !selectionValid || !user || uncertain) return;
    setBusy(true); setError('');
    if (!idempotency.current) idempotency.current = crypto.randomUUID();
    try { sessionStorage.setItem(key, JSON.stringify({ productId, professionalId, date, time, uncertain, idempotency: idempotency.current, savedAt: Date.now() })); } catch { /* optional */ }
    try {
      const result = await mutate(`/directory/listings/${encodeURIComponent(listing.publicId)}/bookings`, { productId: Number(productId), professionalId: professionalId ? Number(professionalId) : null, date, time, customerPhone: phone, idempotencyKey: idempotency.current });
      setReceipt({ status: result.booking?.status || 'pending', productName: product.name, price: product.price, date, time, professionalName: selectedProfessional?.name });
      try { sessionStorage.removeItem(key); } catch { /* optional */ }
    } catch (err) {
      if (err.status === 409) { setError('Este horário acabou de ser ocupado. Escolha outro.'); setTime(''); setAvailability(null); setLoading(true); setStep(1); setReload(value => value + 1); idempotency.current = null; }
      else { setError(err.status >= 500 || !err.status ? 'Não recebemos a confirmação. Confira seus agendamentos antes de tentar novamente.' : err.message); if (!err.status || err.status >= 500) setUncertain(true); }
    } finally { setBusy(false); }
  };
  if (receipt) return <section className="booking-flow booking-receipt" aria-labelledby="booking-title" role="status">
    <span className="booking-success-mark"><UIIcon name="check" size={28} /></span>
    <h2 id="booking-title">{receipt.status === 'confirmed' ? 'Agendamento confirmado' : 'Solicitação enviada'}</h2>
    <p>{receipt.status === 'confirmed' ? 'Tudo certo para sua visita.' : 'O salão ainda precisa confirmar seu horário.'}</p>
    <dl className="booking-summary"><div><dt>Salão</dt><dd>{listing.name}</dd></div><div><dt>Serviço</dt><dd>{receipt.productName}</dd></div><div><dt>Quando</dt><dd>{receipt.date.split('-').reverse().join('/')} · {receipt.time}</dd></div>{receipt.professionalName && <div><dt>Profissional</dt><dd>{receipt.professionalName}</dd></div>}<div><dt>Valor do serviço</dt><dd>{money(receipt.price)}</dd></div></dl>
    <div className="directory-actions"><Link className="btn btn-primary" to="/conta">Ver meus agendamentos</Link>{routeUrl(listing) && <a className="btn btn-secondary" href={routeUrl(listing)} target="_blank" rel="noopener noreferrer">Como chegar</a>}</div>
  </section>;

  return <section className="booking-flow" id="agendar" aria-labelledby="booking-title" aria-busy={busy}>
    <ol className="booking-progress" aria-label="Etapas do agendamento">{['Serviço', 'Horário', 'Revisão'].map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined} className={index <= step ? 'is-current' : ''}><span>{index + 1}</span>{label}</li>)}</ol>
    <h2 id="booking-title" ref={heading} tabIndex={-1}>{['Qual serviço você quer?', 'Escolha seu horário', 'Confira sua visita'][step]}</h2>
    <Notice error>{error || (uncertain ? 'Confira seus agendamentos antes de iniciar outra solicitação.' : '')}</Notice>
    <form onSubmit={book}>
      {step === 0 && <div className="booking-service-list">{listing.products?.map(item => <button type="button" className={`booking-service${String(productId) === String(item.id) ? ' is-selected' : ''}`} aria-pressed={String(productId) === String(item.id)} key={item.id} onClick={() => { setProductId(String(item.id)); setProfessionalId(''); setDate(today); setTime(''); setAvailability(null); setError(''); idempotency.current = null; }}><span><strong>{item.name}</strong>{item.duration ? <small>{item.duration} min</small> : null}</span><strong>{money(item.price)}</strong><span className="booking-radio" aria-hidden="true" /></button>)}</div>}
      {step === 1 && <div className="booking-fields">
        <p className="booking-selection">{product?.name} · {money(product?.price || 0)}</p>
        <label>Data<input type="date" required min={today} value={date} onChange={event => change(setDate, event.target.value)} /></label>
        {requiresProfessional && <label>Profissional<select value={professionalId} onChange={event => change(setProfessionalId, event.target.value)}><option value="">Escolha quem vai atender</option>{availability.professionals.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {loading || date && !availability && !error ? <p role="status">Buscando horários…</p> : null}
        {error && date && !availability && !loading && <button type="button" className="btn btn-secondary" onClick={() => { setError(''); setLoading(true); setReload(value => value + 1); }}>Tentar novamente</button>}
        {availability && (!requiresProfessional || professionalId) && <fieldset className="booking-times"><legend>Horários disponíveis</legend>{availability.slots?.length ? availability.slots.map(slot => <button className={time === slot ? 'is-selected' : ''} aria-pressed={time === slot} type="button" key={slot} onClick={() => { setTime(slot); idempotency.current = null; }}>{slot}</button>) : <p>Sem horários nesta data. Escolha outro dia.</p>}</fieldset>}
        {date && <p className="booking-hint">Horário local do salão · {availability?.timeZone || listing.timeZone}</p>}
      </div>}
      {step === 2 && <>
        <dl className="booking-summary"><div><dt>Serviço</dt><dd>{product?.name || 'Serviço indisponível'}</dd></div><div><dt>Quando</dt><dd>{date.split('-').reverse().join('/')} · {time}</dd></div>{selectedProfessional && <div><dt>Profissional</dt><dd>{selectedProfessional.name}</dd></div>}<div><dt>Valor do serviço</dt><dd>{money(product?.price || 0)}</dd></div></dl>
        <p className="booking-hint">O salão confirma a solicitação. Nenhum pagamento é feito nesta etapa.</p>
        {!selectionValid && <p role="status">{loading || !availability && !error ? 'Conferindo disponibilidade…' : 'Confira o horário antes de continuar.'}</p>}
        {user ? <label>Seu WhatsApp<input type="tel" required minLength={10} maxLength={20} autoComplete="tel" placeholder="DDD + número" value={phone} onChange={event => { setPhone(event.target.value); idempotency.current = null; }} /></label> : <p>Entre para concluir. Suas escolhas ficam salvas por 30 minutos neste navegador.</p>}
      </>}
      <div className="booking-footer">
        {step > 0 && <button type="button" className="btn btn-secondary" disabled={busy || uncertain} onClick={() => setStep(value => value - 1)}>Voltar</button>}
        {step < 2 ? <button type="button" className="btn btn-primary" disabled={step === 0 ? !product : !selectionValid} onClick={() => setStep(value => value + 1)}>Continuar</button> : user ? <button className="btn btn-primary" disabled={busy || !selectionValid || uncertain}>{busy ? 'Enviando…' : 'Solicitar agendamento'}</button> : <Link className="btn btn-primary" to={`/conta?returnTo=${encodeURIComponent(`/explorar/${listing.publicId}`)}`}>Entrar e concluir</Link>}
      </div>
      {uncertain && <Link className="directory-text-button" to="/conta">Conferir meus agendamentos</Link>}
    </form>
  </section>;
}
