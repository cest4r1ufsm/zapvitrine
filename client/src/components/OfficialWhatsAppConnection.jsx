import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { launchMetaSignup, prepareMetaSdk } from '../services/metaSignup';
import './OfficialWhatsAppConnection.css';

const defaultApi = {
  config: () => api.get('/whatsapp/official/config'),
  status: () => api.get('/whatsapp/official/status'),
  connect: payload => api.post('/whatsapp/official/connect', payload),
  disconnect: () => api.delete('/whatsapp/official/disconnect'),
  sync: () => api.post('/whatsapp/official/sync'),
};
const META_BILLING_URL = 'https://business.facebook.com/billing_hub/payment_settings';

export default function OfficialWhatsAppConnection({ onStatusChange, compact = false, api: connectionApi = defaultApi }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [needsPlan, setNeedsPlan] = useState(false);
  const [syncPending, setSyncPending] = useState(false);
  const mounted = useRef(false);
  const sdk = useRef(null);
  const cancel = useRef(null);
  const generation = useRef(0);
  const statusHandler = useRef(onStatusChange);
  useEffect(() => { statusHandler.current = onStatusChange; }, [onStatusChange]);

  const load = useCallback(async ({ keepMessage = false } = {}) => {
    const id = ++generation.current;
    setLoading(true); setReady(false);
    if (!keepMessage) setError('');
    try {
      const next = await connectionApi.config();
      if (!mounted.current || id !== generation.current) return;
      setConfig(next);
      statusHandler.current?.(next.connection);
      if (next.available && !next.connection?.connected) {
        sdk.current = await prepareMetaSdk(next);
        if (mounted.current && id === generation.current) setReady(true);
      }
    } catch (err) {
      if (!mounted.current || id !== generation.current) return;
      if (['SUBSCRIPTION_REQUIRED', 'TRIAL_EXPIRED'].includes(err.code)) { setNeedsPlan(true); setError(''); return; }
      setError(err.message || 'Não foi possível consultar a conexão.');
    }
    finally { if (mounted.current && id === generation.current) setLoading(false); }
  }, [connectionApi]);

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; cancel.current?.(); };
  }, [load]);

  useEffect(() => {
    let inFlight = false;
    let active = true;
    const refresh = async () => {
      if (inFlight || busy || !config?.connection?.connected || document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const next = await connectionApi.status();
        if (!active) return;
        setConfig(prev => ({ ...prev, ...next }));
        statusHandler.current?.(next.connection);
        setError('');
      } catch { if (active) setError('Não foi possível atualizar a conexão. Tente novamente.'); }
      finally { inFlight = false; }
    };
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [connectionApi, config?.connection?.connected, busy]);

  const connect = (businessApp = true) => {
    if (busy || !ready || !config?.state) return;
    if (Date.parse(config.expiresAt) <= Date.now()) { setNotice('Demorou um pouco. Toque no botão de novo.'); void load({ keepMessage: true }); return; }
    const attempt = ++generation.current;
    setBusy(true); setError(''); setNotice(businessApp ? 'Termine na janela do Facebook e confirme no WhatsApp Business.' : 'Termine na janela do Facebook. A Meta vai mandar um código para o número novo.');
    const finish = () => { if (mounted.current && generation.current === attempt) setBusy(false); };
    cancel.current = launchMetaSignup({
      fb: sdk.current, configId: config.configId, businessApp,
      onComplete: async payload => {
        if (!mounted.current || generation.current !== attempt) return;
        setNotice('Quase lá. Conferindo...');
        try {
          const result = await connectionApi.connect({ ...payload, state: config.state });
          if (!mounted.current || generation.current !== attempt) return;
          setConfig(prev => ({ ...prev, connection: result.connection, state: null }));
          statusHandler.current?.(result.connection);
          setSyncPending(Boolean(result.syncPending));
          setNotice(result.syncPending ? 'Conectado! Falta só sincronizar seus contatos.' : 'Pronto! Seu WhatsApp está conectado.');
          setReady(false);
        } catch (err) { if (mounted.current && generation.current === attempt) { setError(err.message || 'Não foi possível confirmar a conexão.'); setNotice('Toque no botão para tentar de novo.'); void load({ keepMessage: true }); } }
        finally { finish(); }
      },
      onError: err => { if (mounted.current && generation.current === attempt) { setError(err.message); setNotice(''); } finish(); },
      onCancel: () => { if (mounted.current && generation.current === attempt) setNotice('A janela do Facebook foi fechada ou bloqueada. Toque no botão de novo. Se nada abrir, permita janelas (pop-ups) para este site.'); finish(); },
    });
  };

  const sync = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const result = await connectionApi.sync();
      if (!mounted.current) return;
      setConfig(prev => ({ ...prev, connection: result.connection }));
      setSyncPending(false);
      setNotice('Pedido de sincronização enviado para a Meta. Seus contatos e conversas podem levar alguns minutos para aparecer.');
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { if (mounted.current) setBusy(false); }
  };

  const disconnect = async () => {
    if (busy || !window.confirm('Desligar o robô deste WhatsApp? Ele para de responder seus clientes.')) return;
    const attempt = ++generation.current;
    setBusy(true); setError('');
    try {
      const result = await connectionApi.disconnect();
      if (!mounted.current || generation.current !== attempt) return;
      setConfig(prev => ({ ...prev, connection: result.connection }));
      statusHandler.current?.(result.connection);
      setNotice('WhatsApp desconectado. O robô parou.');
      await load();
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { if (mounted.current) setBusy(false); }
  };

  const connection = config?.connection;
  return <section className={`official-wa${compact ? ' is-compact' : ''}`} aria-label="Conexão do WhatsApp" aria-busy={loading || busy}>
    {!compact && <h4>WhatsApp do salão</h4>}
    {error && <p className="alert alert-error" role="alert">{error}</p>}
    {loading ? <p role="status">Preparando...</p> : needsPlan ? <>
      <p>Seu período grátis acabou. Assine para ligar o robô no seu WhatsApp.</p>
      <Link className="btn btn-primary official-wa-main" to="/dashboard/billing">Ver planos</Link>
    </> : connection?.connected ? <>
      <p className="official-wa-connected">Conectado</p>
      <p className="official-wa-account">{connection.verifiedName}<br />{connection.displayPhoneNumber}</p>
      <p>O robô está ligado e responde seus clientes neste número. Você continua usando o WhatsApp Business normalmente.</p>
      {connection.lastError && <p role="alert">{connection.lastError}</p>}
      {(syncPending || /sincroniz/i.test(connection.lastError || '')) && <button className="btn btn-primary official-wa-main" type="button" disabled={busy} onClick={sync}>{busy ? 'Sincronizando...' : 'Sincronizar agora'}</button>}
      <p className="official-wa-help">Avisos de horário enviados depois de 24 horas da última mensagem do cliente são cobrados pela Meta. Para eles funcionarem, cadastre um cartão na <a href={META_BILLING_URL} target="_blank" rel="noreferrer">Meta</a>.</p>
      {config.attention?.failedMessages > 0 && <p role="alert">{config.attention.failedMessages} conversa(s) precisam da sua atenção. Confira no WhatsApp Business.</p>}
      <button className="btn btn-secondary" type="button" disabled={busy} onClick={disconnect}>{busy ? 'Desconectando...' : 'Desconectar'}</button>
    </> : config?.available ? <>
      {connection?.lastError && <p role="alert">{connection.lastError}</p>}
      {!compact && <p>Conecte o número do salão. Ele precisa estar no <strong>WhatsApp Business</strong> (ícone com B).</p>}
      <button className="btn btn-primary official-wa-main" type="button" disabled={busy || !ready} onClick={() => connect(true)}>{busy ? 'Aguardando você...' : ready ? 'Conectar meu WhatsApp' : 'Preparando...'}</button>
      {!busy && ready && <button type="button" className="official-wa-refresh" onClick={() => connect(false)}>Quero usar um número novo, sem o app no celular</button>}
      {!busy && <p className="official-wa-help">Deu erro no celular? Tente pelo computador, entrando no Facebook que administra o salão.</p>}
    </> : <p>A conexão com o WhatsApp está em manutenção. Sua agenda funciona normalmente.</p>}
    {notice && <p role="status" className="official-wa-notice">{notice}</p>}
    {!busy && !loading && !needsPlan && !connection?.connected && <button type="button" className="official-wa-refresh" onClick={() => load()}>Não funcionou? Recarregar</button>}
    {busy && <button type="button" className="official-wa-refresh" onClick={() => { cancel.current?.(); generation.current++; setBusy(false); setNotice('Tudo bem. Toque no botão quando quiser tentar de novo.'); void load({ keepMessage: true }); }}>Cancelar</button>}
  </section>;
}
