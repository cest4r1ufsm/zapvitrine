/* eslint-disable react-refresh/only-export-components -- isolated local visual fixture */
import { createRoot } from 'react-dom/client';
import OfficialWhatsAppConnection from '../src/components/OfficialWhatsAppConnection';
import '../src/index.css';
import '../src/sophisticated.css';
const scenario = new URLSearchParams(window.location.search).get('scenario');
let connected = scenario === 'connected' || scenario === 'attention';
const response = () => ({ available: false, connection: { connected, status: connected ? 'connected' : 'disconnected', displayPhoneNumber: '+55 11 90000-0000', verifiedName: 'Studio Aurora (dados fictícios)' }, attention: { failedMessages: scenario === 'attention' ? 2 : 0 } });
const api = { config: async () => response(), status: async () => response(), disconnect: async () => { connected = false; return response(); } };
function Fixture() {
  return <main style={{ maxWidth: 720, margin: '32px auto', padding: 20 }}>
    <h1 style={{ fontSize: 28 }}>Chatbot WhatsApp</h1>
    <p style={{ margin: '12px 0 24px' }}>Teste local com dados fictícios. Nenhuma conta será conectada.</p>
    <div className="settings-section"><OfficialWhatsAppConnection api={api} /></div>
  </main>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
