import { useState, useEffect } from 'react';

export default function PageGuide({ pageKey, title, steps, color = '#6C63FF' }) {
  const storageKey = `agtgestor_guide_${pageKey}`;
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!localStorage.getItem(storageKey)) setVisible(true);
  }, [storageKey]);

  function dismiss() {
    localStorage.setItem(storageKey, 'true');
    setVisible(false);
  }

  if (!visible) return null;

  const light = color + '18';
  const border = color + '44';

  return (
    <div style={{ background: light, border: `1px solid ${border}`, borderRadius: 12, marginBottom: 24, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>💡</span>
          <span style={{ fontWeight: 700, fontSize: 14, color }}>{title}</span>
          <span style={{ background: color, color: '#fff', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20 }}>Guia rápido</span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#888' }}>{expanded ? 'Recolher ▲' : 'Expandir ▼'}</span>
          <button onClick={e => { e.stopPropagation(); dismiss(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 18, lineHeight: 1 }} title="Não mostrar mais">✕</button>
        </div>
      </div>

      {/* Steps */}
      {expanded && (
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>
                {i + 1}
              </div>
              <p style={{ margin: 0, fontSize: 13, color: '#333', lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: step }} />
            </div>
          ))}
          <button onClick={dismiss} style={{ alignSelf: 'flex-start', marginTop: 4, background: color, color: '#fff', border: 'none', borderRadius: 8, padding: '7px 16px', fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
            Entendi, pode fechar ✓
          </button>
        </div>
      )}
    </div>
  );
}
