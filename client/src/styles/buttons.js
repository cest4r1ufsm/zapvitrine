// Estilos de botão compartilhados pelas telas que usam estilo inline
// (e por isso não herdam .btn / .btn-primary de sophisticated.css).
//
// Os valores vêm das variáveis CSS definidas em sophisticated.css, então o
// tema claro/escuro continua funcionando sem duplicar paleta aqui.

// Grafite sóbrio com véu de vidro: gradiente de realce no topo + sombra curta.
export const btnPrimary = {
  background: 'var(--btn-graphite)',
  color: '#fff',
  border: '1px solid var(--btn-graphite)',
  borderRadius: 'var(--radius-btn)',
  padding: '8px 16px',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  boxShadow: 'var(--btn-glass-shadow)',
  transition: 'transform 180ms cubic-bezier(.2,.8,.2,1), box-shadow 180ms cubic-bezier(.2,.8,.2,1)',
};

// Vidro claro: quase imperceptível parado, ganha corpo no hover.
export const btnGlass = {
  background: 'var(--btn-surface)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-btn)',
  padding: '8px 16px',
  fontWeight: 600,
  fontSize: 14,
  cursor: 'pointer',
  boxShadow: 'var(--btn-glass-shadow)',
  transition: 'background-color 180ms cubic-bezier(.2,.8,.2,1), border-color 180ms cubic-bezier(.2,.8,.2,1)',
};

// Alternador: mesma família, só muda quem está ativo.
export const toggleOn = {
  ...btnPrimary,
  padding: '8px 12px',
  fontSize: 13,
  borderRadius: 'var(--radius-btn)',
};

export const toggleOff = {
  ...btnGlass,
  padding: '8px 12px',
  fontSize: 13,
  color: 'var(--text-secondary)',
  fontWeight: 500,
};
