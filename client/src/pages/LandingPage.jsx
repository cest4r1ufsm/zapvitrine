import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="nav-logo">⚡ ZapVitrine</div>
        <div className="nav-links">
          <a href="#features">Recursos</a>
          <a href="#pricing">Preços</a>
          {user ? (
            <Link to="/dashboard" className="btn btn-primary btn-sm">Dashboard</Link>
          ) : (
            <>
              <Link to="/login">Entrar</Link>
              <Link to="/register" className="btn btn-primary btn-sm">Começar Grátis</Link>
            </>
          )}
        </div>
      </nav>

      <section className="hero">
        <div className="hero-content">
          <div className="hero-badge">🚀 Plataforma #1 para pequenos negócios</div>
          <h1>
            Seu catálogo online com <span className="gradient-text">pedidos via WhatsApp</span>
          </h1>
          <p>
            Crie sua vitrine digital em minutos. Seus clientes escolhem os produtos
            e fazem o pedido direto no seu WhatsApp. Simples, rápido e profissional.
          </p>
          <div className="hero-buttons">
            <Link to="/register" className="btn btn-primary btn-lg">Criar Minha Vitrine</Link>
            <a href="#features" className="btn btn-secondary btn-lg">Ver Recursos</a>
          </div>
        </div>
      </section>

      <section className="features" id="features">
        <h2>Tudo que você precisa</h2>
        <p>Ferramentas simples e poderosas para o seu negócio crescer</p>
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">📱</div>
            <h3>Catálogo Digital</h3>
            <p>Cadastre seus produtos e serviços com fotos, descrições e preços. Tudo organizado por categorias.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">💬</div>
            <h3>Pedidos via WhatsApp</h3>
            <p>Seu cliente monta o pedido e envia direto pro seu WhatsApp com tudo formatado. Zero complicação.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🎨</div>
            <h3>Sua Marca</h3>
            <p>Personalize com seu logo, cores e informações. Sua vitrine com a cara do seu negócio.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔗</div>
            <h3>Link Exclusivo</h3>
            <p>Receba um link único para compartilhar nas redes sociais, cartão de visitas e em qualquer lugar.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📊</div>
            <h3>Painel Completo</h3>
            <p>Gerencie tudo pelo painel: produtos, categorias, configurações e muito mais.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📲</div>
            <h3>100% Responsivo</h3>
            <p>Funciona perfeitamente no celular, tablet e computador. Seus clientes acessam de qualquer lugar.</p>
          </div>
        </div>
      </section>

      <section className="pricing" id="pricing">
        <h2>Planos que cabem no seu bolso</h2>
        <p>Comece grátis e faça upgrade quando quiser</p>
        <div className="pricing-grid">
          <div className="pricing-card">
            <h3>Grátis</h3>
            <div className="price">R$0<span>/mês</span></div>
            <div className="price-note">Perfeito para começar</div>
            <ul className="pricing-features">
              <li><span className="check">✓</span> Até 15 produtos</li>
              <li><span className="check">✓</span> 3 categorias</li>
              <li><span className="check">✓</span> Vitrine pública</li>
              <li><span className="check">✓</span> Pedidos via WhatsApp</li>
              <li><span className="check">✓</span> Link personalizado</li>
            </ul>
            <Link to="/register" className="btn btn-secondary" style={{width:'100%'}}>Começar Grátis</Link>
          </div>
          <div className="pricing-card featured">
            <h3>Profissional</h3>
            <div className="price">R$29<span>/mês</span></div>
            <div className="price-note">Para negócios em crescimento</div>
            <ul className="pricing-features">
              <li><span className="check">✓</span> Produtos ilimitados</li>
              <li><span className="check">✓</span> Categorias ilimitadas</li>
              <li><span className="check">✓</span> Vitrine pública</li>
              <li><span className="check">✓</span> Pedidos via WhatsApp</li>
              <li><span className="check">✓</span> Logo e banner personalizados</li>
              <li><span className="check">✓</span> Horário de funcionamento</li>
              <li><span className="check">✓</span> Suporte prioritário</li>
            </ul>
            <Link to="/register" className="btn btn-primary" style={{width:'100%'}}>Assinar Agora</Link>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <p>© 2026 ZapVitrine. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
