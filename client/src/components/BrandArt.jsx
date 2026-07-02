// Brand-consistent SVG illustrations — replace emoji panels.
// Palette: ink #18181f · lilac #B8A8FF · lime #DFF26B · cream #f6f6f2

export function LinkCardArt() {
  return (
    <svg className="brand-art" viewBox="0 0 520 360" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="lc-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#fafafa" />
        </linearGradient>
        <filter id="lc-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="14" stdDeviation="18" floodColor="#18181f" floodOpacity="0.10" />
        </filter>
      </defs>

      {/* Browser-style card */}
      <g filter="url(#lc-shadow)">
        <rect x="60" y="60" width="400" height="240" rx="22" fill="url(#lc-card)" stroke="#18181f" strokeOpacity="0.08" />
        {/* traffic lights */}
        <circle cx="86" cy="86" r="5" fill="#FF6B6B" opacity="0.7" />
        <circle cx="102" cy="86" r="5" fill="#FFB800" opacity="0.7" />
        <circle cx="118" cy="86" r="5" fill="#00C48C" opacity="0.7" />
        {/* address bar */}
        <rect x="140" y="76" width="280" height="22" rx="11" fill="#f4f4f6" />
        <text x="155" y="91" fontFamily="ui-monospace, monospace" fontSize="11" fill="#18181f" opacity="0.7">
          agtgestor.com.br/studio-m
        </text>
        {/* hero in card */}
        <text x="86" y="148" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="26" fill="#18181f" letterSpacing="-1">
          Agenda do Studio M
        </text>
        <text x="86" y="172" fontFamily="Inter, sans-serif" fontSize="11" fill="#18181f" opacity="0.55">
          Escolha o horário · paga depois
        </text>
        {/* time slot pills */}
        <g>
          <rect x="86" y="194" width="68" height="32" rx="16" fill="#18181f" />
          <text x="120" y="214" fontFamily="Inter, sans-serif" fontWeight="600" fontSize="12" fill="#fff" textAnchor="middle">14h00</text>

          <rect x="162" y="194" width="68" height="32" rx="16" fill="#fff" stroke="#18181f" strokeOpacity="0.15" />
          <text x="196" y="214" fontFamily="Inter, sans-serif" fontWeight="500" fontSize="12" fill="#18181f" textAnchor="middle">15h30</text>

          <rect x="238" y="194" width="68" height="32" rx="16" fill="#fff" stroke="#18181f" strokeOpacity="0.15" />
          <text x="272" y="214" fontFamily="Inter, sans-serif" fontWeight="500" fontSize="12" fill="#18181f" textAnchor="middle">17h00</text>

          <rect x="314" y="194" width="68" height="32" rx="16" fill="#fff" stroke="#18181f" strokeOpacity="0.15" />
          <text x="348" y="214" fontFamily="Inter, sans-serif" fontWeight="500" fontSize="12" fill="#18181f" textAnchor="middle">18h30</text>
        </g>
        {/* service rows */}
        <line x1="86" y1="248" x2="434" y2="248" stroke="#18181f" strokeOpacity="0.06" />
        <text x="86" y="270" fontFamily="Inter, sans-serif" fontWeight="600" fontSize="13" fill="#18181f">Corte + Barba</text>
        <text x="434" y="270" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="13" fill="#18181f" textAnchor="end">R$ 65</text>
      </g>

      {/* Floating lime tag */}
      <g transform="translate(380, 32)">
        <rect width="120" height="30" rx="15" fill="#DFF26B" />
        <circle cx="16" cy="15" r="4" fill="#18181f" />
        <text x="28" y="20" fontFamily="Inter, sans-serif" fontWeight="600" fontSize="11" fill="#18181f">Link único</text>
      </g>
      {/* Floating lilac chip */}
      <g transform="translate(20, 280)">
        <rect width="150" height="44" rx="14" fill="rgba(184, 168, 255, 0.85)" />
        <circle cx="20" cy="22" r="10" fill="#18181f" />
        <path d="M 14 22 L 19 26 L 27 18" stroke="#DFF26B" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x="38" y="20" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="11" fill="#18181f">Confirmado</text>
        <text x="38" y="34" fontFamily="Inter, sans-serif" fontSize="10" fill="#18181f" opacity="0.65">Sáb · 14h</text>
      </g>
    </svg>
  );
}

export function ChatLogArt() {
  return (
    <svg className="brand-art" viewBox="0 0 520 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="cl-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fdfdfb" />
          <stop offset="100%" stopColor="#f4f4f0" />
        </linearGradient>
        <filter id="cl-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#18181f" floodOpacity="0.08" />
        </filter>
      </defs>

      {/* Timestamp chip top */}
      <g transform="translate(220, 14)" opacity="0.6">
        <rect width="80" height="20" rx="10" fill="#18181f" fillOpacity="0.08" />
        <text x="40" y="13" fontFamily="Inter, sans-serif" fontWeight="500" fontSize="9" fill="#18181f" textAnchor="middle">HOJE · 23:47</text>
      </g>

      {/* Bubble 1 — incoming (cliente) */}
      <g filter="url(#cl-shadow)">
        <path d="M 40 56 L 220 56 Q 232 56 232 68 L 232 92 Q 232 104 220 104 L 56 104 L 40 116 Z"
              fill="url(#cl-bg)" stroke="#18181f" strokeOpacity="0.06" />
        <text x="60" y="80" fontFamily="Inter, sans-serif" fontSize="13" fill="#18181f">
          Oi! Vocês têm horário pra
        </text>
        <text x="60" y="97" fontFamily="Inter, sans-serif" fontSize="13" fill="#18181f">
          sábado de manhã?
        </text>
      </g>

      {/* Bubble 2 — bot response (lilac filled) */}
      <g filter="url(#cl-shadow)">
        <path d="M 260 130 L 484 130 Q 496 130 496 142 L 496 178 Q 496 190 484 190 L 478 190 L 488 202 L 270 190 Q 260 190 260 178 Z"
              fill="#B8A8FF" />
        <text x="280" y="154" fontFamily="Inter, sans-serif" fontWeight="600" fontSize="13" fill="#18181f">
          Temos sim! 9h ou 10h30
        </text>
        <text x="280" y="172" fontFamily="Inter, sans-serif" fontSize="12" fill="#18181f" opacity="0.75">
          Corte + Barba · 45min · R$ 65
        </text>
      </g>

      {/* Speed badge */}
      <g transform="translate(370, 92)">
        <rect width="120" height="28" rx="14" fill="#DFF26B" />
        <circle cx="18" cy="14" r="6" fill="#18181f" />
        <path d="M 14 14 L 17 17 L 22 11" stroke="#DFF26B" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x="32" y="18" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="10.5" fill="#18181f">Respondido em 2s</text>
      </g>
    </svg>
  );
}

// Category line icons — single-weight stroke, ink color, brand-consistent
export function IconSalao() {
  return (
    <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="26" cy="34" r="9" />
      <circle cx="54" cy="34" r="9" />
      <line x1="32" y1="40" x2="48" y2="40" />
      <path d="M 32 40 L 50 58" />
      <path d="M 48 40 L 30 58" />
    </svg>
  );
}
export function IconBarbearia() {
  return (
    <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="22" y="18" width="36" height="44" rx="6" />
      <line x1="22" y1="30" x2="58" y2="30" />
      <line x1="22" y1="50" x2="58" y2="50" />
      <line x1="40" y1="18" x2="40" y2="14" />
      <circle cx="40" cy="40" r="3" />
    </svg>
  );
}
export function IconEstetica() {
  return (
    <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M 40 16 L 44 36 L 64 40 L 44 44 L 40 64 L 36 44 L 16 40 L 36 36 Z" />
      <circle cx="40" cy="40" r="3" />
    </svg>
  );
}
export function IconClinica() {
  return (
    <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M 26 16 L 26 36 Q 26 50 40 50 Q 54 50 54 36 L 54 16" />
      <circle cx="26" cy="14" r="3" />
      <circle cx="54" cy="14" r="3" />
      <line x1="40" y1="50" x2="40" y2="60" />
      <circle cx="40" cy="64" r="4" />
    </svg>
  );
}

export function IconMicro() {
  return (
    <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {/* storefront awning */}
      <path d="M 16 28 L 22 18 L 58 18 L 64 28 Z" />
      {/* awning stripes */}
      <line x1="28" y1="18" x2="28" y2="28" />
      <line x1="40" y1="18" x2="40" y2="28" />
      <line x1="52" y1="18" x2="52" y2="28" />
      {/* shop body */}
      <path d="M 20 28 L 20 62 L 60 62 L 60 28" />
      {/* door */}
      <rect x="34" y="40" width="12" height="22" />
      <circle cx="42" cy="52" r="1" />
      {/* window */}
      <rect x="24" y="34" width="8" height="8" />
      <rect x="48" y="34" width="8" height="8" />
    </svg>
  );
}

export function ConfirmReceiptArt() {
  return (
    <svg className="brand-art" viewBox="0 0 520 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id="cr-card" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#fafafa" />
        </linearGradient>
        <filter id="cr-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="#18181f" floodOpacity="0.10" />
        </filter>
      </defs>

      {/* main confirmation card */}
      <g filter="url(#cr-shadow)">
        <rect x="80" y="36" width="360" height="170" rx="20" fill="url(#cr-card)" stroke="#18181f" strokeOpacity="0.06" />

        {/* check circle */}
        <circle cx="118" cy="74" r="22" fill="#18181f" />
        <path d="M 108 74 L 116 82 L 130 66" stroke="#DFF26B" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />

        <text x="156" y="68" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="14" fill="#18181f" opacity="0.5" letterSpacing="2">
          AGENDAMENTO
        </text>
        <text x="156" y="89" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="22" fill="#18181f" letterSpacing="-0.5">
          Confirmado
        </text>

        <line x1="100" y1="116" x2="420" y2="116" stroke="#18181f" strokeOpacity="0.06" />

        {/* details rows */}
        <text x="100" y="138" fontFamily="Inter, sans-serif" fontSize="11" fill="#18181f" opacity="0.5" letterSpacing="1">CLIENTE</text>
        <text x="100" y="154" fontFamily="Inter, sans-serif" fontWeight="600" fontSize="13" fill="#18181f">Marina Souza</text>

        <text x="240" y="138" fontFamily="Inter, sans-serif" fontSize="11" fill="#18181f" opacity="0.5" letterSpacing="1">SERVIÇO</text>
        <text x="240" y="154" fontFamily="Inter, sans-serif" fontWeight="600" fontSize="13" fill="#18181f">Corte + Coloração</text>

        <text x="100" y="180" fontFamily="Inter, sans-serif" fontSize="11" fill="#18181f" opacity="0.5" letterSpacing="1">QUANDO</text>
        <text x="100" y="196" fontFamily="Inter, sans-serif" fontWeight="600" fontSize="13" fill="#18181f">Sábado · 14h00</text>

        <text x="240" y="180" fontFamily="Inter, sans-serif" fontSize="11" fill="#18181f" opacity="0.5" letterSpacing="1">VALOR</text>
        <text x="240" y="196" fontFamily="Inter, sans-serif" fontWeight="600" fontSize="13" fill="#18181f">R$ 180,00</text>
      </g>

      {/* lilac mini chip */}
      <g transform="translate(330, 12)">
        <rect width="110" height="26" rx="13" fill="#B8A8FF" />
        <circle cx="14" cy="13" r="3" fill="#18181f" />
        <text x="24" y="17" fontFamily="Inter, sans-serif" fontWeight="600" fontSize="10" fill="#18181f">Notificado · WhatsApp</text>
      </g>
      {/* lime mini chip */}
      <g transform="translate(40, 196)">
        <rect width="70" height="22" rx="11" fill="#DFF26B" />
        <text x="35" y="15" fontFamily="Inter, sans-serif" fontWeight="700" fontSize="9" fill="#18181f" textAnchor="middle" letterSpacing="0.5">PAGO</text>
      </g>
    </svg>
  );
}
