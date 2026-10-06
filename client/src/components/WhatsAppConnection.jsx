import { useCallback, useEffect, useRef, useState } from 'react';
import { whatsappAPI } from '../services/api';
import { isAndroidApp } from '../services/playBilling';
import './WhatsAppConnection.css';

const WAITING = new Set(['connecting', 'reconnecting', 'qr', 'pairing']);
const DISCONNECTED = { status: 'disconnected', qr: null, phone: null, error: null };

function prefersPhone() {
  return isAndroidApp() || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    || window.matchMedia('(max-width: 700px)').matches;
}

export default function WhatsAppConnection({ initialStatus = DISCONNECTED, onStatusChange, api = whatsappAPI }) {
  const [mobile] = useState(prefersPhone);
  const [method, setMethod] = useState(() => mobile ? 'pairing' : (initialStatus.method || 'qr'));
  const [status, setStatus] = useState(initialStatus);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pollError, setPollError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');
  const [qrError, setQrError] = useState(false);
  const [restart, setRestart] = useState(false);
  const [editing, setEditing] = useState(false);
  const [now, setNow] = useState(Date.now);
  const current = useRef(initialStatus);
  const mounted = useRef(false);
  const operation = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; operation.current += 1; };
  }, []);

  const receive = useCallback((next) => {
    const previous = current.current;
    if (next.qr !== previous.qr) setQrError(false);
    current.current = next;
    setNow(Date.now());
    setStatus(next);
    onStatusChange?.(next, previous);
  }, [onStatusChange]);

  // Serialize polling; refresh immediately when returning from WhatsApp.
  useEffect(() => {
    if (busy) return;
    let cancelled = false;
    let timer;
    let inFlight = false;
    const generation = operation.current;
    const poll = async () => {
      if (cancelled || inFlight) return;
      clearTimeout(timer);
      inFlight = true;
      let next;
      try {
        next = await api.status();
        if (cancelled || generation !== operation.current) return;
        setPollError('');
        receive(next);
      } catch {
        if (!cancelled && generation === operation.current) {
          setPollError('Não foi possível verificar a conexão. Vamos tentar novamente.');
        }
      } finally {
        inFlight = false;
        if (!cancelled && generation === operation.current && (next ? WAITING.has(next.status) : WAITING.has(current.current.status))) {
          timer = setTimeout(poll, 3000);
        }
      }
    };
    const resume = () => { if (document.visibilityState !== 'hidden') void poll(); };
    if (WAITING.has(status.status)) timer = setTimeout(poll, 1500);
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, [status.status, busy, api, receive]);

  useEffect(() => {
    if (status.status !== 'pairing' || !status.pairingExpiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [status.status, status.pairingExpiresAt]);

  const connect = async (event) => {
    event?.preventDefault();
    if (busy) return;
    const digits = phone.replace(/[\s()+.-]/g, '');
    if (method === 'pairing' && !/^[1-9]\d{7,14}$/.test(digits)) {
      setError('Informe o número com código do país e DDD. Exemplo: +55 11 99999-9999.');
      return;
    }
    const generation = ++operation.current;
    setBusy(true);
    setError('');
    setPollError('');
    setCopyMessage('');
    setQrError(false);
    try {
      const next = await api.connect(method === 'pairing' ? { method, phoneNumber: digits, restart } : { method, restart });
      if (!mounted.current || generation !== operation.current) return;
      setNow(Date.now());
      setRestart(false);
      setEditing(false);
      receive(next);
    } catch (err) {
      if (mounted.current && generation === operation.current) setError(err.message || 'Não foi possível iniciar a conexão. Tente novamente.');
    } finally {
      if (mounted.current && generation === operation.current) setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Desconectar o WhatsApp? O chatbot será desativado.')) return;
    const generation = ++operation.current;
    setBusy(true);
    setError('');
    try {
      await api.disconnect();
      if (mounted.current && generation === operation.current) receive(DISCONNECTED);
    } catch (err) {
      if (mounted.current && generation === operation.current) setError(err.message);
    } finally {
      if (mounted.current && generation === operation.current) setBusy(false);
    }
  };

  const changeMethod = () => {
    setMethod(method === 'pairing' ? 'qr' : 'pairing');
    setRestart(true);
    setError('');
    setCopyMessage('');
  };

  const expiresAt = Date.parse(status.pairingExpiresAt || '');
  const expired = status.status === 'pairing' && Number.isFinite(expiresAt) && now >= expiresAt;
  const matchesMethod = (status.method || (status.status === 'pairing' ? 'pairing' : 'qr')) === method;
  const pairing = !editing && matchesMethod && status.status === 'pairing' && status.pairingCode && !expired;
  const qr = !editing && matchesMethod && method === 'qr' && status.status === 'qr' && status.qr;
  const waiting = !editing && matchesMethod && ['connecting', 'reconnecting'].includes(status.status);
  const connected = status.status === 'connected';
  const code = String(status.pairingCode || '').replace(/\s|-/g, '');
  const displayCode = code.match(/.{1,4}/g)?.join('-') || '';
  const hasError = status.status === 'error' || expired;
  const seconds = Number.isFinite(expiresAt) ? Math.max(0, Math.ceil((expiresAt - now) / 1000)) : null;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyMessage('Código copiado. Abra o WhatsApp para confirmar.');
    } catch {
      setCopyMessage('Selecione o código acima para copiar ou digite-o no WhatsApp.');
    }
  };

  return (
    <div className="wa-connection" aria-busy={busy}>
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {pollError && <p className="wa-notice" role="status">{pollError}</p>}
      {connected ? <>
        <h4 className="wa-connected">WhatsApp conectado</h4>
        {status.phone && <p>+{status.phone}</p>}
        <p>Seu WhatsApp está vinculado. Você pode ativar ou pausar o chatbot nas configurações abaixo.</p>
        <button className="btn btn-secondary" onClick={disconnect} disabled={busy}>{busy ? 'Desconectando...' : 'Desconectar WhatsApp'}</button>
      </> : <>
        <h4>{method === 'pairing' ? 'Conectar neste celular' : 'Conectar com QR Code'}</h4>
        <p>{method === 'pairing'
          ? 'Vincule o WhatsApp do seu negócio por um código. A confirmação acontece no próprio WhatsApp.'
          : 'Use o WhatsApp de outro aparelho para escanear o código nesta tela.'}</p>

        {hasError && <div className="alert alert-error" role="alert">
          {expired ? 'Este código expirou. Gere um novo para continuar.' : status.error || 'Não foi possível conectar. Tente novamente.'}
        </div>}

        {pairing ? <>
          <p className="wa-step">Confirme a vinculação no WhatsApp</p>
          <output className="wa-pairing-code" aria-label="Código de vinculação">{displayCode}</output>
          {seconds !== null && <p className="wa-expiry">Válido por até {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}. Se o WhatsApp recusar, gere outro.</p>}
          <button type="button" className="btn btn-primary" onClick={copyCode}>Copiar código</button>
          {copyMessage && <p role="status" className="wa-notice">{copyMessage}</p>}
          <ol className="wa-steps">
            <li>Abra o WhatsApp do número informado.</li>
            <li>Toque no aviso de vinculação. Se ele não aparecer, vá em <strong>Aparelhos conectados → Conectar um aparelho → Conectar com número de telefone</strong>.</li>
            <li>Digite o código acima e confirme. Depois, volte ao AgenteGestor.</li>
          </ol>
          <p className="wa-help">A vinculação permite ao chatbot atender pelo WhatsApp do seu negócio. Os nomes das opções podem variar conforme a versão do WhatsApp.</p>
          <a className="btn btn-secondary" href="whatsapp://">Abrir WhatsApp</a>
          <p className="wa-help">Se o botão não abrir o aplicativo, abra o WhatsApp ou WhatsApp Business pelo ícone no celular.</p>
          <p className="wa-notice" role="status">Aguardando sua confirmação no WhatsApp...</p>
        </> : qr && !qrError ? <>
          <div className="wa-qr-frame"><img src={status.qr} alt="QR Code para vincular seu WhatsApp" onError={() => setQrError(true)} /></div>
          <ol className="wa-steps">
            <li>Abra o WhatsApp no outro aparelho.</li>
            <li>Vá em <strong>Aparelhos conectados → Conectar um aparelho</strong>.</li>
            <li>Escaneie o QR Code. Aguarde a confirmação aqui.</li>
          </ol>
          <p className="wa-help">O código é atualizado enquanto você aguarda.</p>
        </> : waiting ? <div className="wa-waiting" role="status">
          <div className="loading-spinner" aria-hidden="true" />
          <p>{status.status === 'reconnecting' ? 'Restabelecendo a conexão...' : method === 'pairing' ? 'Preparando seu código...' : 'Preparando o QR Code...'}</p>
          <p className="wa-help">Aguarde alguns instantes. A tela será atualizada automaticamente.</p>
        </div> : <form onSubmit={connect}>
          {qrError && <p role="alert">Não foi possível exibir o QR Code. Você pode conectar por código.</p>}
          {method === 'pairing' && <div className="form-group">
            <label htmlFor="wa-phone">WhatsApp com código do país e DDD</label>
            <input id="wa-phone" className="form-input" type="tel" inputMode="tel" autoComplete="tel" placeholder="+55 11 99999-9999" value={phone} onChange={event => setPhone(event.target.value)} aria-describedby="wa-phone-help" disabled={busy} required />
            <p id="wa-phone-help" className="wa-help">Use o número do WhatsApp que vai atender seus clientes. Para o Brasil, comece com +55. O código aparecerá aqui, não por SMS.</p>
          </div>}
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Iniciando...' : method === 'pairing' ? hasError ? 'Gerar novo código' : 'Gerar código de conexão' : 'Gerar QR Code'}</button>
        </form>}

        {pairing && <button type="button" className="wa-link-button" onClick={() => { setRestart(true); setEditing(true); }} disabled={busy}>Alterar número ou gerar outro código</button>}
        <button type="button" className="wa-link-button" onClick={changeMethod} disabled={busy}>
          {method === 'pairing' ? 'Usar QR Code em outro aparelho' : 'Conectar sem QR Code'}
        </button>
      </>}
    </div>
  );
}
