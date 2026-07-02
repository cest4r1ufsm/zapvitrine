import { useEffect, useRef } from 'react';

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// Animated halftone dot field with a brighter beam crossing left→right.
// Color: brand lilac dots on cream bg.
const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform float u_time;
uniform vec2 u_res;

const vec3 BG     = vec3(0.965, 0.965, 0.949); // cream
const vec3 DOT    = vec3(0.722, 0.659, 1.000); // lilac #B8A8FF
const vec3 ACCENT = vec3(0.875, 0.949, 0.420); // lime #DFF26B

void main() {
  vec2 uv = v_uv;
  float aspect = u_res.x / u_res.y;
  vec2 p = uv * vec2(aspect, 1.0);

  // grid of dots
  float gridSize = 0.028;
  vec2 g = mod(p, gridSize) - gridSize * 0.5;
  float dist = length(g) / gridSize;

  // radial falloff from center for density
  vec2 c = vec2(0.5 * aspect, 0.5);
  float r = distance(p, c);
  float density = smoothstep(0.55, 0.10, r);

  // moving beam
  float t = u_time * 0.45;
  float beamX = -0.2 + mod(t, 1.6);
  float beam = smoothstep(0.18, 0.0, abs(p.x - beamX * aspect));

  float dotSize = mix(0.05, 0.32, density);
  dotSize += beam * 0.25;
  float dot_ = smoothstep(dotSize + 0.06, dotSize, dist);

  vec3 col = BG;
  vec3 dotCol = mix(DOT, ACCENT, beam * density);
  col = mix(col, dotCol, dot_ * (0.55 + density * 0.45));

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

export default function HalftoneScene({ className = '' }) {
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

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
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

    // only animate when visible in viewport
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
      const t = reduced ? 0 : (now - start) / 1000;
      gl.uniform1f(u_time, t);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (inView) raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buf);
    };
  }, []);

  return <canvas ref={canvasRef} className={`halftone-scene ${className}`} aria-hidden="true" />;
}
