import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Organic contemplative gradient — domain-warped blobs that breathe slowly.
const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform float u_time;
uniform vec2 u_res;
uniform vec2 u_mouse;

const vec3 PURPLE = vec3(0.722, 0.659, 1.000); // #B8A8FF
const vec3 LIME   = vec3(0.875, 0.949, 0.420); // #DFF26B
const vec3 CREAM  = vec3(0.965, 0.965, 0.949); // #f6f6f2
const vec3 SOFT   = vec3(0.937, 0.937, 0.945); // #efeff0
const vec3 BLUSH  = vec3(0.992, 0.929, 0.949); // soft pink accent

// 2D hash + value noise for warping
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i + vec2(0,0)), hash21(i + vec2(1,0)), u.x),
    mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), u.x),
    u.y
  );
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

float blob(vec2 uv, vec2 c, float r) {
  float d = distance(uv, c);
  return smoothstep(r, 0.0, d);
}

void main() {
  vec2 uv = v_uv;
  float aspect = u_res.x / u_res.y;
  uv.x *= aspect;

  // SLOW contemplative time — full cycle ~80s
  float t = u_time * 0.045;

  // Domain warping: distort space with low-freq noise for organic flow
  vec2 warp = vec2(
    fbm(uv * 1.2 + vec2(t * 0.6, 0.0)),
    fbm(uv * 1.2 + vec2(0.0, t * 0.6) + 10.7)
  );
  vec2 wuv = uv + (warp - 0.5) * 0.55;

  vec2 m = u_mouse;
  m.x *= aspect;

  // 5 large drifting blobs — long, slow paths
  vec2 c1 = vec2(0.45 * aspect + sin(t * 0.55) * 0.65, 0.30 + cos(t * 0.42) * 0.25);
  vec2 c2 = vec2(0.30 * aspect + cos(t * 0.38) * 0.70, 0.75 + sin(t * 0.46) * 0.22);
  vec2 c3 = vec2(0.85 * aspect + sin(t * 0.62) * 0.50, 0.55 + cos(t * 0.50) * 0.30);
  vec2 c4 = vec2(0.15 * aspect + cos(t * 0.48) * 0.40, 0.18 + sin(t * 0.58) * 0.20);
  vec2 c5 = vec2(0.65 * aspect + sin(t * 0.30) * 0.55, 0.90 + cos(t * 0.36) * 0.18);

  // Apply warping by sampling at warped uv
  float b1 = blob(wuv, c1, 0.70);
  float b2 = blob(wuv, c2, 0.62);
  float b3 = blob(wuv, c3, 0.58);
  float b4 = blob(wuv, c4, 0.48);
  float b5 = blob(wuv, c5, 0.55);
  float bm = blob(uv,  m,  0.36);

  // Soft vertical fade
  float topFade = smoothstep(0.0, 0.7, v_uv.y);

  vec3 col = mix(CREAM, SOFT, smoothstep(0.0, 1.0, v_uv.y));
  col = mix(col, BLUSH,  b5 * 0.32);
  col = mix(col, PURPLE, b1 * 0.46 * topFade);
  col = mix(col, LIME,   b2 * 0.32);
  col = mix(col, PURPLE, b3 * 0.38);
  col = mix(col, LIME,   b4 * 0.28 * topFade);
  col = mix(col, PURPLE, bm * 0.40);

  // Soft "breathing" pulse: very slow global brightness wobble
  col *= 0.97 + 0.03 * sin(t * 0.8);

  // Film grain
  float grain = fract(sin(dot(v_uv * u_res, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * 0.015;

  outColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

export default function ShaderMesh() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'low-power' });
    if (!gl) return; // graceful fallback — CSS background still shows

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('Program link error:', gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    // Fullscreen triangle (single triangle covers the viewport via clipping)
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a_pos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(a_pos);
    gl.vertexAttribPointer(a_pos, 2, gl.FLOAT, false, 0, 0);

    const u_time = gl.getUniformLocation(program, 'u_time');
    const u_res = gl.getUniformLocation(program, 'u_res');
    const u_mouse = gl.getUniformLocation(program, 'u_mouse');

    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1 : 1.5);

    const resize = () => {
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(u_res, w, h);
      }
    };

    let mouseX = 0.5;
    let mouseY = 0.35;
    let targetMX = 0.5;
    let targetMY = 0.35;

    const onMove = (e) => {
      targetMX = e.clientX / window.innerWidth;
      targetMY = e.clientY / window.innerHeight;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('resize', resize);
    resize();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let visible = true;
    const onVis = () => { visible = !document.hidden; if (visible && !raf) loop(performance.now()); };
    document.addEventListener('visibilitychange', onVis);

    const start = performance.now();
    function loop(now) {
      raf = 0;
      // smooth mouse
      mouseX += (targetMX - mouseX) * 0.06;
      mouseY += (targetMY - mouseY) * 0.06;
      const t = reduced ? 0 : (now - start) / 1000;
      gl.uniform1f(u_time, t);
      gl.uniform2f(u_mouse, mouseX, 1.0 - mouseY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (visible) raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
      ro.disconnect();
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return createPortal(
    <canvas ref={canvasRef} className="shader-mesh" aria-hidden="true" />,
    document.body
  );
}
