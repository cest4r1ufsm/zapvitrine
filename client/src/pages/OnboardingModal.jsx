/* eslint-disable react-refresh/only-export-components */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import UIIcon from '../components/UIIcon';
import { btnPrimary, btnGlass } from '../styles/buttons';
import { tint } from '../styles/surfaces';

const STORAGE_KEY = 'agtgestor_onboarding_done';

const STEPS = [
  {
    icon: 'home',
    title: 'Bem-vindo ao AGTGestor',
    description: 'Você tem em mãos um sistema completo de agendamentos com chatbot no WhatsApp. Em poucos minutos, seus clientes poderão marcar horários por lá. Tudo funciona de forma automática, sem depender de você.',
    tip: null,
    action: null,
  },
  {
    icon: 'store',
    title: 'Configure sua loja',
    description: 'Primeiro, vá em "Minha Loja" e preencha suas informações: nome, telefone e endereço. É aqui que você também define os horários de funcionamento para o sistema saber quando oferecer agendamentos.',
    tip: 'Na seção "Configuração de agenda", ative os dias que você atende e defina os horários de início e fim de cada dia.',
    action: { label: 'Ir para Minha Loja', path: '/dashboard/loja' },
  },
  {
    icon: 'services',
    title: 'Cadastre seus serviços',
    description: 'Em "Serviços", adicione tudo o que você oferece, como corte, barba e manicure. Para cada serviço, defina o preço e a duração em minutos. O sistema usa esse tempo para calcular automaticamente os horários disponíveis.',
    tip: 'Um corte de 30 min + 10 min de intervalo significa que o próximo cliente poderá agendar 40 min depois. Configure isso no campo "Intervalo após".',
    action: { label: 'Ir para Serviços', path: '/dashboard/servicos' },
  },
  {
    icon: 'professionals',
    title: 'Adicione seus profissionais',
    description: 'Se você tem uma equipe (vários cabeleireiros, manicures, etc.), cadastre cada um em "Profissionais". Quando um cliente agendar pelo WhatsApp, ele poderá escolher com quem quer ser atendido.',
    tip: 'Se você trabalha sozinho, pode pular essa etapa. O sistema funciona normalmente sem profissionais cadastrados.',
    action: { label: 'Ir para Profissionais', path: '/dashboard/profissionais' },
  },
  {
    icon: 'blocked',
    title: 'Bloqueie horários de folga',
    description: 'Em "Bloqueios", você pode marcar datas ou dias em que não vai atender, como feriados, férias e folgas. O chatbot respeita esses bloqueios e nunca oferece um horário ocupado ao cliente.',
    tip: 'Você pode bloquear toda segunda-feira de forma recorrente ou uma data específica como 24/12, sem criar serviços falsos para ocupar tempo.',
    action: { label: 'Ir para Bloqueios', path: '/dashboard/bloqueios' },
  },
  {
    icon: 'bot',
    title: 'Conecte o WhatsApp',
    description: 'Em "Chatbot", conecte seu WhatsApp Business escaneando o QR Code. A partir daí, qualquer cliente que mandar mensagem no seu número vai ser atendido automaticamente pelo bot, que vai oferecer os horários disponíveis.',
    tip: 'O chatbot funciona 24h. Se um cliente mandar mensagem durante a madrugada, o sistema responde e agenda; você vê tudo na Agenda quando acordar.',
    action: { label: 'Ir para Chatbot', path: '/dashboard/chatbot' },
  },
  {
    icon: 'calendar',
    title: 'Gerencie sua agenda',
    description: 'Na "Agenda", você tem uma visão semanal de todos os agendamentos. Pode confirmar, concluir ou cancelar cada um. Também pode criar agendamentos manualmente para clientes que ligam ou chegam pessoalmente.',
    tip: 'Na seção "Clientes", você encontra o histórico completo de cada cliente: visitas, serviços e data do último atendimento.',
    action: { label: 'Ir para Agenda', path: '/dashboard/agenda' },
  },
  {
    icon: 'check',
    title: 'Tudo pronto',
    description: 'Agora é só compartilhar seu número de WhatsApp com os clientes e deixar o sistema trabalhar por você. Sempre que precisar, este tutorial está disponível no menu "Início".',
    tip: null,
    action: null,
  },
];

export default function OnboardingModal({ onClose }) {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;
  const isFirst = step === 0;

  function handleFinish() {
    localStorage.setItem(STORAGE_KEY, 'true');
    onClose();
  }

  function handleAction(path) {
    localStorage.setItem(STORAGE_KEY, 'true');
    onClose();
    navigate(path);
  }

  return (
    <div style={s.overlay}>
      <div style={s.box}>
        {/* Progress dots */}
        <div style={s.dots}>
          {STEPS.map((_, i) => (
            <div key={i} style={{ ...s.dot, background: i === step ? 'var(--btn-graphite)' : i < step ? 'var(--tint-border)' : 'var(--border)' }} />
          ))}
        </div>

        {/* Step counter */}
        <div style={s.counter}>{step + 1} de {STEPS.length}</div>

        {/* Content */}
        <div style={s.iconWrap}><UIIcon name={current.icon} size={34} /></div>
        <h2 style={s.title}>{current.title}</h2>
        <p style={s.description}>{current.description}</p>

        {current.tip && (
          <div style={s.tip}>{current.tip}</div>
        )}

        {/* Actions */}
        <div style={s.actions}>
          {!isFirst && (
            <button style={s.btnBack} onClick={() => setStep(s => s - 1)}>‹ Anterior</button>
          )}
          <div style={{ flex: 1 }} />
          {current.action && (
            <button style={s.btnAction} onClick={() => handleAction(current.action.path)}>
              {current.action.label} →
            </button>
          )}
          {isLast ? (
            <button style={s.btnPrimary} onClick={handleFinish}>Começar a usar</button>
          ) : (
            <button style={s.btnPrimary} onClick={() => setStep(s => s + 1)}>Próximo ›</button>
          )}
        </div>

        {/* Skip */}
        {!isLast && (
          <button style={s.skip} onClick={handleFinish}>Pular tutorial</button>
        )}
      </div>
    </div>
  );
}

// Auto-show on first access
export function useOnboarding() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      // Small delay so the dashboard loads first
      const t = setTimeout(() => setShow(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  return { show, setShow };
}

export { STORAGE_KEY };

const s = {
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 },
  box:         { background: '#fff', borderRadius: 20, width: '100%', maxWidth: 520, padding: '32px 32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', position: 'relative' },
  dots:        { display: 'flex', gap: 6, marginBottom: 8 },
  dot:         { width: 8, height: 8, borderRadius: '50%', transition: 'background 0.3s' },
  counter:     { fontSize: 12, color: '#aaa', marginBottom: 20 },
  iconWrap:    { fontSize: 56, marginBottom: 16, lineHeight: 1 },
  title:       { fontSize: 22, fontWeight: 800, marginBottom: 12, color: '#111', margin: '0 0 12px' },
  description: { fontSize: 15, lineHeight: 1.7, color: '#444', margin: '0 0 16px' },
  tip:         { ...tint, padding: '12px 16px', fontSize: 13, textAlign: 'left', width: '100%', boxSizing: 'border-box', marginBottom: 8, lineHeight: 1.6 },
  actions:     { display: 'flex', gap: 8, width: '100%', marginTop: 20, alignItems: 'center', flexWrap: 'wrap' },
  btnPrimary:  { ...btnPrimary, padding: '11px 20px', fontWeight: 700, fontSize: 14 },
  btnBack:     { background: 'var(--btn-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-btn)', padding: '8px 16px', cursor: 'pointer', fontSize: 14, boxShadow: 'var(--btn-glass-shadow)' },
  btnAction:   { ...btnGlass, padding: '11px 16px', fontSize: 13 },
  skip:        { marginTop: 12, background: 'none', border: 'none', color: '#aaa', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' },
};
