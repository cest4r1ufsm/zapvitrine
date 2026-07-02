import { useEffect, useRef } from 'react';

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Raymarched isometric scene: a cluster of "agenda blocks" floating on a soft cream ground.
// Inspired by VECTR's micro-city but reframed as calendar tiles.
const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;

const vec3 BG_TOP = vec3(0.965, 0.965, 0.949); // cream
const vec3 BG_BOT = vec3(0.937, 0.937, 0.945);
const vec3 TILE_BASE = vec3(1.000, 1.000, 0.995);
const vec3 TILE_ACCENT = vec3(0.722, 0.659, 1.000); // lilac
const vec3 TILE_LIME = vec3(0.875, 0.949, 0.420);
const vec3 SHADOW = vec3(0.78, 0.78, 0.82);
const vec3 INK = vec3(0.094, 0.094, 0.125);

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdRound(vec3 p, vec3 b, float r) {
  return sdBox(p, b - vec3(r)) - r;
}

float sdGround(vec3 p) { return p.y + 0.6; }

// scene: 6 floating tile-like boxes arranged loosely
vec2 map(vec3 p) {
  float d = 1e9;
  float id = 0.0;

  // ground
  float g = sdGround(p);
  if (g < d) { d = g; id = 0.0; }

  // tile 1 — big center
  vec3 p1 = p - vec3(0.0, -0.05 + sin(u_time * 0.7) * 0.04, 0.0);
  float t1 = sdRound(p1, vec3(0.7, 0.18, 0.7), 0.05);
  if (t1 < d) { d = t1; id = 1.0; }

  // tile 2 — back-left tall
  vec3 p2 = p - vec3(-1.1, 0.15 + cos(u_time * 0.8 + 1.0) * 0.03, -0.9);
  float t2 = sdRound(p2, vec3(0.45, 0.45, 0.45), 0.04);
  if (t2 < d) { d = t2; id = 2.0; }

  // tile 3 — right-front small
  vec3 p3 = p - vec3(1.2, 0.0 + sin(u_time * 0.6 + 2.0) * 0.05, 0.3);
  float t3 = sdRound(p3, vec3(0.5, 0.15, 0.55), 0.05);
  if (t3 < d) { d = t3; id = 3.0; }

  // tile 4 — back-right
  vec3 p4 = p - vec3(1.3, 0.35 + cos(u_time * 0.9 + 0.5) * 0.04, -1.1);
  float t4 = sdRound(p4, vec3(0.32, 0.3, 0.32), 0.04);
  if (t4 < d) { d = t4; id = 4.0; }

  // tile 5 — front-left tiny
  vec3 p5 = p - vec3(-0.9, -0.1 + sin(u_time * 1.1 + 3.0) * 0.05, 0.7);
  float t5 = sdRound(p5, vec3(0.28, 0.1, 0.32), 0.03);
  if (t5 < d) { d = t5; id = 5.0; }

  // tile 6 — accent floating up
  vec3 p6 = p - vec3(-0.25, 0.6 + sin(u_time * 0.5 + 4.0) * 0.08, -0.3);
  float t6 = sdRound(p6, vec3(0.18, 0.06, 0.18), 0.025);
  if (t6 < d) { d = t6; id = 6.0; }

  return vec2(d, id);
}

vec3 calcNormal(vec3 p) {
  const float e = 0.0008;
  return normalize(vec3(
    map(p + vec3(e, 0, 0)).x - map(p - vec3(e, 0, 0)).x,
    map(p + vec3(0, e, 0)).x - map(p - vec3(0, e, 0)).x,
    map(p + vec3(0, 0, e)).x - map(p - vec3(0, 0, e)).x
  ));
}

float softShadow(vec3 ro, vec3 rd, float k) {
  float res = 1.0;
  float t = 0.02;
  for (int i = 0; i < 24; i++) {
    float h = map(ro + rd * t).x;
    res = min(res, k * h / t);
    t += clamp(h, 0.02, 0.1);
    if (res < 0.02 || t > 4.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

vec3 tileColor(float id) {
  if (id < 0.5) return TILE_BASE; // ground - unused, handled separately
  if (id < 1.5) return TILE_BASE;
  if (id < 2.5) return mix(TILE_BASE, TILE_ACCENT, 0.06);
  if (id < 3.5) return TILE_BASE;
  if (id < 4.5) return mix(TILE_BASE, TILE_LIME, 0.35);
  if (id < 5.5) return TILE_BASE;
  return mix(TILE_BASE, TILE_ACCENT, 0.20);
}

void main() {
  vec2 uv = (v_uv * 2.0 - 1.0);
  uv.x *= u_res.x / u_res.y;

  // isometric camera
  float camRotY = 0.55 + (u_mouse.x - 0.5) * 0.15;
  float camPitch = 0.55;
  float dist = 4.0;
  vec3 ro = vec3(sin(camRotY) * dist, 1.8 + (u_mouse.y - 0.5) * 0.3, cos(camRotY) * dist);
  vec3 target = vec3(0.0, 0.1, 0.0);
  vec3 ww = normalize(target - ro);
  vec3 uu = normalize(cross(ww, vec3(0, 1, 0)));
  vec3 vv = cross(uu, ww);
  vec3 rd = normalize(uv.x * uu + uv.y * vv + 1.6 * ww);

  // raymarch
  float t = 0.0;
  float id = 0.0;
  bool hit = false;
  for (int i = 0; i < 80; i++) {
    vec3 p = ro + rd * t;
    vec2 m = map(p);
    if (m.x < 0.001) { id = m.y; hit = true; break; }
    t += m.x;
    if (t > 12.0) break;
  }

  vec3 col = mix(BG_BOT, BG_TOP, smoothstep(-0.2, 1.0, v_uv.y));
  // subtle radial vignette toward edges
  float v = smoothstep(1.2, 0.3, length(uv * vec2(1.0, 1.3)));
  col *= mix(0.94, 1.0, v);

  if (hit) {
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    vec3 lightDir = normalize(vec3(0.5, 1.2, 0.4));
    float diff = max(dot(n, lightDir), 0.0);
    float sh = softShadow(p + n * 0.01, lightDir, 16.0);
    float fres = pow(1.0 - max(dot(n, -rd), 0.0), 2.0);

    vec3 base;
    if (id < 0.5) {
      // ground — soft dot pattern
      vec2 gp = p.xz * 1.8;
      vec2 cell = fract(gp) - 0.5;
      float dot_ = smoothstep(0.20, 0.10, length(cell));
      base = mix(BG_TOP, mix(BG_TOP, TILE_ACCENT, 0.12), dot_);
    } else {
      base = tileColor(id);
    }
    vec3 ambient = base * 0.6;
    vec3 lit = base * (0.45 + diff * 0.55 * sh);
    col = mix(ambient, lit, 0.85);
    col = mix(col, vec3(1.0), fres * 0.08);
  }

  // top edge gentle fade-in
  col = mix(col, BG_TOP, smoothstep(0.85, 1.05, v_uv.y));

  // film grain
  float grain = fract(sin(dot(v_uv * u_res, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * 0.013;

  outColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

export default function HeroScene3D({ className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const gl = canvas.getContext('webgl2', { alpha: true, antialias: false, powerPreference: 'low-power' });
    if (!gl) return;

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

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
    const dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 0.85 : 1.25);

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
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    let mouseX = 0.5, mouseY = 0.5, tx = 0.5, ty = 0.5;
    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width;
      ty = (e.clientY - r.top) / r.height;
    };
    canvas.addEventListener('pointermove', onMove);

    let inView = false;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        inView = e.isIntersecting;
        if (inView && !raf) raf = requestAnimationFrame(loop);
      });
    }, { threshold: 0.05 });
    io.observe(canvas);

    let raf = 0;
    const start = performance.now();
    function loop(now) {
      raf = 0;
      mouseX += (tx - mouseX) * 0.05;
      mouseY += (ty - mouseY) * 0.05;
      const t = reduced ? 0 : (now - start) / 1000;
      gl.uniform1f(u_time, t);
      gl.uniform2f(u_mouse, mouseX, 1.0 - mouseY);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (inView) raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointermove', onMove);
      ro.disconnect();
      io.disconnect();
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return <canvas ref={canvasRef} className={`hero-scene-3d ${className}`} aria-hidden="true" />;
}
