// Hero "RIDE OUT": carrusel WebGL de motocicletas. Conserva el comportamiento
// del diseño original (geometría por tiers, un único valor de progreso que
// mueve posición, escala, subida, desenfoque, sombra y color de fondo; autoplay,
// flechas con cola, arrastre que se une a la curva, carga escalonada).
// Las motos salen de la base de datos (motocicletas destacadas).
import { SHEET_URL, SHEET_PNG } from './core.js';

const SIDE = 740 / 1240;
const TEX_W = 2048, TEX_H = 1024;
const T_BIKE_L = 134, T_BIKE_W = 1780, T_GROUND = 960;
const T_CY = T_GROUND - (628 - 427) * T_BIKE_W / 762;
const DUR = 1400, HOLD = 2000;
const LETTERS = [['R', 22.5, 185], ['I', 214.5, 245.5], ['D', 282.5, 464], ['E', 495, 640],
                 ['O', 760, 978], ['U', 1010, 1187], ['T', 1212, 1379.5]];
const BG_ROWS = [0, 70, 120, 200, 248, 300, 380, 450, 530, 610, 700, 810];
const BG_AMT = [-0.34, -0.26, -0.20, -0.08, 0, 0.08, 0.21, 0.36, 0.53, 0.66, 0.755, 0.82];

// Lámina original: recortes y marcas a borrar (píxeles de una lámina de 3840 px)
export const SHEET = [
  { rgb: [0x78, 0x29, 0x56], box: [92, 122, 1749, 992], marks: [[1041, 265.5, 1120, 294.5, 7.5], [1053, 255, 1109, 275.5, 3.6]] },
  { rgb: [0x03, 0x38, 0x78], box: [1972, 121, 3636, 996], marks: [[2921, 266, 3002, 294.5, 7.5], [2940, 257.5, 2984, 275, 3.6]] },
  { rgb: [0x59, 0x34, 0x29], box: [91, 1113, 1748, 1992], marks: [[1035, 1258.5, 1118, 1288.5, 7.5], [1058, 1249.5, 1114, 1271.5, 3.6]] },
  { rgb: [0x5b, 0x44, 0xa7], box: [1970, 1111, 3636, 1991], marks: [[2921, 1260.5, 3002, 1289, 7.5], [2939, 1252, 2995, 1272.5, 3.6]] },
];

/* ---------- easing ---------- */
const bez = (p1, p2) => (t) => { const m = 1 - t; return 3 * m * m * t * p1 + 3 * m * t * t * p2 + t * t * t; };
const bx = bez(0.51, 0), by = bez(0, 0.98);
function solve(f, v) { let lo = 0, hi = 1; for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (f(mid) < v) lo = mid; else hi = mid; } return (lo + hi) / 2; }
const ease = (x) => x <= 0 ? 0 : x >= 1 ? 1 : by(solve(bx, x));
const invEase = (y) => y <= 0 ? 0 : y >= 1 ? 1 : bx(solve(by, y));

/* ---------- texturas ---------- */
function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}
function bilinear(src, w, h, x, y, out, k) {
  x -= 0.5; y -= 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const cx = (v) => v < 0 ? 0 : v >= w ? w - 1 : v, cy = (v) => v < 0 ? 0 : v >= h ? h - 1 : v;
  const xa = cx(x0), xb = cx(x0 + 1), ya = cy(y0), yb = cy(y0 + 1);
  for (let c = 0; c < 3; c++) {
    const p00 = src[(ya * w + xa) * 4 + c], p10 = src[(ya * w + xb) * 4 + c];
    const p01 = src[(yb * w + xa) * 4 + c], p11 = src[(yb * w + xb) * 4 + c];
    out[c] += k * ((p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy);
  }
}
function paintMark(data, w, h, x0, y0, x1, y1, half) {
  const src = new Uint8ClampedArray(data);
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - 18)), maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1) + 18));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - 18)), maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1) + 18));
  const up = [0, 0, 0], lo = [0, 0, 0], off = half + 2;
  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const rx = px + 0.5 - x0, ry = py + 0.5 - y0;
      const along = rx * ux + ry * uy, n = rx * nx + ry * ny;
      const out = Math.max(-3 - along, along - len - 3, 0);
      const wgt = Math.min(1, Math.max(0, (half + 1.5 - Math.abs(n)) / 2.5)) * Math.max(0, 1 - out / 4);
      if (wgt <= 0) continue;
      const cxp = x0 + ux * along, cyp = y0 + uy * along;
      up[0] = up[1] = up[2] = lo[0] = lo[1] = lo[2] = 0;
      for (const a of [-3, 0, 3]) {
        bilinear(src, w, h, cxp - nx * off + ux * a, cyp - ny * off + uy * a, up, 1 / 3);
        bilinear(src, w, h, cxp + nx * off + ux * a, cyp + ny * off + uy * a, lo, 1 / 3);
      }
      const m = Math.min(1, Math.max(0, (n + half) / (2 * half)));
      const i = (py * w + px) * 4;
      for (let c = 0; c < 3; c++) data[i + c] = data[i + c] * (1 - wgt) + (up[c] + (lo[c] - up[c]) * m) * wgt;
    }
  }
}
function shadow(ctx, cx, cy, rx, ry, A) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(10,7,10,${A})`); g.addColorStop(0.45, `rgba(10,7,10,${0.55 * A})`); g.addColorStop(1, 'rgba(10,7,10,0)');
  ctx.fillStyle = g; ctx.fillRect(-rx, -rx, rx * 2, rx * 2); ctx.restore();
}
function solidify(d) { for (let i = 3; i < d.length; i += 4) { const a = d[i]; d[i] = a < 8 ? 0 : Math.min(255, (a - 6) * 255 / 236); } }
function compose(cut) {
  const tex = document.createElement('canvas');
  tex.width = TEX_W; tex.height = TEX_H;
  const tc = tex.getContext('2d');
  shadow(tc, 1024, 954, 1010, 58, 0.30);
  shadow(tc, 1024, 956, 720, 34, 0.26);
  // Ancho fijo como en la lámina original; si la moto es más alta en proporción
  // (espejos, parabrisas), se ajusta por altura para que no se salga del lienzo.
  // Las motos de la lámina (proporción ~0.525) quedan exactamente igual.
  const MAX_H = 935;
  const k = Math.min(T_BIKE_W / cut.width, MAX_H / cut.height);
  const dw = cut.width * k, dh = cut.height * k, dx = 1024 - dw / 2;
  shadow(tc, dx + 0.158 * dw, 957, 300 * dw / T_BIKE_W, 26, 0.85);
  shadow(tc, dx + 0.843 * dw, 957, 300 * dw / T_BIKE_W, 26, 0.85);
  tc.imageSmoothingEnabled = true; tc.imageSmoothingQuality = 'high';
  tc.drawImage(cut, dx, T_GROUND - dh, dw, dh);
  return tex;
}
function textureFromSheet(img, n) {
  const sl = SHEET[n], sc = img.naturalWidth / 3840;
  const [l, t, r, b] = sl.box.map((v) => v * sc);
  const w = Math.round(r - l), h = Math.round(b - t);
  const cut = document.createElement('canvas'); cut.width = w; cut.height = h;
  const cx = cut.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, l, t, w, h, 0, 0, w, h);
  const id = cx.getImageData(0, 0, w, h);
  solidify(id.data);
  for (const [a, bq, c, d, half] of sl.marks) paintMark(id.data, w, h, a * sc - l, bq * sc - t, c * sc - l, d * sc - t, half * sc);
  cx.putImageData(id, 0, 0);
  return compose(cut);
}
// Imagen subida desde el panel: PNG/WebP transparente de perfil lateral. Se recorta al contenido.
function textureFromImage(img) {
  const k = Math.min(1, 2400 / img.naturalWidth);
  const W = Math.round(img.naturalWidth * k), H = Math.round(img.naturalHeight * k);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const cx = c.getContext('2d', { willReadFrequently: true });
  cx.drawImage(img, 0, 0, W, H);
  const d = cx.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (d[(y * W + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const cut = document.createElement('canvas'); cut.width = w; cut.height = h;
  const cc = cut.getContext('2d', { willReadFrequently: true });
  cc.drawImage(c, x0, y0, w, h, 0, 0, w, h);
  const id = cc.getImageData(0, 0, w, h); solidify(id.data); cc.putImageData(id, 0, 0);
  return compose(cut);
}

/* ---------- shaders ---------- */
const VS = `attribute vec2 aP;uniform vec4 uR;uniform vec4 uT;uniform vec2 uS;varying vec2 vT;
void main(){vec2 p=uR.xy+aP*uR.zw;vT=mix(uT.xy,uT.zw,aP);gl_Position=vec4(p.x/uS.x*2.0-1.0,1.0-p.y/uS.y*2.0,0.0,1.0);}`;
const FS = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uX;uniform vec2 uD;uniform float uB;uniform float uBl;varying vec2 vT;
void main(){if(uBl<0.5){gl_FragColor=texture2D(uX,vT,uB);return;}
vec4 s=vec4(0.0);float ws=0.0;
for(int i=0;i<28;i++){float f=float(i)+0.5;float r=sqrt(f/28.0);float a=f*2.399963;float w=exp(-2.0*r*r);
s+=texture2D(uX,vT+vec2(cos(a),sin(a))*r*uD,uB)*w;ws+=w;}
gl_FragColor=s/ws;}`;

/**
 * @param {object} o
 * @param {Promise<Array<{rgb:number[], image:string}>>} o.slides  motos (image = 'sheet:N' o URL)
 * @param {(i:number, slide:object)=>void} [o.onSlide] se llama cuando cambia la moto central
 * @param {(i:number)=>void} [o.onUserChange] cambio iniciado por el visitante (para anunciar)
 */
export function createHero(o = {}) {
  const hero = document.getElementById('hero');
  const dots = document.getElementById('dots');
  const word = document.getElementById('word');
  const wordSvg = document.getElementById('wordSvg');
  const canvas = document.getElementById('bikes');
  const drag = document.getElementById('drag');
  const prevBtn = document.getElementById('prev');
  const nextBtn = document.getElementById('next');
  const specs = document.getElementById('specs');
  const header = hero.querySelector('.nav');
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = mqReduce.matches;

  let SLIDES = SHEET.map((s, i) => ({ rgb: s.rgb, image: 'sheet:' + i }));
  let N = SLIDES.length;
  let texCanvases = null;
  let R = null;
  let wordText = 'RIDE OUT';

  /* ---------- geometría ---------- */
  const G = { W: 1, H: 1, dpr: 1, wordX: 0, wordTop: 0, wordW: 1357, capH: 198.5, bikeCX: 0, bikeCY: 0, bikeW: 762, ground: 0, step: 776, ax: [0, 0], ay: 0, d: 36 };
  function layout() {
    const W = hero.clientWidth, H = hero.clientHeight;
    if (!W || !H) return;
    const tier = W / H < 1.2 ? 'tall' : (H <= 500 || W < 900) ? 'short' : 'wide';
    const cls = hero.classList;
    cls.toggle('wide', tier === 'wide'); cls.toggle('short', tier === 'short'); cls.toggle('tall', tier === 'tall');
    cls.toggle('cols-3', (tier === 'tall' && W >= 560) || (tier === 'short' && W < 840));
    cls.toggle('narrow', tier === 'tall' && W < 360);
    cls.toggle('roomy', tier === 'tall' && W < 560 && H >= 720);
    const tablet = tier === 'tall' && W >= 580 && H >= 900;
    cls.toggle('tablet', tablet);
    hero.style.setProperty('--u', (tier === 'wide' ? Math.min(W / 1440, H / 810) : 1) + 'px');
    const panelTop = specs.offsetTop;
    G.W = W; G.H = H;
    if (tier === 'tall') {
      const navBottom = tablet ? 84 : 58, band = panelTop - navBottom;
      const wordK = (W - 14) / 1357, bikeW = 0.92 * W;
      const overlap = 0.34 * 198.5 * wordK, bikeH = 0.527 * bikeW;
      const d = tablet ? 54 : H >= 720 ? 44 : 38, gap = 12 + d;
      const k = Math.min(1, (band - 16 - gap) / (overlap + bikeH));
      const top = navBottom + (band - (overlap + bikeH) * k - gap) / 2;
      G.wordW = 1357 * wordK * k; G.capH = 198.5 * wordK * k; G.wordX = (W - G.wordW) / 2; G.wordTop = top;
      G.bikeW = bikeW * k; G.bikeCX = W / 2; G.bikeCY = top + overlap * k + bikeH * k / 2;
      G.ground = top + (overlap + bikeH) * k;
      G.step = W / 2 - 0.022 * W + (bikeW * k * SIDE) / 2;
      G.d = d; G.ax = [W / 2 - 0.85 * d, W / 2 + 0.85 * d]; G.ay = G.ground + 12 + d / 2;
    } else {
      let u, ox, oy;
      if (tier === 'wide') {
        u = Math.min(W / 1440, H / 810); ox = W / 2 - 720 * u; oy = (H - 810 * u) * 0.5;
        const room = panelTop - 8 - (oy + 628 * u); if (room < 0) oy += room;
      } else {
        const band = panelTop - 46;
        u = Math.min(W / 1440, (band - 10) / 478); ox = W / 2 - 720 * u; oy = 46 + (band - 478 * u) / 2 - 150 * u;
      }
      const X = (x) => ox + x * u, Y = (y) => oy + y * u;
      G.wordX = X(22.5); G.wordTop = Y(159); G.wordW = 1357 * u; G.capH = 198.5 * u;
      G.bikeCX = X(710); G.bikeCY = Y(427); G.bikeW = 762 * u; G.ground = Y(628); G.step = 776 * u;
      G.d = Math.max(28, 36 * u); G.ax = [X(229), X(1197.5)]; G.ay = Y(433);
    }
    Object.assign(word.style, { left: G.wordX + 'px', top: G.wordTop + 'px', width: G.wordW + 'px', height: G.capH + 'px' });
    [prevBtn, nextBtn].forEach((b, i) => Object.assign(b.style, { left: G.ax[i] + 'px', top: G.ay + 'px', width: G.d + 'px', height: G.d + 'px' }));
    const s = G.bikeW / 762, tw = Math.max(22, 45.4 * s), th = Math.max(20, 41 * s);
    dots.style.height = (G.wordTop + 0.75 * G.capH) + 'px';
    dots.style.backgroundSize = tw + 'px ' + th + 'px';
    dots.style.backgroundPosition = ((((W / 2 - tw / 2) % tw) + tw) % tw) + 'px ' + (31 * s - th / 2) + 'px';
    G.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = Math.round(W * G.dpr), ch = Math.round(H * G.dpr);
    if (canvas.width !== cw) canvas.width = cw;
    if (canvas.height !== ch) canvas.height = ch;
    lastBg = '';
    draw();
  }

  /* ---------- palabra ---------- */
  function fitWord() {
    const NS = 'http://www.w3.org/2000/svg';
    const c = document.createElement('canvas').getContext('2d');
    c.font = '450 100px "Albert Sans"';
    const asc = c.measureText('T').actualBoundingBoxAscent || c.measureText('H').actualBoundingBoxAscent;
    if (!asc) return;
    const size = 100 * 198.5 / asc;
    c.font = `450 ${size}px "Albert Sans"`;
    const frag = document.createDocumentFragment();
    if (wordText === 'RIDE OUT') {
      for (const [ch, left, right] of LETTERS) {
        const m = c.measureText(ch);
        const sx = (right - left) / (m.actualBoundingBoxLeft + m.actualBoundingBoxRight);
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('font-size', size);
        t.setAttribute('transform', `translate(${left - 22.5 + m.actualBoundingBoxLeft * sx} 198.5) scale(${sx} 1)`);
        t.textContent = ch; frag.appendChild(t);
      }
    } else {
      // Texto personalizado desde el panel: se estira para llenar la misma caja.
      const m = c.measureText(wordText);
      const sx = 1357 / (m.actualBoundingBoxLeft + m.actualBoundingBoxRight);
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('font-size', size);
      t.setAttribute('transform', `translate(${m.actualBoundingBoxLeft * sx} 198.5) scale(${sx} 1)`);
      t.textContent = wordText; frag.appendChild(t);
    }
    wordSvg.replaceChildren(frag);
  }

  /* ---------- fondo ---------- */
  let lastBg = '';
  const slideOf = (i) => ((i % N) + N) % N;
  function currentColour(p) {
    const f = Math.floor(p), fr = p - f, a = SLIDES[slideOf(f)].rgb, b = SLIDES[slideOf(f + 1)].rgb;
    return [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * fr);
  }
  function rowToPx(r) {
    const A = [[0, 0], [159, G.wordTop], [628, G.ground], [810, G.H]];
    let y = G.H;
    for (let i = 0; i < 3; i++) if (r <= A[i + 1][0]) { const [r0, y0] = A[i], [r1, y1] = A[i + 1]; y = y0 + (y1 - y0) * (r - r0) / (r1 - r0); break; }
    return Math.min(G.H, Math.max(0, y));
  }
  function paintBackground(p) {
    const c = currentColour(p);
    const stops = BG_ROWS.map((row, i) => {
      const t = BG_AMT[i];
      const ch = c.map((v) => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t));
      return `rgb(${ch[0]},${ch[1]},${ch[2]}) ${rowToPx(row).toFixed(2)}px`;
    });
    const bg = 'linear-gradient(to bottom,' + stops.join(',') + ')';
    if (bg !== lastBg) { hero.style.background = bg; lastBg = bg; }
  }

  /* ---------- renderer ---------- */
  function initGL() {
    const opts = { alpha: true, premultipliedAlpha: true, antialias: false };
    const gl = canvas.getContext('webgl', opts) || canvas.getContext('experimental-webgl', opts);
    if (!gl || gl.isContextLost()) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const aP = gl.getAttribLocation(prog, 'aP');
    gl.enableVertexAttribArray(aP); gl.vertexAttribPointer(aP, 2, gl.FLOAT, false, 0, 0);
    const U = {};
    ['uR', 'uT', 'uS', 'uX', 'uD', 'uB', 'uBl'].forEach((n) => U[n] = gl.getUniformLocation(prog, n));
    gl.uniform1i(U.uX, 0);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    const textures = texCanvases.map((c) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(4, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1));
      return t;
    });
    return { kind: 'gl', gl, U, textures };
  }
  function startRenderer() {
    if (!texCanvases || !texCanvases.length) return;
    let r = null;
    try { r = initGL(); } catch (e) { r = null; }
    if (!r) { const ctx = canvas.getContext('2d'); r = ctx ? { kind: '2d', ctx } : null; }
    R = r;
    draw();
    if (R && settled()) scheduleAutoplay(revealed ? HOLD : null);
  }
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R = null; clearAutoplay(); });
  canvas.addEventListener('webglcontextrestored', () => { try { R = initGL(); } catch { R = null; } draw(); if (R && settled()) scheduleAutoplay(HOLD); });

  /* ---------- estado del carrusel ---------- */
  let pos = 0, anim = null, queued = 0, rafId = 0, lastIdx = -1;
  const settled = () => !anim && activePointer === null;

  function draw() {
    paintBackground(pos);
    const idx = slideOf(Math.round(pos));
    if (idx !== lastIdx) { lastIdx = idx; o.onSlide?.(idx, SLIDES[idx]); }
    if (!R) return;
    const { W, H, dpr, bikeW, bikeCX, bikeCY, step } = G;
    const reach = Math.ceil((W / 2 + 0.4 * bikeW) / step) + 1;
    const base = Math.round(pos), quads = [];
    for (let i = base - reach; i <= base + reach; i++) {
      const off = i - pos, t = Math.min(1, Math.abs(off)), s = 1 + (SIDE - 1) * t;
      const cx = bikeCX + off * step, q = bikeW * s / T_BIKE_W, sigma = 4.5 * (bikeW / 762) * t;
      const left = cx - 1024 * q, top = bikeCY - T_CY * q, w = TEX_W * q, h = TEX_H * q;
      const grow = sigma > 0.06 ? 2.2 * sigma : 0;
      if (left - grow > W + 20 || left + w + grow < -20 || top - grow > H + 20 || top + h + grow < -20) continue;
      quads.push({ o: Math.abs(off), slide: slideOf(i), left, top, w, h, sigma });
    }
    quads.sort((a, b) => b.o - a.o);
    if (R.kind === 'gl') {
      const { gl, U, textures } = R;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(U.uS, W, H); gl.activeTexture(gl.TEXTURE0);
      for (const d of quads) {
        gl.bindTexture(gl.TEXTURE_2D, textures[d.slide]);
        if (d.sigma <= 0.06) {
          gl.uniform1f(U.uBl, 0); gl.uniform1f(U.uB, -0.35);
          gl.uniform4f(U.uR, d.left, d.top, d.w, d.h); gl.uniform4f(U.uT, 0, 0, 1, 1);
        } else {
          const g = 2.2 * d.sigma, gu = g / d.w, gv = g / d.h;
          gl.uniform1f(U.uBl, 1); gl.uniform1f(U.uB, Math.log2(Math.max(1, d.sigma * dpr * 0.55)));
          gl.uniform4f(U.uR, d.left - g, d.top - g, d.w + 2 * g, d.h + 2 * g);
          gl.uniform4f(U.uT, -gu, -gv, 1 + gu, 1 + gv);
          gl.uniform2f(U.uD, 2 * d.sigma / d.w, 2 * d.sigma / d.h);
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    } else {
      const ctx = R.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      for (const d of quads) { ctx.filter = d.sigma > 0.06 ? `blur(${d.sigma * dpr}px)` : 'none'; ctx.drawImage(texCanvases[d.slide], d.left, d.top, d.w, d.h); }
      ctx.filter = 'none';
    }
  }
  const requestDraw = () => { if (!rafId) rafId = requestAnimationFrame(frame); };
  function frame(now) {
    rafId = 0;
    if (anim) {
      const x = Math.min(1, Math.max(0, (now - anim.start) / DUR));
      pos = anim.from + (anim.to - anim.from) * ease(x);
      if (x >= 1) { pos = anim.to; anim = null; draw(); onSettle(); return; }
      draw(); rafId = requestAnimationFrame(frame);
    } else draw();
  }
  function onSettle() {
    pos = Math.round(pos);
    if (queued) { const d = queued; queued = 0; go(d, true); return; }
    scheduleAutoplay(HOLD);
  }
  function go(dir, user) {
    if (activePointer !== null) return;
    if (anim) { if (user) queued = dir; return; }
    clearAutoplay();
    const from = Math.round(pos), to = from + dir;
    if (user) o.onUserChange?.(SLIDES[slideOf(to)]);
    if (reduced) { pos = to; requestDraw(); onSettle(); return; }
    anim = { from, to, start: performance.now() }; requestDraw();
  }
  function joinCurve(target) {
    const diff = target - pos, remaining = Math.min(1, Math.abs(diff));
    if (remaining < 1e-6 || reduced) { pos = target; requestDraw(); onSettle(); return; }
    const dir = Math.sign(diff);
    anim = { from: target - dir, to: target, start: performance.now() - invEase(1 - remaining) * DUR };
    requestDraw();
  }

  /* ---------- autoplay ---------- */
  let autoTimer = 0, focusPause = false, revealed = false, offscreen = false;
  const canAutoplay = () => !reduced && !!R && !document.hidden && activePointer === null && !focusPause && !offscreen && N > 1;
  const clearAutoplay = () => { if (autoTimer) { clearTimeout(autoTimer); autoTimer = 0; } };
  function scheduleAutoplay(delay) {
    clearAutoplay();
    if (delay == null || !revealed || !settled() || !canAutoplay()) return;
    autoTimer = setTimeout(() => { autoTimer = 0; if (canAutoplay() && settled()) go(1, false); }, delay);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearAutoplay(); else if (settled()) scheduleAutoplay(HOLD); });
  const onReduce = () => { reduced = mqReduce.matches; if (reduced) clearAutoplay(); else if (settled()) scheduleAutoplay(HOLD); };
  mqReduce.addEventListener ? mqReduce.addEventListener('change', onReduce) : mqReduce.addListener(onReduce);
  const isFV = (el) => { try { return !!el && el.matches(':focus-visible'); } catch { return false; } };
  hero.addEventListener('focusin', (e) => { if (/^(BUTTON|A)$/.test(e.target.tagName) && isFV(e.target)) { focusPause = true; clearAutoplay(); } });
  hero.addEventListener('focusout', () => setTimeout(() => {
    const a = document.activeElement, was = focusPause;
    focusPause = !!a && hero.contains(a) && /^(BUTTON|A)$/.test(a.tagName) && isFV(a);
    if (was && !focusPause && settled()) scheduleAutoplay(HOLD);
  }, 0));
  // Pausa cuando el hero sale de pantalla (el visitante baja al catálogo) o se oculta
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([en]) => {
      offscreen = !en.isIntersecting;
      if (offscreen) clearAutoplay(); else if (settled()) scheduleAutoplay(HOLD);
    }, { threshold: 0.25 }).observe(hero);
  }

  prevBtn.addEventListener('click', () => go(-1, true));
  nextBtn.addEventListener('click', () => go(1, true));

  /* ---------- arrastre ---------- */
  let activePointer = null, dragging = false, decided = false;
  let startX = 0, startY = 0, startPos = 0, startSlide = 0, resumeTarget = null, trail = [];
  drag.addEventListener('pointerdown', (e) => {
    if (activePointer !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
    activePointer = e.pointerId;
    resumeTarget = anim ? anim.to : null; anim = null; queued = 0; clearAutoplay();
    try { drag.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
    dragging = false; decided = false;
    startX = e.clientX; startY = e.clientY; startPos = pos;
    startSlide = slideOf(resumeTarget !== null ? resumeTarget : Math.round(pos));
    trail = [{ x: e.clientX, t: e.timeStamp }];
  });
  drag.addEventListener('pointermove', (e) => {
    if (e.pointerId !== activePointer) return;
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!dragging) {
      if (decided || Math.hypot(dx, dy) < 5) return;
      decided = true;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      dragging = true; drag.classList.add('dragging');
    }
    if (e.cancelable) e.preventDefault();
    const now = e.timeStamp;
    trail.push({ x: e.clientX, t: now });
    while (trail.length > 2 && now - trail[0].t > 90) trail.shift();
    pos = startPos - dx / G.step; requestDraw();
  });
  function release(e, cancelled) {
    if (e.pointerId !== activePointer) return;
    activePointer = null;
    try { if (drag.hasPointerCapture(e.pointerId)) drag.releasePointerCapture(e.pointerId); } catch { /* nada */ }
    drag.classList.remove('dragging');
    if (dragging) {
      dragging = false;
      const now = e.timeStamp, last = trail[trail.length - 1];
      let v = 0;
      if (now - last.t < 90) { const first = trail.find((p) => last.t - p.t <= 90) || trail[0]; const dt = last.t - first.t; if (dt > 0) v = (last.x - first.x) / dt; }
      let target = Math.round(pos);
      if (Math.abs(v) > 0.45 && !cancelled) target = v < 0 ? Math.ceil(pos) : Math.floor(pos);
      if (slideOf(target) !== startSlide) o.onUserChange?.(SLIDES[slideOf(target)]);
      joinCurve(target);
    } else joinCurve(resumeTarget !== null ? resumeTarget : Math.round(pos));
    resumeTarget = null;
  }
  drag.addEventListener('pointerup', (e) => release(e, false));
  drag.addEventListener('pointercancel', (e) => release(e, true));
  drag.addEventListener('lostpointercapture', (e) => release(e, false));

  /* ---------- carga ---------- */
  function reveal() {
    if (revealed) return;
    revealed = true;
    requestAnimationFrame(() => {
      hero.classList.remove('pending');
      if (!reduced && Element.prototype.animate) {
        const kf = [{ opacity: 0, translate: '0 16px' }, { opacity: 1, translate: '0 0' }];
        const play = (el, delay) => el && el.animate(kf, { duration: 850, easing: 'cubic-bezier(.22,1,.36,1)', delay, fill: 'backwards' });
        play(word, 0); play(canvas, 60); play(header, 120); play(prevBtn, 150); play(nextBtn, 150); play(specs, 150);
      }
      if (settled()) scheduleAutoplay(1000 + HOLD);
    });
  }
  new ResizeObserver(() => layout()).observe(hero);
  layout();

  const fontP = document.fonts?.load ? document.fonts.load('450 100px "Albert Sans"').then((f) => { if (f && f.length) { fitWord(); layout(); } }) : Promise.resolve();

  const texP = Promise.resolve(o.slides).catch(() => null).then(async (list) => {
    if (Array.isArray(list) && list.length) { SLIDES = list; N = list.length; lastIdx = -1; lastBg = ''; draw(); }
    let sheetP = null;
    const sheet = () => sheetP || (sheetP = loadImage(SHEET_URL).catch(() => loadImage(SHEET_PNG)));
    const built = await Promise.all(SLIDES.map(async (s) => {
      try {
        const m = /^sheet:([0-3])$/.exec(s.image || '');
        if (m) return textureFromSheet(await sheet(), +m[1]);
        return textureFromImage(await loadImage(s.image));
      } catch (e) { console.warn('hero image', s.image, e); return null; }
    }));
    // descarta motos cuya imagen no cargó (manteniendo colores y orden)
    const keep = built.map((t, i) => t ? i : -1).filter((i) => i >= 0);
    if (!keep.length) return;
    if (keep.length !== SLIDES.length) { SLIDES = keep.map((i) => SLIDES[i]); N = SLIDES.length; lastIdx = -1; }
    texCanvases = keep.map((i) => built[i]);
    startRenderer();
  });

  Promise.allSettled([fontP, texP]).then(reveal);
  setTimeout(reveal, 6000);

  return {
    next: () => go(1, true),
    prev: () => go(-1, true),
    current: () => slideOf(Math.round(pos)),
    slides: () => SLIDES,
    setWord(w) { const t = String(w || '').trim().toUpperCase().slice(0, 14); if (t && t !== wordText) { wordText = t; $word(); } },
  };
  function $word() { document.fonts?.ready.then(fitWord); wordSvg.querySelector('text') && (wordSvg.innerHTML = `<text x="0" y="198.5" font-size="283" textLength="1357" lengthAdjust="spacingAndGlyphs">${wordText.replace(/[<&]/g, '')}</text>`); }
}
