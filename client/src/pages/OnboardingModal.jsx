/* eslint-disable react-refresh/only-export-components */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UIIcon from '../components/UIIcon';
import { btnPrimary, btnGlass } from '../styles/buttons';
import { tint } from '../styles/surfaces';

const STORAGE_KEY = 'agtgestor_onboarding_done';

const STEPS = [
  { icon: 'store', title: 'Seu salão, organizado', description: 'Cadastre seu negócio, um serviço e os horários de atendimento.', tip: null, action: { label: 'Configurar meu negócio', path: '/dashboard/loja' } },
  { icon: 'calendar', title: 'Sua rotina começa em Hoje', description: 'Veja seus atendimentos. Use a Agenda para adicionar ou confirmar horários.', tip: null, action: { label: 'Abrir agenda', path: '/dashboard/agenda' } },
  { icon: 'check', title: 'Avance no seu ritmo', description: 'Equipe, página pública e WhatsApp ficam no menu Negócio.', tip: null, action: null },
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

  return { show, setShow };
}

export { STORAGE_KEY };

const s = {
  overlay:     { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: 16 },
  box:         { background: 'var(--bg-card)', borderRadius: 16, width: '100%', maxWidth: 520, padding: '32px 32px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', position: 'relative' },
  dots:        { display: 'flex', gap: 6, marginBottom: 8 },
  dot:         { width: 8, height: 8, borderRadius: '50%', transition: 'background 0.3s' },
  counter:     { fontSize: 12, color: '#aaa', marginBottom: 20 },
  iconWrap:    { fontSize: 56, marginBottom: 16, lineHeight: 1 },
  title:       { fontSize: 22, fontWeight: 800, marginBottom: 12, color: 'var(--text-primary)', margin: '0 0 12px' },
  description: { fontSize: 15, lineHeight: 1.7, color: 'var(--text-secondary)', margin: '0 0 16px' },
  tip:         { ...tint, padding: '12px 16px', fontSize: 13, textAlign: 'left', width: '100%', boxSizing: 'border-box', marginBottom: 8, lineHeight: 1.6 },
  actions:     { display: 'flex', gap: 8, width: '100%', marginTop: 20, alignItems: 'center', flexWrap: 'wrap' },
  btnPrimary:  { ...btnPrimary, padding: '11px 20px', fontWeight: 700, fontSize: 14 },
  btnBack:     { background: 'var(--btn-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-btn)', padding: '8px 16px', cursor: 'pointer', fontSize: 14, boxShadow: 'var(--btn-glass-shadow)' },
  btnAction:   { ...btnGlass, padding: '11px 16px', fontSize: 13 },
  skip:        { marginTop: 12, background: 'none', border: 'none', color: '#aaa', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' },
};
