// Superfícies compartilhadas — painéis, destaques e avatares.
//
// Regra: nenhum fundo colorido chapado. O destaque vem de uma superfície
// translúcida neutra com uma linha fina; a cor da página, quando existe,
// entra só como um filete de identidade, nunca como banho de fundo.

const BLUR = 'var(--btn-blur)';

// Painel de vidro: o card padrão para blocos de destaque (guias, formulários).
export const panel = {
  background: 'var(--panel-surface)',
  border: '1px solid var(--panel-border)',
  borderRadius: 'var(--radius-lg)',
  WebkitBackdropFilter: BLUR,
  backdropFilter: BLUR,
  boxShadow: 'var(--panel-shadow)',
};

// Destaque discreto dentro de um card (caixas de informação, resumos).
export const tint = {
  background: 'var(--tint-surface)',
  border: '1px solid var(--tint-border)',
  borderRadius: 'var(--radius-md)',
  color: 'var(--text-secondary)',
};

// Avatar em grafite, com o mesmo gradiente dos botões primários.
export const avatar = {
  background:
    'linear-gradient(180deg, var(--btn-glass-top), rgba(255,255,255,0) 55%),'
    + ' linear-gradient(180deg, var(--btn-graphite), var(--btn-graphite-dark))',
  color: '#fff',
  border: '1px solid var(--btn-glass-edge)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,.14)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 700,
  flexShrink: 0,
};

// Pílula neutra para rótulos pequenos ("Guia rápido", contadores).
export const pill = {
  background: 'var(--tint-surface)',
  border: '1px solid var(--tint-border)',
  color: 'var(--text-secondary)',
  borderRadius: 'var(--radius-full)',
  fontSize: 11,
  fontWeight: 600,
  padding: '2px 9px',
  letterSpacing: '.01em',
};
