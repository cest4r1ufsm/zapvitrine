import { useEffect, useRef } from 'react';

export function Tilt({ children, max = 8, className = '', ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let rx = 0, ry = 0, tx = 0, ty = 0;
    let raf = 0;
    const apply = () => {
      raf = 0;
      rx += (tx - rx) * 0.12;
      ry += (ty - ry) * 0.12;
      node.style.transform = `perspective(1200px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      if (Math.abs(tx - rx) > 0.01 || Math.abs(ty - ry) > 0.01) raf = requestAnimationFrame(apply);
    };
    const onMove = (e) => {
      const r = node.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      ty = (x - 0.5) * 2 * max;
      tx = -(y - 0.5) * 2 * max;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      tx = 0; ty = 0;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerleave', onLeave);
    return () => {
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [max]);
  return (
    <div ref={ref} className={`tilt ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function Magnetic({ children, strength = 0.35, className = '', ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0;
    const apply = () => {
      raf = 0;
      cx += (tx - cx) * 0.18;
      cy += (ty - cy) * 0.18;
      node.style.transform = `translate3d(${cx.toFixed(2)}px, ${cy.toFixed(2)}px, 0)`;
      if (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) raf = requestAnimationFrame(apply);
    };
    const onMove = (e) => {
      const r = node.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      tx = dx * strength;
      ty = dy * strength;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      tx = 0; ty = 0;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    // Listen on a wider zone so the magnet engages before pointer enters
    const zone = node.parentElement || node;
    zone.addEventListener('pointermove', onMove);
    zone.addEventListener('pointerleave', onLeave);
    return () => {
      zone.removeEventListener('pointermove', onMove);
      zone.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [strength]);
  return (
    <span ref={ref} className={`magnetic ${className}`} {...rest}>
      {children}
    </span>
  );
}

export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector('.vectr-landing');
    if (!root || !('IntersectionObserver' in window)) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const sections = Array.from(root.querySelectorAll(':scope > section'));
    const navLinks = Array.from(root.querySelectorAll('.vl-nav-left a[href^="#"]'));

    sections.forEach((section) => section.classList.add('vl-motion-section'));

    const sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('is-entered');
      });
    }, { rootMargin: '0px 0px -14% 0px', threshold: 0.12 });

    const navTargets = navLinks
      .map((link) => ({ link, target: link.hash ? root.querySelector(link.hash) : null }))
      .filter(({ target }) => target);

    const navObserver = new IntersectionObserver((entries) => {
      const activeEntry = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!activeEntry) return;

      navTargets.forEach(({ link, target }) => {
        const isCurrent = target === activeEntry.target;
        link.classList.toggle('is-current', isCurrent);
        if (isCurrent) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }, { rootMargin: '-22% 0px -58% 0px', threshold: [0, 0.1, 0.35] });

    sections.forEach((section) => sectionObserver.observe(section));
    navTargets.forEach(({ target }) => navObserver.observe(target));

    const readyFrame = requestAnimationFrame(() => root.classList.add('motion-ready'));

    return () => {
      cancelAnimationFrame(readyFrame);
      sectionObserver.disconnect();
      navObserver.disconnect();
      root.classList.remove('motion-ready');
      sections.forEach((section) => section.classList.remove('vl-motion-section', 'is-entered'));
      navLinks.forEach((link) => {
        link.classList.remove('is-current');
        link.removeAttribute('aria-current');
      });
    };
  }, []);

  return null;
}

export function ScrollProgress() {
  const ref = useRef(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      node.style.transform = `scaleX(${p})`;
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    window.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return <div ref={ref} className="scroll-progress" style={{ transform: 'scaleX(0)' }} aria-hidden="true" />;
}
