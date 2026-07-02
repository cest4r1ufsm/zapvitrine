import { useState } from 'react';
import { IconSalao, IconBarbearia, IconEstetica, IconClinica, IconMicro } from './BrandArt';

// 8 organic blob shapes — randomized but deterministic SVG paths
const BLOB_PATHS = [
  'M 50 10 C 75 12 95 28 96 52 C 97 78 78 95 52 96 C 26 95 8 76 10 50 C 12 28 28 10 50 10 Z',
  'M 50 8 C 80 10 96 32 92 56 C 88 82 64 96 42 92 C 18 86 6 62 14 38 C 22 18 32 8 50 8 Z',
  'M 48 12 C 72 8 92 26 94 50 C 96 76 76 96 50 94 C 24 92 8 72 12 46 C 16 24 32 14 48 12 Z',
  'M 52 8 C 78 14 94 36 90 60 C 86 84 60 96 36 88 C 14 80 6 56 14 32 C 22 14 36 6 52 8 Z',
];

const PERIPHERAL_BLOBS = [
  // {top, left, size, hue, opacity, blur, animDelay, rot, pathIdx}
  { top: '8%',  left: '12%', size: 90,  hue: 'lilac',  opacity: 0.35, blur: 0,  delay: 0,    rot: 12,  path: 0 },
  { top: '15%', left: '78%', size: 70,  hue: 'lime',   opacity: 0.30, blur: 2,  delay: -5,   rot: -20, path: 1 },
  { top: '38%', left: '4%',  size: 110, hue: 'lilac',  opacity: 0.18, blur: 8,  delay: -10,  rot: 35,  path: 2 },
  { top: '62%', left: '90%', size: 80,  hue: 'cream',  opacity: 0.55, blur: 0,  delay: -3,   rot: 8,   path: 3 },
  { top: '78%', left: '18%', size: 100, hue: 'lime',   opacity: 0.22, blur: 6,  delay: -8,   rot: -15, path: 1 },
  { top: '85%', left: '70%', size: 60,  hue: 'lilac',  opacity: 0.40, blur: 0,  delay: -12,  rot: 22,  path: 0 },
  { top: '28%', left: '88%', size: 50,  hue: 'pink',   opacity: 0.30, blur: 3,  delay: -6,   rot: -30, path: 3 },
  { top: '55%', left: '12%', size: 65,  hue: 'pink',   opacity: 0.25, blur: 4,  delay: -14,  rot: 18,  path: 2 },
];

const HUE_MAP = {
  lilac: { fill: 'url(#blob-lilac)', stroke: 'rgba(184, 168, 255, 0.5)' },
  lime:  { fill: 'url(#blob-lime)',  stroke: 'rgba(223, 242, 107, 0.5)' },
  cream: { fill: 'url(#blob-cream)', stroke: 'rgba(255, 255, 255, 0.6)' },
  pink:  { fill: 'url(#blob-pink)',  stroke: 'rgba(255, 192, 213, 0.5)' },
};

function BlobDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        <radialGradient id="blob-lilac" cx="35%" cy="30%">
          <stop offset="0%" stopColor="#dfd5ff" />
          <stop offset="60%" stopColor="#B8A8FF" />
          <stop offset="100%" stopColor="#8c79e0" />
        </radialGradient>
        <radialGradient id="blob-lime" cx="35%" cy="30%">
          <stop offset="0%" stopColor="#f1f9bb" />
          <stop offset="60%" stopColor="#DFF26B" />
          <stop offset="100%" stopColor="#b6c84a" />
        </radialGradient>
        <radialGradient id="blob-cream" cx="35%" cy="30%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="60%" stopColor="#f4f1e8" />
          <stop offset="100%" stopColor="#d6d2c4" />
        </radialGradient>
        <radialGradient id="blob-pink" cx="35%" cy="30%">
          <stop offset="0%" stopColor="#ffe4ea" />
          <stop offset="60%" stopColor="#ffc1d2" />
          <stop offset="100%" stopColor="#d99eb4" />
        </radialGradient>
        <radialGradient id="hero-blob-bg" cx="35%" cy="30%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#e7defd" stopOpacity="0.90" />
          <stop offset="100%" stopColor="#B8A8FF" stopOpacity="0.80" />
        </radialGradient>
        <radialGradient id="hero-blob-accent" cx="75%" cy="80%">
          <stop offset="0%" stopColor="#DFF26B" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#DFF26B" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

function Blob({ config }) {
  const { top, left, size, hue, opacity, blur, delay, rot, path } = config;
  const colors = HUE_MAP[hue];
  return (
    <div
      className="cf-blob"
      style={{
        top, left,
        width: `${size}px`,
        height: `${size}px`,
        opacity,
        filter: blur ? `blur(${blur}px)` : 'none',
        animationDelay: `${delay}s`,
        '--rot': `${rot}deg`,
      }}
    >
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <path d={BLOB_PATHS[path]} fill={colors.fill} stroke={colors.stroke} strokeWidth="0.5" />
      </svg>
    </div>
  );
}

export default function CategoryFloating({ categories }) {
  const [active, setActive] = useState(categories[0].id);
  const current = categories.find((c) => c.id === active);

  const ICONS = {
    salao: <IconSalao />,
    barbearia: <IconBarbearia />,
    estetica: <IconEstetica />,
    clinica: <IconClinica />,
    micro: <IconMicro />,
  };

  return (
    <div className="cf">
      <BlobDefs />

      {/* Center hero stage */}
      <div className="cf-stage">
        <div className="cf-hero" key={`hero-${current.id}`}>
          <svg className="cf-hero-blob" viewBox="0 0 200 200" aria-hidden="true">
            <ellipse cx="100" cy="100" rx="92" ry="98" fill="url(#hero-blob-bg)" />
            <ellipse cx="100" cy="100" rx="92" ry="98" fill="url(#hero-blob-accent)" />
          </svg>
          <div className="cf-hero-icon">{ICONS[current.id]}</div>
          <div className="cf-hero-label">
            <span className="cf-hero-label-n">0{categories.findIndex((c) => c.id === current.id) + 1}</span>
            <span>·</span>
            <span>{current.label}</span>
          </div>
        </div>

        {/* Floating info card to the right */}
        <div className="cf-info" key={`info-${current.id}`}>
          <div className="cf-info-meta">
            <span className="cf-info-meta-key">Categoria</span>
            <span className="cf-info-meta-val">{current.label}</span>
          </div>
          <h3 className="cf-info-title">{current.title}</h3>
          <p className="cf-info-desc">{current.desc}</p>
          <div className="cf-info-meta">
            <span className="cf-info-meta-key">Serviços</span>
            <span className="cf-info-meta-val">{current.services.length}</span>
          </div>
          <ul className="cf-info-services">
            {current.services.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Bottom navigation strip */}
      <div className="cf-nav">
        {categories.map((c, i) => (
          <button
            key={c.id}
            className={`cf-nav-item ${active === c.id ? 'active' : ''}`}
            onClick={() => setActive(c.id)}
          >
            <span className="cf-nav-n">0{i + 1}</span>
            <span className="cf-nav-label">{c.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
