import { useState } from 'react';
import UIIcon from './UIIcon';
import { panel, pill } from '../styles/surfaces';
import { btnPrimary } from '../styles/buttons';

export default function PageGuide({ pageKey, title, steps, color = '#2B3441' }) {
  const storageKey = `agtgestor_guide_${pageKey}`;
  const [visible, setVisible] = useState(() => !localStorage.getItem(storageKey));
  const [expanded, setExpanded] = useState(true);

  function dismiss() {
    localStorage.setItem(storageKey, 'true');
    setVisible(false);
  }

  if (!visible) return null;

  // A cor da página entra só como um filete à esquerda — o card em si é neutro.
  return (
    <div className="page-guide" style={{ ...panel, borderLeft: `2px solid ${color}66` }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <UIIcon name="check" size={18} />
          <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{title}</span>
          <span style={pill}>Guia rápido</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{expanded ? 'Recolher ▲' : 'Expandir ▼'}</span>
          <button onClick={e => { e.stopPropagation(); dismiss(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', lineHeight: 1 }} title="Não mostrar mais"><UIIcon name="close" /></button>
        </div>
      </div>

      {/* Steps */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--tint-surface)', border: '1px solid var(--tint-border)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1, boxSizing: 'border-box' }}>
                {i + 1}
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: step }} />
            </div>
          ))}
          <button onClick={dismiss} style={{ ...btnPrimary, alignSelf: 'flex-start', marginTop: 4, padding: '7px 16px', fontWeight: 700, fontSize: 13 }}>
            Entendi, pode fechar
          </button>
        </div>
      )}
    </div>
  );
}
