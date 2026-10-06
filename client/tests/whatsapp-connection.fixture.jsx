// Fixture local isolada: nunca chama WhatsApp, autenticação ou o banco real.
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import WhatsAppConnection from '../src/components/WhatsAppConnection';
import '../src/index.css';
import '../src/sophisticated.css';

const params = new URLSearchParams(window.location.search);
const scenario = params.get('scenario') || 'success';
if (params.get('twa') === '1') sessionStorage.setItem('agtgestor-play-app', '1');
else sessionStorage.removeItem('agtgestor-play-app');
document.documentElement.dataset.theme = params.get('theme') || 'light';
let pending = { status: 'disconnected' };
let polls = 0;
let allowConnection = false;
const requests = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
// Simplificação da regra do servidor: Brasil sem 55, DDD 31+ sem o 9, outra forma alternativa.
function pairingNumbers({ phoneNumber = '', exact }) {
  let digits = phoneNumber.replace(/D/g, '');
  if (!phoneNumber.startsWith('+') && (digits.length === 10 || digits.length === 11)) digits = '55' + digits;
  if (!digits.startsWith('55') || ![12, 13].includes(digits.length)) return { pairingPhone: digits, alternatePhoneNumber: null };
  const long = digits.length === 13 ? digits : digits.slice(0, 4) + '9' + digits.slice(4);
  const short = digits.length === 12 ? digits : digits.slice(0, 4) + digits.slice(5);
  const pairingPhone = exact ? digits : Number(digits.slice(2, 4)) <= 28 ? long : short;
  return { pairingPhone, alternatePhoneNumber: pairingPhone === long ? short : long };
}
const api = {
  connect: async options => {
    requests.push(options);
    if (scenario === 'request-error') throw new Error('Não foi possível iniciar. Tente novamente.');
    pending = { status: 'connecting', method: options.method, numbers: options.method === 'pairing' ? pairingNumbers(options) : {} };
    polls = 0;
    allowConnection = false;
    return pending;
  },
  status: async () => {
    await pause(50);
    if (scenario === 'poll-error') throw new Error('offline');
    polls++;
    if (allowConnection) return { status: 'connected', method: pending.method, phone: '5511999999999' };
    if (pending.method === 'qr') return { status: 'qr', method: 'qr', qr: '/tests/qr-fixture.svg' };
    if (!pending.pairingCode) pending = { ...pending.numbers, status: 'pairing', method: 'pairing', pairingCode: 'ABCD1234', pairingExpiresAt: new Date(Date.now() + (scenario === 'expired' ? 3500 : 150000)).toISOString() };
    return pending;
  },
  disconnect: async () => { pending = { status: 'disconnected' }; },
};

function Fixture() {
  const [status, setStatus] = useState('disconnected');
  const initial = scenario === 'resume' ? { status: 'pairing', method: 'pairing', pairingCode: 'ABCD1234', pairingPhone: '553199990000', alternatePhoneNumber: '5531999990000', pairingExpiresAt: new Date(Date.now() + 150000).toISOString() } : { status: 'disconnected' };
  return <main style={{ maxWidth: 1120, margin: '24px auto', padding: 16 }}>
    <h1 style={{ fontSize: 24, marginBottom: 12 }}>Conexão WhatsApp</h1>
    <p style={{ marginBottom: 16 }}>Prévia local com dados fictícios. Nenhuma conta real será vinculada.</p>
    <div className="settings-grid">
      <section className="settings-section">
        <h3>Conexão com WhatsApp</h3>
        <WhatsAppConnection initialStatus={initial} api={api} onStatusChange={next => setStatus(next.status)} />
      </section>
      <aside className="settings-section">
        <h3>Controles do teste</h3>
        <p role="status">Estado: {status}</p>
        <button className="btn btn-secondary" onClick={() => { allowConnection = true; window.dispatchEvent(new Event('focus')); }}>Simular confirmação no WhatsApp</button>
        <button className="btn btn-secondary" onClick={() => document.getElementById('requests').textContent = JSON.stringify(requests)}>Ver requisições</button>
        <pre id="requests" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }} />
      </aside>
    </div>
  </main>;
}

createRoot(document.getElementById('root')).render(<StrictMode><Fixture /></StrictMode>);
