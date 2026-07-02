import { useEffect, useRef, useState } from 'react';

export default function TrajectoryArc() {
  const ref = useRef(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            // animate progress 0→1
            const start = performance.now();
            const dur = 2200;
            let raf;
            const tick = (now) => {
              const t = Math.min((now - start) / dur, 1);
              const eased = 1 - Math.pow(1 - t, 3);
              setProgress(eased);
              if (t < 1) raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
          }
        });
      },
      { threshold: 0.3 }
    );
    io.observe(node);
    return () => io.disconnect();
  }, []);

  // curve: M 0 200 Q 600 -80 1200 200 (parabolic arc)
  const pathLen = 1450;
  const dashOffset = pathLen * (1 - progress);

  return (
    <svg
      ref={ref}
      className="trajectory-arc"
      viewBox="0 0 1200 240"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="trajGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#B8A8FF" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#B8A8FF" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#DFF26B" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      <path
        d="M 0 220 Q 600 -60 1200 220"
        fill="none"
        stroke="url(#trajGrad)"
        strokeWidth="2"
        strokeDasharray="4 8"
        style={{
          strokeDashoffset: dashOffset,
          transition: 'stroke-dashoffset 0.05s linear',
        }}
      />
      {/* Endpoint dots */}
      <circle cx="0" cy="220" r={progress > 0 ? 6 : 0} fill="#18181f" style={{ transition: 'r 0.4s' }} />
      <circle cx="1200" cy="220" r={progress > 0.98 ? 6 : 0} fill="#18181f" style={{ transition: 'r 0.4s' }} />
      {/* Apex marker */}
      <g
        transform={`translate(${progress * 1200}, ${220 - 280 * Math.sin(Math.PI * progress)})`}
        style={{ opacity: progress > 0 && progress < 0.98 ? 1 : 0, transition: 'opacity 0.2s' }}
      >
        <circle r="5" fill="#B8A8FF" />
        <circle r="14" fill="#B8A8FF" opacity="0.25" />
      </g>
    </svg>
  );
}
