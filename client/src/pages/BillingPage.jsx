import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_URL } from '../services/api';
import UIIcon from '../components/UIIcon';

export default function BillingPage() {
  const { store } = useAuth();
  const [loading, setLoading] = useState(false);

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

  const isActive = store?.subscriptionStatus === 'active';

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
          </div>
        ) : (
          <div style={{ background: 'var(--bg-card)', padding: '32px 24px', borderRadius: 'var(--radius-lg)', marginBottom: '32px', border: '1px solid var(--border)' }}>
            <h1 style={{ fontSize: '3rem', margin: '0 0 8px', color: 'var(--primary)' }}>R$ 27,90<span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/mês</span></h1>
            <p style={{ marginBottom: '24px', color: 'var(--text-muted)' }}>Sem contrato, cancele quando quiser.</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><UIIcon name="check" size={16} /> Robô de autoatendimento 24h</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><UIIcon name="check" size={16} /> Produtos e categorias ilimitados</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><UIIcon name="check" size={16} /> Recebimento de pedidos integrado</li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><UIIcon name="check" size={16} /> Sem taxas secretas por pedido</li>
            </ul>
          </div>
        )}

        <button 
          className="btn btn-primary" 
          style={{ width: '100%', padding: '16px', fontSize: '1.1rem', fontWeight: 600 }} 
          disabled={loading}
          onClick={handleSubscribe}
        >
          {loading ? 'Carregando ambiente seguro...' : isActive ? 'Alterar cartão ou cancelar' : 'Assinar agora'}
        </button>
        <div style={{ marginTop: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          Pagamentos processados com segurança por <strong style={{color: '#635BFF'}}>stripe</strong>
        </div>
      </div>
    </div>
  );
}
