import { Link } from 'react-router-dom';
import { createElement, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { LinkCardArt, ChatLogArt, ConfirmReceiptArt } from '../components/BrandArt';
import CategoryFloating from '../components/CategoryFloating';
import { LandingMotion, ScrollProgress } from '../components/Interactive';
import UIIcon from '../components/UIIcon';

const FEATURES = [
  { i: 'calendar', t: 'Agenda digital', tag: 'Calendário', d: 'Visualize todos os agendamentos em um calendário organizado. Saiba exatamente o que tem para cada dia.' },
  { i: 'bot', t: 'Chatbot no WhatsApp', tag: 'Automação', d: 'Um robô atende seus clientes 24h, apresenta seus serviços e registra agendamentos automaticamente.' },
  { i: 'services', t: 'Catálogo de serviços', tag: 'Catálogo', d: 'Cadastre seus serviços com descrição e preço, organizados por categorias. Tudo exibido para o cliente.' },
  { i: 'link', t: 'Link exclusivo', tag: 'Compartilhar', d: 'Compartilhe seu link nas redes sociais e no cartão de visitas. Seus clientes acessam de qualquer lugar.' },
  { i: 'orders', t: 'Gestão de pedidos', tag: 'Painel', d: 'Acompanhe, confirme e conclua atendimentos pelo painel. Histórico completo de cada cliente.' },
  { i: 'phone', t: 'Funciona no celular', tag: 'Mobile', d: 'Funciona perfeitamente no celular, tablet e computador. Gerencie seu negócio de onde estiver.' },
];

const PROCESS = [
  {
    n: '01',
    t: 'Cadastre seus serviços',
    d: 'Adicione nome, duração e preço de cada serviço. Organize em categorias. Pronto para o cliente em 5 minutos.',
  },
  {
    n: '02',
    t: 'Conecte o WhatsApp',
    d: 'Um QR Code conecta seu WhatsApp ao chatbot. O robô passa a atender seus clientes 24 horas por dia.',
  },
  {
    n: '03',
    t: 'Compartilhe seu link',
    d: 'Seu link exclusivo vai no bio do Instagram, cartão de visitas, status do WhatsApp. Cliente acessa de qualquer lugar.',
  },
  {
    n: '04',
    t: 'Receba agendamentos',
    d: 'O cliente conversa, escolhe serviço e horário, confirma. Você só recebe a agenda do dia, organizada.',
  },
];

const CATEGORIES = [
  {
    id: 'salao',
    label: 'Salão de Beleza',
    title: 'Agenda para salões de beleza',
    desc: 'Cabeleireiros, manicures e estética em um só lugar. Seus clientes agendam sem precisar te ligar.',
    services: ['Corte feminino', 'Coloração', 'Escova', 'Manicure e pedicure', 'Maquiagem', 'Tratamentos capilares'],
  },
  {
    id: 'barbearia',
    label: 'Barbearia',
    title: 'Agenda para barbearias',
    desc: 'Múltiplos barbeiros, agenda individual, fila organizada. Seu cliente escolhe com quem agendar.',
    services: ['Corte masculino', 'Barba', 'Combo corte + barba', 'Sobrancelha', 'Pigmentação', 'Hidratação'],
  },
  {
    id: 'estetica',
    label: 'Estética & Esmalteria',
    title: 'Agenda para estética e esmalteria',
    desc: 'Procedimentos com duração variável, pacotes mensais, agendamento recorrente. Tudo automático.',
    services: ['Manicure e pedicure', 'Alongamento de unhas', 'Design de sobrancelha', 'Depilação', 'Limpeza de pele', 'Massagem'],
  },
  {
    id: 'clinica',
    label: 'Clínica & Consultório',
    title: 'Agenda para clínicas e consultórios',
    desc: 'Profissional de saúde com agenda controlada, lembretes automáticos, histórico de cliente.',
    services: ['Consultas', 'Retornos', 'Procedimentos', 'Avaliações', 'Tratamentos', 'Acompanhamento'],
  },
  {
    id: 'micro',
    label: 'Qualquer microempresa',
    title: 'Agenda para qualquer microempresa',
    desc: 'Personal trainers, professores particulares, oficinas, pet shops e autônomos. Se o serviço depende de agenda, cabe aqui.',
    services: ['Sessões', 'Aulas particulares', 'Atendimentos', 'Visitas', 'Reservas', 'Serviços avulsos'],
  },
];

const TESTIMONIALS = [
  { name: 'Mariana Silva', role: 'Salão Studio M', avatar: 'MS', text: 'Em duas semanas dobrei minha agenda. O bot responde no horário que durmo e ainda fecho cliente.', rating: 5 },
  { name: 'Carlos Eduardo', role: 'Barbearia Príncipe', avatar: 'CE', text: 'Saí da agenda no caderno. Hoje meus clientes agendam sozinhos pelo link e não esqueço mais ninguém.', rating: 5 },
  { name: 'Júlia Mendes', role: 'Esmalteria Lume', avatar: 'JM', text: 'Antes perdia 3-4 clientes por dia sem responder. Agora o WhatsApp atende e eu só recebo confirmado.', rating: 5 },
];

const COST_STEPS = [
  {
    n: '01',
    t: 'O custo do caderno',
    d: 'Anotações em papel, cliente esquecido, dupla marcação. A cada semana você perde 3 a 8 clientes por simplesmente não responder a tempo. Em um ano, isso é meio salário a menos.',
  },
  {
    n: '02',
    t: 'O motor AGTGestor',
    d: 'O chatbot atende 24h no seu WhatsApp. Apresenta os serviços, mostra horários disponíveis, registra o agendamento, envia confirmação. Você só recebe a agenda do dia já organizada.',
  },
  {
    n: '03',
    t: 'O resultado',
    d: 'Agenda mais cheia, menos faltas e mais tempo livre. Você atende quem realmente quer ser atendido, sem gastar energia com mensagens que nunca viram cliente.',
  },
];

const FAQ = [
  { q: 'Quanto tempo leva para começar a usar?', a: 'Cinco minutos. Você cria a conta, cadastra seus serviços, conecta o WhatsApp via QR Code e já está pronto. Nada de instalação ou configuração técnica.' },
  { q: 'Preciso de cartão de crédito para testar?', a: 'Não. Você tem 7 dias completos para usar tudo sem cadastrar nenhum cartão. Se gostar, ativa a assinatura depois. Se não gostar, simplesmente esquece e nada acontece.' },
  { q: 'O chatbot funciona no meu WhatsApp normal?', a: 'Sim. Você conecta o WhatsApp que já usa hoje. O bot atende sozinho quando você está ocupado e você responde manualmente quando quiser intervir.' },
  { q: 'Meus clientes precisam baixar algum app?', a: 'Não. O cliente acessa pelo link que você compartilha ou conversa direto pelo WhatsApp. Tudo pelo navegador, sem instalação.' },
  { q: 'E se eu tiver mais de um profissional?', a: 'Você cria as agendas de cada profissional. O cliente escolhe com quem agendar. Cada um vê só os próprios horários no painel.' },
  { q: 'Posso cancelar quando quiser?', a: 'Sim. Cancela em 1 clique, sem multa, sem ligar para suporte. Você mantém o acesso até o fim do período pago.' },
  { q: 'Funciona para qual tipo de negócio?', a: 'Salões, barbearias, estética, manicure, clínicas, personal trainers, professores particulares e oficinas. O AGTGestor funciona para qualquer serviço com agenda.' },
];

function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return;
        setInView(true);
        obs.unobserve(e.target);
      }),
      { threshold }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

function Reveal({ children, delay = 0, as = 'div', className = '', ...rest }) {
  const [ref, inView] = useInView();
  return createElement(as, {
    ref,
    className: `reveal ${inView ? 'in-view' : ''} ${className}`,
    style: { '--reveal-delay': `${delay}ms` },
    ...rest,
  }, children);
}

function HeroProductProof() {
  const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
  const appointments = [
    { day: 0, row: 1, label: 'Escova', name: 'Beatriz', status: 'confirmed' },
    { day: 1, row: 0, label: 'Coloração', name: 'Camila', status: 'pending' },
    { day: 2, row: 2, label: 'Hidratação', name: 'Larissa', status: 'confirmed' },
    { day: 3, row: 1, label: 'Corte feminino', name: 'Marina', status: 'active' },
    { day: 4, row: 0, label: 'Mechas', name: 'Fernanda', status: 'confirmed' },
  ];
  return (
    <div className="hero-product-proof" aria-label="Demonstração de conversa transformada em agendamento">
      <div className="hero-product-tabs" aria-hidden="true">
        <span className="active"><UIIcon name="calendar" size={17} /> Agenda</span>
        <span><UIIcon name="clients" size={17} /> Clientes</span>
        <span><UIIcon name="services" size={17} /> Serviços</span>
        <span><UIIcon name="professionals" size={17} /> Profissionais</span>
      </div>
      <div className="hero-calendar" aria-hidden="true">
        <div className="hero-calendar-meta"><span>Hoje</span><strong>12 a 18 de maio</strong></div>
        <div className="hero-calendar-grid">
          <div className="hero-calendar-time" />
          {days.map((day, index) => <div className={`hero-calendar-day ${index === 3 ? 'active' : ''}`} key={day}>{day}<small>{12 + index} maio</small></div>)}
          {['09:00', '11:00', '13:00'].map((time, row) => (
            <div className="hero-calendar-row" key={time}>
              <div className="hero-calendar-time">{time}</div>
              {days.map((day, dayIndex) => {
                const item = appointments.find((appointment) => appointment.day === dayIndex && appointment.row === row);
                return <div className="hero-calendar-cell" key={`${day}-${time}`}>{item && <div className={`hero-appointment ${item.status}`}><strong>{item.label}</strong><span>{item.name}</span></div>}</div>;
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="hero-phone-asset">
        <img src="/assets/agtgestor-phone-product-proof.png" alt="Celular com conversa e agendamento confirmado no AGTGestor" />
      </div>
      <svg className="hero-proof-line" viewBox="0 0 260 230" aria-hidden="true">
        <path d="M220 6V84H88V224" />
        <circle cx="220" cy="6" r="4" />
        <circle cx="88" cy="224" r="4" />
      </svg>
    </div>
  );
}

function ProcessVisual() {
  return (
    <div className="process-visual" aria-label="Fluxo do atendimento até a agenda">
      <div className="process-visual-line" aria-hidden="true" />
      <div className="process-visual-step">
        <span><UIIcon name="chat" /></span>
        <div><small>Mensagem recebida</small><strong>Quero agendar um corte</strong></div>
      </div>
      <div className="process-visual-step">
        <span><UIIcon name="bot" /></span>
        <div><small>Atendimento automático</small><strong>Quinta-feira, 14:00</strong></div>
      </div>
      <div className="process-visual-step active">
        <span><UIIcon name="check" /></span>
        <div><small>Agenda atualizada</small><strong>Marina · Corte feminino</strong></div>
      </div>
    </div>
  );
}

function ProcessAccordion() {
  const [active, setActive] = useState(3); // start with last expanded like the VECTR ref
  return (
    <div className="process-accordion">
      {PROCESS.map((s, i) => (
        <button
          key={s.n}
          className={`process-row ${active === i ? 'active' : ''}`}
          onClick={() => setActive(i)}
          onMouseEnter={() => setActive(i)}
        >
          <span className="process-row-n">{s.n}</span>
          <span className="process-row-t">{s.t}</span>
          {active === i && (
            <div className="process-row-d">
              <div className="process-row-bar" />
              <p>{s.d}</p>
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

function BigAccordion({ items, defaultOpen = -1 }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="big-accordion">
      {items.map((it, i) => (
        <div key={it.n} className={`big-accordion-item ${open === i ? 'open' : ''}`}>
          <button className="big-accordion-q" onClick={() => setOpen(open === i ? -1 : i)}>
            <span className="big-accordion-n">{it.n}</span>
            <span className="big-accordion-t">{it.t}</span>
            <span className="big-accordion-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
          <div className="big-accordion-a-wrap">
            <p className="big-accordion-a">{it.d}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function FaqItem({ q, a }) {
  const [openLocal, setOpenLocal] = useState(false);
  return (
    <div className={`faq-row ${openLocal ? 'open' : ''}`}>
      <button className="faq-row-q" onClick={() => setOpenLocal((o) => !o)} aria-expanded={openLocal}>
        <span>{q}</span>
        <span className="faq-row-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4 7L9 12L14 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      <div className="faq-row-a-wrap">
        <p className="faq-row-a">{a}</p>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  // force light theme while landing is mounted
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.getAttribute('data-theme');
    html.setAttribute('data-theme', 'light');
    return () => {
      if (prev) html.setAttribute('data-theme', prev);
      else html.removeAttribute('data-theme');
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="vectr-landing landing">
      <ScrollProgress />
      <LandingMotion />

      {/* ============ FLOATING PILL NAV ============ */}
      <nav className={`vl-nav ${scrolled ? 'scrolled' : ''}`}>
        <div className="vl-nav-left">
          <a href="#features">Recursos</a>
          <a href="#process">Como funciona</a>
          <a href="#categories">Para quem</a>
        </div>
        <div className="vl-nav-center">
          <img src="/agtgestor-logo.svg" alt="AGTGestor" />
        </div>
        <div className="vl-nav-right">
          {user ? (
            <Link to="/dashboard" className="vl-pill vl-pill-dark">Dashboard</Link>
          ) : (
            <>
              <Link to="/login" className="vl-pill vl-pill-soft">Entrar</Link>
              <Link to="/register" className="vl-pill vl-pill-lime">Criar conta</Link>
            </>
          )}
        </div>
      </nav>

      {/* ============ HERO ============ */}
      <section className="vl-hero">
        <div className="vl-hero-text">
          <Reveal as="h1" className="vl-hero-title">
            Seu WhatsApp atende.<br />
            Sua agenda se organiza.
          </Reveal>
          <Reveal as="p" delay={120} className="vl-hero-sub">
            Agendamentos, serviços, profissionais e clientes em um só lugar, com atendimento automático pelo WhatsApp.
          </Reveal>
          <Reveal className="vl-hero-cta" delay={200}>
            <Link to="/register" className="vl-pill vl-pill-white vl-pill-lg">
              Criar conta
            </Link>
            <a href="#process" className="vl-pill vl-pill-lime vl-pill-lg">Ver como funciona</a>
          </Reveal>
        </div>
        <div className="vl-hero-scene-wrap vl-hero-scene-phone">
          <HeroProductProof />
          <a href="#process" className="vl-scroll-cue">
            <span>Conheça o fluxo</span>
            <span className="vl-scroll-cue-line" />
          </a>
        </div>
      </section>

      {/* ============ PROCESS: NUMBERED LIST + HALFTONE SCENE ============ */}
      <section className="vl-process" id="process">
        <div className="vl-process-inner">
          <Reveal className="vl-process-list">
            <ProcessAccordion />
          </Reveal>
          <Reveal className="vl-process-scene" delay={200}>
            <ProcessVisual />
          </Reveal>
        </div>
      </section>

      {/* ============ SPLIT 1: every site ============ */}
      <section className="vl-split">
        <Reveal className="vl-split-image">
          <div className="vl-split-image-inner vl-split-img-1">
            <LinkCardArt />
            <div className="vl-split-tag">Operação simples</div>
          </div>
        </Reveal>
        <div className="vl-split-text">
          <Reveal as="h2" className="vl-split-title">
            Sua agenda funciona em <span className="vl-italic">qualquer cliente.</span>
          </Reveal>
          <Reveal as="p" delay={80} className="vl-split-desc">
            Modelado para a rotina real do pequeno negócio brasileiro. Cliente chega pelo Instagram, pelo bio, pelo cartão. Conversa pelo WhatsApp. Agenda no link. Sem app, sem download, sem fricção.
          </Reveal>
          <Reveal delay={160}>
            <a href="#categories" className="vl-pill vl-pill-dark">Ver categorias</a>
          </Reveal>
        </div>
      </section>

      {/* ============ HOW WE WORK + FAQ ACCORDION ============ */}
      <section className="vl-howfaq">
        <Reveal as="h2" className="vl-howfaq-title">
          Como funciona e o que você consegue com a <span className="vl-italic">AGTGestor.</span>
        </Reveal>
        <Reveal className="vl-howfaq-list" delay={120}>
          <div className="faq-rows">
            {FAQ.slice(0, 4).map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </Reveal>
      </section>

      {/* ============ SPLIT 2: Testimonials as parallax pairs ============ */}
      <section className="vl-search-section">
        <div className="vl-search-row">
          <Reveal as="h2" className="vl-search-title">A agenda nunca para</Reveal>
          <Reveal as="p" delay={100} className="vl-search-text">
            Seu cliente não te chama no horário comercial. Te chama no almoço, na hora do banho, antes de dormir. O AGTGestor responde em todos esses momentos. Você responde quando quiser intervir.
          </Reveal>
          <Reveal delay={200} className="vl-search-image vl-search-img-1">
            <ChatLogArt />
          </Reveal>
        </div>
        <div className="vl-search-row vl-search-row-rev">
          <Reveal as="h2" className="vl-search-title">Confiança é a moeda</Reveal>
          <Reveal as="p" delay={100} className="vl-search-text">
            Mostramos seus serviços, preços e horários exatamente como você cadastrou. O cliente revisa tudo antes de fechar e você confirma do seu lado. Menos mal-entendidos e menos faltas.
          </Reveal>
          <Reveal delay={200} className="vl-search-image vl-search-img-2">
            <ConfirmReceiptArt />
          </Reveal>
        </div>
      </section>

      {/* ============ TESTIMONIALS BAND ============ */}
      <section className="vl-testimonials">
        <Reveal as="h2" className="vl-section-title">
          Quem trocou o caderno, <span className="vl-italic">não volta atrás.</span>
        </Reveal>
        <div className="vl-testimonials-grid">
          {TESTIMONIALS.map((t, i) => (
            <Reveal key={t.name} delay={i * 80} className="vl-testimonial">
              <div className="vl-testimonial-rating" aria-label={`${t.rating} de 5`}><span /><span /><span /><span /><span /></div>
              <p className="vl-testimonial-text">"{t.text}"</p>
              <div className="vl-testimonial-author">
                <div className="vl-testimonial-avatar">{t.avatar}</div>
                <div>
                  <div className="vl-testimonial-name">{t.name}</div>
                  <div className="vl-testimonial-role">{t.role}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ============ CATEGORIES (Industries) ============ */}
      <section className="vl-categories" id="categories">
        <Reveal as="h2" className="vl-section-title">
          Para qual <span className="vl-italic">negócio?</span>
        </Reveal>
        <Reveal as="p" delay={80} className="vl-section-sub">
          Salões, barbearias, esmalterias, clínicas e qualquer microempresa com agenda.
        </Reveal>
        <Reveal delay={160}>
          <CategoryFloating categories={CATEGORIES} />
        </Reveal>
      </section>

      {/* ============ COST OF STANDING STILL ============ */}
      <section className="vl-cost">
        <Reveal as="h2" className="vl-cost-title">
          O custo de <span className="vl-italic">ficar parado.</span>
        </Reveal>
        <Reveal as="p" delay={100} className="vl-cost-desc">
          Quando você não responde, o cliente vai para o concorrente. A cada semana sem sistema, você perde clientes sem nem perceber. O AGTGestor elimina essa fricção. Não é apenas mais um software. É a engrenagem que sincroniza seu tempo com a demanda real do mercado.
        </Reveal>
        <Reveal delay={200}>
          <BigAccordion items={COST_STEPS} defaultOpen={0} />
        </Reveal>
      </section>

      {/* ============ FEATURES GRID (preserved) ============ */}
      <section className="vl-features" id="features">
        <Reveal as="h2" className="vl-section-title">
          Tudo o que você precisa, <span className="vl-italic">nada que não use.</span>
        </Reveal>
        <div className="vl-features-grid">
          {FEATURES.map((f, idx) => (
            <Reveal key={f.t} delay={idx * 60} className="vl-feature">
              <div className="vl-feature-head">
                <div className="vl-feature-icon"><UIIcon name={f.i} size={22} /></div>
                <span className="vl-feature-n">{String(idx + 1).padStart(2, '0')}</span>
              </div>
              <span className="vl-feature-tag">{f.tag}</span>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ============ PRICING ============ */}
      <section className="vl-pricing" id="pricing">
        <Reveal as="h2" className="vl-section-title">
          Simples e <span className="vl-italic">sem surpresas.</span>
        </Reveal>
        <Reveal as="p" delay={80} className="vl-section-sub">
          Um plano completo. Tudo incluso. Sete dias grátis para testar.
        </Reveal>
        <Reveal className="vl-pricing-card" delay={160}>
          <div className="vl-pricing-tag">Plano completo</div>
          <h3>Profissional</h3>
          <div className="vl-pricing-price">R$27,90<span>/mês</span></div>
          <p className="vl-pricing-note">7 dias grátis, sem cartão de crédito</p>
          <ul className="vl-pricing-list">
            <li>Agenda com calendário completo</li>
            <li>Chatbot automático no WhatsApp</li>
            <li>Serviços e categorias ilimitados</li>
            <li>Gestão de pedidos e agendamentos</li>
            <li>Logo e banner personalizados</li>
            <li>Link exclusivo da sua agenda</li>
            <li>Suporte prioritário</li>
          </ul>
          <Link to="/register" className="vl-pill vl-pill-dark vl-pill-block">Começar Teste Grátis</Link>
        </Reveal>
      </section>

      {/* ============ FAQ (remaining) ============ */}
      <section className="vl-faq" id="faq">
        <Reveal as="h2" className="vl-section-title">
          Perguntas <span className="vl-italic">frequentes.</span>
        </Reveal>
        <Reveal className="vl-faq-list" delay={100}>
          <div className="faq-rows">
            {FAQ.slice(4).map((f) => (
              <FaqItem key={f.q} q={f.q} a={f.a} />
            ))}
          </div>
        </Reveal>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="vl-final">
        <Reveal as="h2" className="vl-final-title">
          Pronto para sair do <span className="vl-italic">caderno?</span>
        </Reveal>
        <Reveal as="p" delay={80} className="vl-final-sub">
          Em 5 minutos seu WhatsApp já está atendendo sozinho.
        </Reveal>
        <Reveal className="vl-final-cta" delay={160}>
          <Link to="/register" className="vl-pill vl-pill-dark vl-pill-lg">Criar conta grátis</Link>
          <a href="#pricing" className="vl-pill vl-pill-soft vl-pill-lg">Ver preços</a>
        </Reveal>
        <Reveal as="p" delay={240} className="vl-final-trust">
          Sem cartão · 7 dias grátis · Cancele em 1 clique
        </Reveal>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="vl-footer">
        <div className="vl-footer-grid">
          <div className="vl-footer-brand">
            <img src="/agtgestor-logo.svg" alt="AGTGestor" />
            <p>Agenda profissional com atendimento automático no WhatsApp.</p>
          </div>
          <div className="vl-footer-col">
            <h4>Produto</h4>
            <a href="#process">Como funciona</a>
            <a href="#categories">Para quem</a>
            <a href="#pricing">Preços</a>
            <a href="#faq">Dúvidas</a>
          </div>
          <div className="vl-footer-col">
            <h4>Conta</h4>
            <Link to="/login">Entrar</Link>
            <Link to="/register">Criar conta</Link>
          </div>
          <div className="vl-footer-col">
            <h4>Contato</h4>
            <a href="mailto:contato@agentegestor.com.br">contato@agentegestor.com.br</a>
          </div>
        </div>
        <div className="vl-footer-bottom">
          <span>© 2026 AGTGestor™</span>
          <span>Todos os direitos reservados</span>
        </div>
      </footer>
    </div>
  );
}
