import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../services/api';
import {
  isAndroidApp,
  canUsePlayBilling,
  playPrice,
  playPurchase,
  playRestore,
  PLAY_MANAGE_URL,
} from '../services/playBilling';
import UIIcon from '../components/UIIcon';
import DeleteAccountCard from '../components/DeleteAccountCard';

export default function BillingPage() {
  const { store, refreshStore } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  // Dentro do app da Play Store o pagamento é sempre pelo Google Play
  const [inApp] = useState(() => isAndroidApp());
  const [googlePrice, setGooglePrice] = useState(null);

  useEffect(() => {
    if (!inApp || !canUsePlayBilling()) return;
    playPrice().then(setGooglePrice).catch(() => {});
  }, [inApp]);

  const handleSubscribe = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('pedidoprontobot_token');
      const res = await fetch(`${API_URL}/billing/checkout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error || 'Erro ao iniciar pagamento');
      }
    } catch {
      alert('Erro ao iniciar pagamento');
    } finally {
      setLoading(false);
    }
  };

  const runPlay = async (action, done) => {
    setLoading(true);
    setMessage('');
    try {
      if (!canUsePlayBilling()) {
        throw new Error('Atualize o Google Chrome e o app da Play Store para assinar.');
      }
      const result = await action();
      await refreshStore();
      setMessage(done(result));
    } catch (err) {
      // Fechar a janela do Google não é erro
      if (err?.name !== 'AbortError') setMessage(err.message || 'Não foi possível concluir a compra.');
    } finally {
      setLoading(false);
    }
  };

  const handlePlaySubscribe = () => runPlay(playPurchase, () => 'Assinatura ativada. Obrigado!');
  const handlePlayRestore = () =>
    runPlay(playRestore, (r) => (r ? 'Compra restaurada.' : 'Nenhuma assinatura encontrada nesta conta Google.'));

  const isPlay = store?.subscriptionSource === 'play';
  const isActive = store?.subscriptionStatus === 'active'
    && (!isPlay || (store?.subscriptionExpiresAt && new Date(store.subscriptionExpiresAt) > new Date()));
  const price = inApp ? (googlePrice || '—') : 'R$ 27,90';

  let action = null;
  if (isActive && isPlay) {
    action = (
      <a className="btn btn-primary" style={{ width: '100%', padding: '16px', fontSize: '1.1rem', fontWeight: 600, display: 'block' }}
        href={PLAY_MANAGE_URL} target="_blank" rel="noreferrer">
        Gerenciar ou cancelar no Google Play
      </a>
    );
  } else if (isActive && inApp) {
    // Assinatura feita no site: o app não mostra cobrança de fora da Play Store
    action = null;
  } else if (inApp) {
    action = (
      <>
        <button className="btn btn-primary" style={{ width: '100%', padding: '16px', fontSize: '1.1rem', fontWeight: 600 }}
          disabled={loading} onClick={handlePlaySubscribe}>
          {loading ? 'Aguarde...' : 'Assinar pelo Google Play'}
        </button>
        <button className="btn btn-secondary" style={{ width: '100%', marginTop: '12px' }}
          disabled={loading} onClick={handlePlayRestore}>
          Restaurar compra
        </button>
      </>
    );
  } else {
    action = (
      <button
        className="btn btn-primary"
        style={{ width: '100%', padding: '16px', fontSize: '1.1rem', fontWeight: 600 }}
        disabled={loading}
        onClick={handleSubscribe}
      >
        {loading ? 'Carregando ambiente seguro...' : isActive ? 'Alterar cartão ou cancelar' : 'Assinar agora'}
      </button>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Plano e cobrança</h1>
          <p>Gerencie sua assinatura do AGTGestor</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center', padding: '40px 20px', background: 'var(--bg-elevated)' }}>
        <h2 style={{ marginBottom: '16px' }}>
          {isActive ? 'Plano premium ativo' : 'Ative o atendimento automático'}
        </h2>

        <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.6' }}>
          {isActive
            ? 'Você tem acesso ilimitado a todas as ferramentas, incluindo o Chatbot do WhatsApp que atende seus clientes sozinho 24/7.'
            : 'Ative o Plano Premium para conectar seu WhatsApp e parar de perder tempo anotando pedidos manualmente. O robô faz tudo por você!'}
        </p>

        {isActive ? (
          <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(16, 185, 129, 0.2)', marginBottom: '32px' }}>
            <div className="billing-status-icon"><UIIcon name="check" size={26} /></div>
            <strong>Sua mensalidade está em dia.</strong><br/> Obrigado por confiar no AGTGestor.
            {isPlay && store?.subscriptionExpiresAt && (
              <><br/>Próxima cobrança ou fim do acesso: {new Date(store.subscriptionExpiresAt).toLocaleDateString('pt-BR')}.</>
            )}
          </div>
        ) : (
          <div style={{ background: 'var(--bg-card)', padding: '32px 24px', borderRadius: 'var(--radius-lg)', marginBottom: '32px', border: '1px solid var(--border)' }}>
            <h1 style={{ fontSize: '3rem', margin: '0 0 8px', color: 'var(--primary)' }}>{price}<span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/mês</span></h1>
            <p style={{ marginBottom: '24px', color: 'var(--text-muted)' }}>Sem contrato, cancele quando quiser.</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><UIIcon name="check" size={16} /> Robô de autoatendimento 24h</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><UIIcon name="check" size={16} /> Produtos e categorias ilimitados</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><UIIcon name="check" size={16} /> Recebimento de pedidos integrado</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><UIIcon name="check" size={16} /> Sem taxas secretas por pedido</li>
            </ul>
          </div>
        )}

        {action}

        {message && (
          <p role="status" style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>{message}</p>
        )}

        <div style={{ marginTop: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {inApp || isPlay
            ? 'Pagamento e renovação feitos pelo Google Play.'
            : <>Pagamentos processados com segurança por <strong style={{color: '#635BFF'}}>stripe</strong></>}
        </div>
      </div>

      <DeleteAccountCard isPlaySubscriber={isActive && isPlay} />
    </div>
  );
}
