import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';
import { launchMetaSignup, prepareMetaSdk } from '../services/metaSignup';
import './OfficialWhatsAppConnection.css';

const defaultApi = {
  config: () => api.get('/whatsapp/official/config'),
  status: () => api.get('/whatsapp/official/status'),
  connect: payload => api.post('/whatsapp/official/connect', payload),
  disconnect: () => api.delete('/whatsapp/official/disconnect'),
};

export default function OfficialWhatsAppConnection({ onStatusChange, api: connectionApi = defaultApi }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mounted = useRef(false);
  const sdk = useRef(null);
  const cancel = useRef(null);
  const generation = useRef(0);
  const statusHandler = useRef(onStatusChange);
  useEffect(() => { statusHandler.current = onStatusChange; }, [onStatusChange]);

  const load = useCallback(async () => {
    const id = ++generation.current;
    setLoading(true); setReady(false); setError('');
    try {
      const next = await connectionApi.config();
      if (!mounted.current || id !== generation.current) return;
      setConfig(next);
      statusHandler.current?.(next.connection);
      if (next.available && !next.connection?.connected) {
        sdk.current = await prepareMetaSdk(next);
        if (mounted.current && id === generation.current) setReady(true);
      }
    } catch (err) { if (mounted.current && id === generation.current) setError(err.message || 'Não foi possível consultar a conexão.'); }
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

  const connect = () => {
    if (busy || !ready || !config?.state) return;
    if (Date.parse(config.expiresAt) <= Date.now()) { setNotice('A preparação expirou. Atualize para iniciar uma nova conexão.'); void load(); return; }
    const attempt = ++generation.current;
    setBusy(true); setError(''); setNotice('Conclua a autorização na Meta e confirme no WhatsApp Business.');
    const finish = () => { if (mounted.current && generation.current === attempt) setBusy(false); };
    cancel.current = launchMetaSignup({
      fb: sdk.current, configId: config.configId,
      onComplete: async payload => {
        if (!mounted.current || generation.current !== attempt) return;
        setNotice('Conferindo a conexão...');
        try {
          const result = await connectionApi.connect({ ...payload, state: config.state });
          if (!mounted.current || generation.current !== attempt) return;
          setConfig(prev => ({ ...prev, connection: result.connection, state: null }));
          statusHandler.current?.(result.connection);
          setNotice('WhatsApp Business conectado. Ative o atendimento automático abaixo quando estiver pronto.');
          setReady(false);
        } catch (err) { if (mounted.current && generation.current === attempt) { setError(err.message || 'Não foi possível confirmar a conexão.'); setReady(false); setNotice('Atualize a conexão para tentar novamente.'); } }
        finally { finish(); }
      },
      onError: err => { if (mounted.current && generation.current === attempt) { setError(err.message); setNotice(''); } finish(); },
      onCancel: () => { if (mounted.current && generation.current === attempt) setNotice('Conexão cancelada. Você pode tentar novamente.'); finish(); },
    });
  };

  const disconnect = async () => {
    if (busy || !window.confirm('Desconectar a integração do AgenteGestor? O atendimento automático será pausado.')) return;
    const attempt = ++generation.current;
    setBusy(true); setError('');
    try {
      const result = await connectionApi.disconnect();
      if (!mounted.current || generation.current !== attempt) return;
      setConfig(prev => ({ ...prev, connection: result.connection }));
      statusHandler.current?.(result.connection);
      setNotice('Integração desconectada do AgenteGestor.');
      await load();
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { if (mounted.current) setBusy(false); }
  };

  const connection = config?.connection;
  return <section className="official-wa" aria-label="Conexão oficial do WhatsApp Business" aria-busy={loading || busy}>
    <h4>WhatsApp Business</h4>
    {error && <p className="alert alert-error" role="alert">{error}</p>}
    {loading ? <p role="status">Preparando a conexão...</p> : connection?.connected ? <>
      <p className="official-wa-connected">Conexão oficial ativa</p>
      <p className="official-wa-account">{connection.verifiedName}<br />{connection.displayPhoneNumber}</p>
      <p>Seu número continua no WhatsApp Business. Configure o atendimento automático abaixo.</p>
      {connection.lastError && <p role="alert">{connection.lastError}</p>}
      {config.attention?.failedMessages > 0 && <p role="alert">{config.attention.failedMessages} atendimento(s) precisam de conferência. Verifique as conversas no WhatsApp Business antes de repetir uma ação.</p>}
      <button className="btn btn-secondary" type="button" disabled={busy} onClick={disconnect}>{busy ? 'Desconectando...' : 'Desconectar integração'}</button>
    </> : config?.available ? <>
      {connection?.lastError && <p role="alert">{connection.lastError}</p>}
      <p>Conecte o número que já usa no WhatsApp Business pela autorização da Meta.</p>
      <ol><li>Entre na conta que administra seu negócio.</li><li>Selecione seu WhatsApp Business.</li><li>Confirme a conexão no aplicativo.</li></ol>
      <button className="btn btn-primary" type="button" disabled={busy || !ready} onClick={connect}>{busy ? 'Aguardando confirmação...' : ready ? 'Conectar WhatsApp Business' : 'Preparando conexão...'}</button>
      <p className="official-wa-help">A Meta verifica a elegibilidade do número. Este método exige WhatsApp Business.</p>
    </> : <p>A conexão oficial ainda está sendo habilitada pelo AgenteGestor. Sua agenda continua disponível.</p>}
    {notice && <p role="status">{notice}</p>}
    {!busy && !loading && <button type="button" className="official-wa-refresh" onClick={load}>Atualizar conexão</button>}
    {busy && <button type="button" className="official-wa-refresh" onClick={() => { cancel.current?.(); generation.current++; setBusy(false); setReady(false); setNotice('Tentativa encerrada aqui. Atualize para tentar novamente.'); }}>Encerrar espera</button>}
  </section>;
}
