import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { storeAPI, productsAPI } from '../services/api';
import OfficialWhatsAppConnection from '../components/OfficialWhatsAppConnection';
import UIIcon from '../components/UIIcon';
import { SETUP_SEEN_KEY, setupStatus } from '../services/setupStatus';
import '../styles/setup.css';

const WA_BUSINESS_URL = 'https://play.google.com/store/apps/details?id=com.whatsapp.w4b';

const DAY_KEYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const DAY_LABELS = { monday: 'Segunda', tuesday: 'Terça', wednesday: 'Quarta', thursday: 'Quinta', friday: 'Sexta', saturday: 'Sábado', sunday: 'Domingo' };

function hoursFor(days, open, close, saturday) {
  return Object.fromEntries(DAY_KEYS.map(key => {
    if (key === 'saturday' && saturday) return [key, { active: true, open: saturday[0], close: saturday[1] }];
    return [key, { active: days.includes(key), open, close }];
  }));
}

const HOUR_PRESETS = [
  { id: 'seg-sab', label: 'Segunda a sábado', detail: '9h às 18h', hours: hoursFor(DAY_KEYS.slice(0, 6), '09:00', '18:00') },
  { id: 'seg-sex-sab', label: 'Segunda a sexta', detail: '9h às 18h. Sábado 9h às 13h', hours: hoursFor(DAY_KEYS.slice(0, 5), '09:00', '18:00', ['09:00', '13:00']) },
  { id: 'ter-sab', label: 'Terça a sábado', detail: '9h às 19h', hours: hoursFor(DAY_KEYS.slice(1, 6), '09:00', '19:00') },
];

const SERVICE_IDEAS = ['Corte feminino', 'Corte masculino', 'Escova', 'Manicure', 'Barba', 'Sobrancelha'];
const DURATIONS = [30, 45, 60, 90];

const slugify = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

const STEPS = ['salon', 'hours', 'service', 'whatsapp'];

function Progress({ index }) {
  return <div className="setup-progress" aria-label={`Passo ${index + 1} de ${STEPS.length}`}>
    {STEPS.map((step, i) => <span key={step} className={i <= index ? 'is-on' : ''} />)}
    <small>Passo {index + 1} de {STEPS.length}</small>
  </div>;
}

export default function SetupWizard() {
  const { store, refreshStore } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState(null);
  const [step, setStep] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [preset, setPreset] = useState(HOUR_PRESETS[1].id);
  const [custom, setCustom] = useState(null);
  const [service, setService] = useState({ name: '', price: '', duration: 45 });
  const [hasBusinessApp, setHasBusinessApp] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    localStorage.setItem(SETUP_SEEN_KEY, 'true');
    productsAPI.list().then(setProducts).catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    if (!store || products === null || step !== null) return;
    setName(/^Loja de /.test(store.name || '') ? '' : store.name || '');
    setPhone(store.phone || '');
    const status = setupStatus(store, products);
    const first = STEPS.find(key => !status[key]);
    setStep(first ? STEPS.indexOf(first) : STEPS.length);
  }, [store, products, step]);

  const next = () => { setError(''); setStep(s => s + 1); window.scrollTo(0, 0); };
  const back = () => { setError(''); setStep(s => Math.max(0, s - 1)); window.scrollTo(0, 0); };

  const run = async (action) => {
    setBusy(true); setError('');
    try { await action(); next(); }
    catch (err) { setError(err.message || 'Não deu certo. Tente de novo.'); }
    finally { setBusy(false); }
  };

  const saveSalon = (e) => {
    e.preventDefault();
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) { setError('Digite o número com DDD. Exemplo: 44 99999-8888'); return; }
    run(async () => {
      await storeAPI.update({ name: name.trim(), phone: digits });
      // The signup link ends in a number (ana-2). Give the salon a link with its own name.
      const slug = slugify(name);
      if (slug && /-\d+$/.test(store?.slug || '')) {
        await storeAPI.update({ slug }).catch(() => storeAPI.update({ slug: `${slug}-${store.id}` })).catch(() => {});
      }
      await refreshStore();
    });
  };

  const saveHours = () => run(async () => {
    const hours = custom || HOUR_PRESETS.find(p => p.id === preset).hours;
    await storeAPI.update({ schedulingConfig: JSON.stringify({ slotInterval: 30, hours }) });
    await refreshStore();
  });

  const saveService = (e) => {
    e.preventDefault();
    const price = String(service.price).replace(',', '.');
    if (!service.name.trim()) { setError('Escreva o nome do serviço.'); return; }
    if (!(Number(price) >= 0) || price === '') { setError('Escreva o preço. Exemplo: 50'); return; }
    run(async () => {
      const created = await productsAPI.create({ name: service.name.trim(), price, duration: service.duration, active: true });
      setProducts(list => [...(list || []), created]);
    });
  };

  const onConnection = useCallback(async (connection) => {
    if (!connection?.connected) return;
    try { await storeAPI.updateChatbot({ botEnabled: true }); } catch { /* the owner can still turn it on later */ }
    await refreshStore().catch(() => {});
    setStep(STEPS.length);
  }, [refreshStore]);

  if (step === null) return <div className="loading-spinner" />;

  const startCustom = () => setCustom(structuredClone(HOUR_PRESETS.find(p => p.id === preset).hours));
  const setDay = (key, patch) => setCustom(c => ({ ...c, [key]: { ...c[key], ...patch } }));
  const storeUrl = `${window.location.origin}/loja/${store?.slug || ''}`;

  return <div className="setup">
    {step < STEPS.length && <Progress index={step} />}
    {error && <p className="alert alert-error" role="alert">{error}</p>}

    {step === 0 && <form onSubmit={saveSalon} className="setup-card">
      <h1>Como se chama seu salão?</h1>
      <p className="setup-lead">É o nome que seus clientes vão ver.</p>
      <label className="setup-label" htmlFor="setup-name">Nome do salão</label>
      <input id="setup-name" className="form-input setup-input" value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Salão da Ana" required autoFocus />
      <label className="setup-label" htmlFor="setup-phone">WhatsApp do salão</label>
      <input id="setup-phone" className="form-input setup-input" type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ex: 44 99999-8888" required />
      <p className="setup-hint">O número que seus clientes já usam para falar com você.</p>
      <button className="btn btn-primary setup-main" disabled={busy}>{busy ? 'Salvando...' : 'Continuar'}</button>
    </form>}

    {step === 1 && <div className="setup-card">
      <h1>Quando você atende?</h1>
      <p className="setup-lead">Escolha o mais parecido. Dá para mudar depois.</p>
      {!custom ? <>
        <div className="setup-options">
          {HOUR_PRESETS.map(p => <button type="button" key={p.id} className={`booking-service${preset === p.id ? ' is-selected' : ''}`} onClick={() => setPreset(p.id)} aria-pressed={preset === p.id}>
            <span>{p.label}<small>{p.detail}</small></span><span className="booking-radio" />
          </button>)}
        </div>
        <button type="button" className="setup-link" onClick={startCustom}>Meu horário é diferente</button>
      </> : <div className="setup-days">
        {DAY_KEYS.map(key => <div key={key} className={`setup-day${custom[key].active ? '' : ' is-off'}`}>
          <label><input type="checkbox" checked={custom[key].active} onChange={e => setDay(key, { active: e.target.checked })} /> {DAY_LABELS[key]}</label>
          {custom[key].active ? <span>
            <input type="time" aria-label={`${DAY_LABELS[key]} abre`} value={custom[key].open} onChange={e => setDay(key, { open: e.target.value })} />
            <span>às</span>
            <input type="time" aria-label={`${DAY_LABELS[key]} fecha`} value={custom[key].close} onChange={e => setDay(key, { close: e.target.value })} />
          </span> : <em>Fechado</em>}
        </div>)}
        <button type="button" className="setup-link" onClick={() => setCustom(null)}>Voltar às opções prontas</button>
      </div>}
      <button type="button" className="btn btn-primary setup-main" disabled={busy} onClick={saveHours}>{busy ? 'Salvando...' : 'Continuar'}</button>
      <button type="button" className="setup-back" onClick={back}>Voltar</button>
    </div>}

    {step === 2 && <form onSubmit={saveService} className="setup-card">
      <h1>Qual serviço você mais faz?</h1>
      <p className="setup-lead">Comece com um. Depois você coloca os outros.</p>
      <div className="setup-chips">
        {SERVICE_IDEAS.map(idea => <button type="button" key={idea} className={service.name === idea ? 'is-selected' : ''} onClick={() => setService(s => ({ ...s, name: idea }))}>{idea}</button>)}
      </div>
      <label className="setup-label" htmlFor="setup-service">Nome do serviço</label>
      <input id="setup-service" className="form-input setup-input" value={service.name} onChange={e => setService(s => ({ ...s, name: e.target.value }))} placeholder="Ex: Corte feminino" required />
      <label className="setup-label" htmlFor="setup-price">Preço (R$)</label>
      <input id="setup-price" className="form-input setup-input" inputMode="decimal" value={service.price} onChange={e => setService(s => ({ ...s, price: e.target.value.replace(/[^\d,.]/g, '') }))} placeholder="Ex: 50" required />
      <fieldset className="booking-times setup-durations">
        <legend>Quanto tempo demora?</legend>
        {DURATIONS.map(d => <button type="button" key={d} className={service.duration === d ? 'is-selected' : ''} onClick={() => setService(s => ({ ...s, duration: d }))}>{d < 60 ? `${d} min` : d === 60 ? '1 hora' : '1h30'}</button>)}
      </fieldset>
      <button className="btn btn-primary setup-main" disabled={busy}>{busy ? 'Salvando...' : 'Continuar'}</button>
      <button type="button" className="setup-back" onClick={back}>Voltar</button>
    </form>}

    {step === 3 && <div className="setup-card">
      <h1>Ligue o robô no seu WhatsApp</h1>
      <p className="setup-lead">Ele responde seus clientes e marca horários sozinho, até de madrugada.</p>
      {hasBusinessApp === null && <>
        <p className="setup-question">No seu celular, o WhatsApp tem um <strong>B</strong> no ícone?</p>
        <div className="setup-options">
          <button type="button" className="booking-service" onClick={() => setHasBusinessApp(true)}><span>Sim, tem o B<small>Uso o WhatsApp Business</small></span><span className="setup-wa-icon is-business">B</span></button>
          <button type="button" className="booking-service" onClick={() => setHasBusinessApp(false)}><span>Não tem o B<small>Uso o WhatsApp comum</small></span><span className="setup-wa-icon" /></button>
        </div>
      </>}
      {hasBusinessApp === false && <div className="setup-help">
        <p><strong>Antes, instale o WhatsApp Business.</strong> É grátis. Seu número e suas conversas vão junto.</p>
        <ol>
          <li>Instale o WhatsApp Business.</li>
          <li>Abra e use o mesmo número do salão.</li>
          <li>Volte aqui e toque em "Já instalei".</li>
        </ol>
        <a className="btn btn-primary setup-main" href={WA_BUSINESS_URL} target="_blank" rel="noreferrer">Instalar WhatsApp Business</a>
        <button type="button" className="btn btn-secondary setup-main" onClick={() => setHasBusinessApp(true)}>Já instalei</button>
      </div>}
      {hasBusinessApp && <>
        <ol className="setup-steps">
          <li>Toque no botão abaixo.</li>
          <li>Entre com seu Facebook.</li>
          <li>Escolha o número do salão.</li>
          <li>Confirme no WhatsApp Business.</li>
        </ol>
        <OfficialWhatsAppConnection onStatusChange={onConnection} compact />
      </>}
      <button type="button" className="setup-link" onClick={next}>Fazer depois</button>
      <button type="button" className="setup-back" onClick={back}>Voltar</button>
    </div>}

    {step >= STEPS.length && <div className="setup-card setup-done">
      <div className="booking-success-mark"><UIIcon name="check" size={28} /></div>
      <h1>Pronto! Seu salão está no ar.</h1>
      {store?.officialStatus === 'connected'
        ? <p className="setup-lead">O robô já responde no seu WhatsApp. Peça para alguém mandar um "oi" e veja.</p>
        : <p className="setup-lead">Falta só ligar o robô do WhatsApp. Você faz isso quando quiser, no menu <Link to="/dashboard/chatbot">Robô do WhatsApp</Link>.</p>}
      <p className="setup-hint">Mande este link para seus clientes marcarem horário:</p>
      <div className="setup-share">
        <span>{storeUrl}</span>
        <button type="button" className="btn btn-secondary" onClick={() => { navigator.clipboard?.writeText(storeUrl); setCopied(true); }}>{copied ? 'Copiado' : 'Copiar'}</button>
      </div>
      <button type="button" className="btn btn-primary setup-main" onClick={() => navigate('/dashboard')}>Ir para minha agenda</button>
    </div>}
  </div>;
}
