/* =========================================================
   NINGÚN NIÑO SIN REGALO · Fundación ITACA · 21 de diciembre
   Cartel interactivo en 3D real (Three.js r128 · WebGL)

   · Toda la escena está modelada en 3D con texturas procedurales
     (madera, tejas, nieve, agujas de pino, pelaje, arpillera,
     barro, metal y papeles de regalo) generadas con <canvas>.
   · Luces y sombras en tiempo real: la luz del cursor proyecta
     sombras que se mueven con el ratón.
   · Eventos: mousemove (cámara 3D, luz, viento, miradas, hover 3D
     por raycasting), mouseenter / mouseleave (textos y marca) y click.
   ========================================================= */

/* =========================================================
   0 · Constantes, utilidades y estado
   ========================================================= */
const W = 848;
const H = 1200;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const rand = (a, b) => Math.random() * (b - a) + a;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TAU = Math.PI * 2;

const ease = {
  linear: (p) => p,
  outCubic: (p) => 1 - Math.pow(1 - p, 3),
  inOutSine: (p) => -(Math.cos(Math.PI * p) - 1) / 2,
  outBack: (p) => { const c = 1.9; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); },
};

const posterWrap = $('#posterWrap');
const poster     = $('#poster');
const canvas     = $('#scene3d');
const headline   = $('#headline');
const badge      = $('#badge');
const badgeRing  = $('#badgeRing');
const badgeCore  = $('#badgeCore');
const cta        = $('#cta');
const cursorEl   = $('#cursor');
const tooltip    = $('#tooltip');

const COLORS = { red: '#c0262f', gold: '#f2c35b', cream: '#fbf3e6', green: '#2c5e3f', ink: '#2e2219' };

const captureMode = new URLSearchParams(location.search).has('captura');

const mouse = { x: W / 2, y: H / 2, vx: 0, vy: 0, nx: 0, ny: 0, inside: false, moved: false };
const cursor = { x: W / 2, y: H / 2, scale: 1, targetScale: 1 };
const wind = { value: 0.3 };
const timers = {};
let scale = 1;

function later(name, fn, ms) {
  clearTimeout(timers[name]);
  timers[name] = setTimeout(fn, ms);
}
function every(name, fn, ms) {
  clearInterval(timers[name]);
  timers[name] = setInterval(fn, ms);
}
function stopEvery(name) {
  clearInterval(timers[name]);
}

/* =========================================================
   1 · TEXTURAS PROCEDURALES (canvas → THREE.CanvasTexture)
   ========================================================= */
let maxAniso = 4;

function hash(x, y, s) {
  const n = Math.sin(x * 127.1 + y * 311.7 + s * 13.37) * 43758.5453;
  return n - Math.floor(n);
}

// ruido de valor periódico (las texturas se repiten sin costuras)
function noiseT(x, y, s, px, py) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % px) + px) % px, x1 = (x0 + 1) % px;
  const y0 = ((yi % py) + py) % py, y1 = (y0 + 1) % py;
  const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbmT(x, y, s, px, py, oct = 4) {
  let f = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < oct; i++) {
    f += amp * noiseT(x, y, s + i * 7, px, py);
    norm += amp;
    x *= 2; y *= 2; px *= 2; py *= 2; amp *= 0.5;
  }
  return f / norm;
}

function finishTexture(cv, repeat, linear) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  if (!linear) t.encoding = THREE.sRGBEncoding;
  t.anisotropy = maxAniso;
  return t;
}

function canvasTexture(w, h, draw, repeat, linear) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  return finishTexture(cv, repeat, linear);
}

function pixelTexture(w, h, fn, repeat, linear) {
  return canvasTexture(w, h, (ctx) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const c = fn(x, y);
        const i = (y * w + x) * 4;
        img.data[i] = clamp(c[0], 0, 255);
        img.data[i + 1] = clamp(c[1], 0, 255);
        img.data[i + 2] = clamp(c[2], 0, 255);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, repeat, linear);
}

// Madera en tablones con veta, juntas, nudos y desgaste
function woodTexture({ planks, vertical, base, weather, seed, size = 512 }) {
  const knots = Array.from({ length: 6 }, (_, i) => ({
    u: hash(i, 3, seed) * size, v: hash(i, 4, seed) * size, r: 5 + hash(i, 5, seed) * 7,
  }));
  const pw = size / planks;
  return pixelTexture(size, size, (x, y) => {
    const u = vertical ? x : y;
    const v = vertical ? y : x;
    const pi = Math.floor(u / pw);
    const lu = u - pi * pw;
    const tone = 0.8 + hash(pi, 1, seed) * 0.32;
    const g = fbmT((u / size) * planks * 3, (v / size) * 2, seed + pi, planks * 3, 2);
    const lines = Math.pow(0.5 + 0.5 * Math.sin((u / size) * 260 + g * 10 + hash(pi, 2, seed) * 6), 7);
    let k = tone * (0.74 + 0.36 * g) * (1 - lines * 0.28);
    for (const kn of knots) {
      const dx = (u - kn.u) * 1.4, dy = (v - kn.v) * 0.55;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < kn.r * 2.2) k *= 0.55 + 0.45 * Math.min(1, Math.abs(Math.sin(d * 0.9)) + d / (kn.r * 2.2));
    }
    if (lu < 2.5 || lu > pw - 1.5) k *= 0.35;
    const wv = fbmT((u / size) * 4, (v / size) * 4, seed + 50, 4, 4);
    const gray = (base[0] + base[1] + base[2]) / 3;
    const wm = weather * wv;
    return [
      (base[0] * (1 - wm) + gray * 1.05 * wm) * k,
      (base[1] * (1 - wm) + gray * 1.05 * wm) * k,
      (base[2] * (1 - wm) + gray * 1.1 * wm) * k,
    ];
  });
}

function snowTexture() {
  return pixelTexture(512, 512, (x, y) => {
    const n = fbmT((x / 512) * 8, (y / 512) * 8, 21, 8, 8, 5);
    const k = (1 - n) * 0.5;
    if (hash(x, y, 99) > 0.996) return [255, 255, 255];
    return [248 - 52 * k, 249 - 40 * k, 253 - 22 * k];
  });
}

function clayTexture() {
  return pixelTexture(256, 256, (x, y) => {
    const n = fbmT((x / 256) * 6, (y / 256) * 6, 31, 6, 6);
    const sp = hash(x, y, 7) > 0.985 ? 0.75 : 1;
    const k = (0.78 + 0.34 * n) * sp;
    return [190 * k, 100 * k, 62 * k];
  });
}

function burlapTexture() {
  return pixelTexture(256, 256, (x, y) => {
    const cell = 8;
    const horiz = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
    const t = ((horiz ? y : x) % cell) / cell;
    const shade = 0.7 + 0.3 * Math.sin(t * Math.PI);
    const n = 0.85 + 0.3 * fbmT((x / 256) * 16, (y / 256) * 16, 41, 16, 16, 3);
    const k = shade * n;
    return [196 * k, 166 * k, 116 * k];
  });
}

function shinglesTexture() {
  return canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#2f241c';
    ctx.fillRect(0, 0, w, h);
    const rowH = 32, sw = 48;
    for (let r = 0; r < h / rowH; r++) {
      const off = (r % 2) * (sw / 2);
      for (let c = -1; c < w / sw + 1; c++) {
        const x = c * sw + off;
        const y = r * rowH;
        const t = 40 + Math.floor(Math.random() * 30);
        ctx.fillStyle = `rgb(${t + 26},${t + 14},${t + 4})`;
        ctx.fillRect(x + 1, y, sw - 2, rowH - 2);
        ctx.fillStyle = 'rgba(0,0,0,.45)';
        ctx.fillRect(x + 1, y + rowH - 6, sw - 2, 4);
        ctx.fillStyle = 'rgba(255,255,255,.07)';
        ctx.fillRect(x + 1, y, sw - 2, 3);
      }
    }
  });
}

function strokesTexture(base, palette, count, len, angle, spread, size = 256, width = 1.6) {
  return canvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const x = Math.random() * w, y = Math.random() * h;
      const a = angle + rand(-spread, spread);
      const l = rand(len * 0.5, len);
      ctx.strokeStyle = pick(palette);
      ctx.globalAlpha = rand(0.35, 0.9);
      ctx.lineWidth = rand(width * 0.6, width * 1.3);
      for (const ox of [-w, 0, w]) {
        for (const oy of [-h, 0, h]) {
          ctx.beginPath();
          ctx.moveTo(x + ox, y + oy);
          ctx.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  });
}

// Luna llena: disco con oscurecimiento en el borde, mares, cráteres con borde claro y rayos

// Pelaje suave: manchas amplias y pelusa fina en todas direcciones (sin rayas ni "esponja")
function furTexture(base, light, seed) {
  const S = 256;
  return pixelTexture(S, S, (x, y) => {
    const big = fbmT((x / S) * 4, (y / S) * 4, seed, 4, 4, 3);              // zonas más claras/oscuras
    const fuzz = fbmT((x / S) * 64, (y / S) * 48, seed + 5, 64, 48, 2);     // pelusa fina
    const t = clamp(0.2 + big * 0.6 + (fuzz - 0.5) * 0.25, 0, 1);
    const shade = 0.94 + (fuzz - 0.5) * 0.1;
    return [
      (base[0] + (light[0] - base[0]) * t) * shade,
      (base[1] + (light[1] - base[1]) * t) * shade,
      (base[2] + (light[2] - base[2]) * t) * shade,
    ];
  });
}

// Agujas de pino en gris claro (se tiñen con los colores de vértice)
function needleDetailTexture() {
  const t = strokesTexture('#d8d8d8', ['#ffffff', '#a8a8a8', '#c4c4c4', '#8c8c8c'], 3200, 12, Math.PI / 2, 0.9);
  t.repeat.set(5, 3);
  return t;
}

function metalTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b4bdc4';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      ctx.fillStyle = `rgba(${pick(['255,255,255', '60,70,80'])},${rand(0.05, 0.16)})`;
      ctx.beginPath();
      const cx = Math.random() * w, cy = Math.random() * h;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU, r = rand(14, 34);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      ctx.fill();
    }
    for (let y = 0; y < h; y += 2) {
      ctx.fillStyle = `rgba(0,0,0,${rand(0, 0.05)})`;
      ctx.fillRect(0, y, w, 1);
    }
  });
}

function paperTexture(kind) {
  return canvasTexture(256, 256, (ctx, w, h) => {
    if (kind === 'stripes') {
      ctx.fillStyle = '#f7efe3'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#c0262f';
      ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(Math.PI / 4);
      for (let i = -12; i < 12; i++) ctx.fillRect(i * 32, -400, 16, 800);
      ctx.restore();
    } else if (kind === 'dots') {
      ctx.fillStyle = '#e3a92c'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#b81f2a';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        ctx.beginPath(); ctx.arc(x * 32 + (y % 2) * 16 + 8, y * 32 + 16, 6, 0, TAU); ctx.fill();
      }
    } else if (kind === 'plaid') {
      ctx.fillStyle = '#1f6a42'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(192,38,47,.75)';
      for (let i = 0; i < 4; i++) { ctx.fillRect(i * 64 + 20, 0, 18, h); ctx.fillRect(0, i * 64 + 20, w, 18); }
      ctx.fillStyle = 'rgba(242,195,91,.8)';
      for (let i = 0; i < 4; i++) { ctx.fillRect(i * 64 + 50, 0, 3, h); ctx.fillRect(0, i * 64 + 50, w, 3); }
    } else if (kind === 'stars') {
      ctx.fillStyle = '#2f5aa8'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f7efe3';
      for (let i = 0; i < 40; i++) {
        const x = (i * 53) % w, y = (i * 97) % h, r = 7;
        ctx.beginPath();
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * TAU - Math.PI / 2, rr = k % 2 ? r * 0.45 : r;
          ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        }
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#c0262f'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2f7048';
      for (let i = 0; i < 8; i++) ctx.fillRect(i * 32, 0, 14, h);
    }
    // ligera textura de papel
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rand(0, 0.06)})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

function spriteTexture(draw, size = 128) {
  const t = canvasTexture(size, size, (ctx, w, h) => draw(ctx, w, h));
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function radial(ctx, w, stops) {
  const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  stops.forEach(([o, c]) => g.addColorStop(o, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, w);
}

const TEX = {};
function makeTextures() {
  TEX.planks = woodTexture({ planks: 6, vertical: true, base: [150, 124, 98], weather: 0.55, seed: 3 });
  TEX.planks.repeat.set(2, 1.2);
  TEX.bench = woodTexture({ planks: 4, vertical: false, base: [178, 138, 94], weather: 0.15, seed: 9 });
  TEX.post = woodTexture({ planks: 2, vertical: true, base: [110, 84, 60], weather: 0.3, seed: 5, size: 256 });
  TEX.shingles = shinglesTexture();
  TEX.snow = snowTexture();
  TEX.clay = clayTexture();
  TEX.burlap = burlapTexture();
  TEX.metal = metalTexture();
  TEX.needles = strokesTexture('#1d5134', ['#2f7a4c', '#163f28', '#3d8d5c', '#123222'], 2600, 14, Math.PI / 2, 0.7);
  // detalle de agujas en gris claro: el color real lo ponen los colores de vértice del pino
  TEX.needleDetail = needleDetailTexture();
  TEX.bark = strokesTexture('#4a3426', ['#2e1f16', '#6b4c38', '#3a281d'], 700, 40, Math.PI / 2, 0.15, 256, 3);
  TEX.fur = {
    deer: furTexture([138, 86, 46], [190, 132, 82], 11),
    fox: furTexture([196, 88, 32], [232, 138, 74], 12),
    rabbit: furTexture([132, 112, 94], [190, 172, 152], 13),
    squirrel: furTexture([143, 136, 130], [196, 190, 184], 14),
    cream: furTexture([236, 228, 214], [255, 252, 246], 15),
    bear: furTexture([138, 86, 48], [180, 126, 80], 16),
    gray: furTexture([141, 138, 144], [184, 181, 188], 17),
  };
  // pelo fino casi blanco (el color lo ponen los vértices) y mapa de pelos sueltos para las capas
  TEX.furDetail = pixelTexture(256, 256, (x, y) => {
    const streak = fbmT((x / 256) * 96, (y / 256) * 10, 31, 96, 10, 2);
    const fine = hash(x, y, 7);
    const v = 218 + (streak - 0.5) * 44 + (fine - 0.5) * 26;
    return [v, v, v];
  });
  TEX.strands = pixelTexture(128, 128, (x, y) => { const v = hash(x, y, 3) * 255; return [v, v, v]; }, null, true);
  TEX.strands.magFilter = THREE.NearestFilter;
  TEX.featherDetail = pixelTexture(128, 128, (x, y) => {
    const u = (x / 128) * 8, w = (y / 128) * 8;
    const row = Math.floor(w), off = row % 2 ? 0.5 : 0;
    const fx = (u + off) % 1 - 0.5, fy = w % 1;
    const scallop = fy - (1 - fx * fx * 2.4);
    const v = 236 + (scallop > -0.08 && scallop < 0 ? -14 : 0) + (hash(x, y, 9) - 0.5) * 14;
    return [v, v, v];
  });
  // rama de abeto: ramita central con agujas a los lados (para el borde de los pinos)
  TEX.branch = canvasTexture(128, 256, (ctx, w, h) => {
    ctx.lineCap = 'round';
    const greens = ['#2f5e3c', '#244d31', '#3c7048', '#1b3d27', '#47804f'];
    const twig = (x0, y0, x1, y1, len, width) => {
      ctx.strokeStyle = '#4a3a2a'; ctx.lineWidth = width;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const n = Math.hypot(x1 - x0, y1 - y0) / 2.2;
      for (let i = 0; i < n; i++) {
        const t = i / n, x = lerp(x0, x1, t), y = lerp(y0, y1, t);
        const l = len * (1 - t * 0.55) * (0.7 + Math.random() * 0.5);
        [-1, 1].forEach((sd) => {
          const a = Math.atan2(y1 - y0, x1 - x0) + sd * (0.9 + Math.random() * 0.4);
          ctx.strokeStyle = greens[Math.floor(Math.random() * greens.length)];
          ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
        });
      }
    };
    twig(w / 2, h - 4, w / 2, 8, 30, 3);
    for (let i = 0; i < 7; i++) {
      const y = h - 30 - i * 30, sd = i % 2 ? 1 : -1;
      twig(w / 2, y, w / 2 + sd * (34 - i * 3), y - 46 + i * 2, 13, 1.6);
    }
  });
  TEX.papers = ['stripes', 'dots', 'plaid', 'stars', 'candy'].map(paperTexture);

  TEX.glow = spriteTexture((ctx, w) => radial(ctx, w, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,.55)'], [1, 'rgba(255,255,255,0)']]));
  TEX.flake = spriteTexture((ctx, w) => radial(ctx, w, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,.8)'], [1, 'rgba(255,255,255,0)']]), 64);
  TEX.smoke = spriteTexture((ctx, w) => {
    radial(ctx, w, [[0, 'rgba(230,224,236,.9)'], [0.6, 'rgba(210,204,220,.35)'], [1, 'rgba(200,194,210,0)']]);
  });
  TEX.star4 = spriteTexture((ctx, w) => {
    const c = w / 2, s = w * 0.48;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(c, c - s);
    ctx.quadraticCurveTo(c + s * 0.12, c - s * 0.12, c + s, c);
    ctx.quadraticCurveTo(c + s * 0.12, c + s * 0.12, c, c + s);
    ctx.quadraticCurveTo(c - s * 0.12, c + s * 0.12, c - s, c);
    ctx.quadraticCurveTo(c - s * 0.12, c - s * 0.12, c, c - s);
    ctx.fill();
  });
  TEX.heart = spriteTexture((ctx, w) => {
    const s = w * 0.36, c = w / 2;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(c, c + s * 0.9);
    ctx.bezierCurveTo(c - s * 1.4, c - s * 0.2, c - s * 0.6, c - s * 1.2, c, c - s * 0.4);
    ctx.bezierCurveTo(c + s * 0.6, c - s * 1.2, c + s * 1.4, c - s * 0.2, c, c + s * 0.9);
    ctx.fill();
  });
  TEX.note = spriteTexture((ctx, w) => {
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${w * 0.8}px Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♪', w / 2, w / 2);
  });

  // cielo de noche cerrada, con un leve resplandor verde de la aurora sobre el horizonte
  TEX.sky = canvasTexture(4, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    [[0, '#02040c'], [0.22, '#050b1f'], [0.4, '#0a1534'], [0.5, '#0f2244'], [0.56, '#143a4a'], [0.6, '#10303e'], [0.66, '#0b1e30'], [1, '#08141f']]
      .forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  TEX.sky.wrapS = TEX.sky.wrapT = THREE.ClampToEdgeWrapping;
}

// Etiqueta de texto (cartel del saco, del saquito de semillas…)
function labelTexture(lines, opts = {}) {
  return canvasTexture(opts.w || 256, opts.h || 128, (ctx, w, h) => {
    if (opts.bg) { ctx.fillStyle = opts.bg; ctx.fillRect(0, 0, w, h); }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((l, i) => {
      ctx.font = l.font;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, w / 2, h * l.y);
    });
  });
}

// Texto flotante para las reacciones ("¡pío!", "¡clin!"…)
const textCache = new Map();
function textSpriteTexture(text, color) {
  const key = text + color;
  if (textCache.has(key)) return textCache.get(key);
  const t = canvasTexture(512, 128, (ctx, w, h) => {
    ctx.font = 'italic 800 64px Fraunces, Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(20,14,30,.7)';
    ctx.strokeText(text, w / 2, h / 2);
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  textCache.set(key, t);
  return t;
}

/* =========================================================
   2 · RENDERER, ESCENA, CÁMARA Y LUCES
   ========================================================= */
let renderer, scene, camera;
const CAM_BASE = new THREE.Vector3(0, 2.7, 14);
const CAM_TARGET = new THREE.Vector3(0.2, 2.2, 0);
const camState = { intro: 0, offX: 0, offY: 0 };
const lights = {};

function setupRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: captureMode });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  maxAniso = renderer.capabilities.getMaxAnisotropy();

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 200);
  camera.position.copy(CAM_BASE);
  camera.lookAt(CAM_TARGET);
  setupComposer();
}

/* ---------- Postprocesado: brillo de las luces (bloom) y bordes suaves ----------
   La escena se pinta en una imagen intermedia, se le suma el brillo de las zonas
   más luminosas y se pasa a la pantalla. Si los archivos de lib/postprocessing no
   están, se dibuja como antes, directamente. */
let composer = null, bloomPass = null, fxaaPass = null;
const post = { enabled: false };
function setupComposer() {
  if (!THREE.EffectComposer || !THREE.UnrealBloomPass) return;
  const gl2 = renderer.capabilities.isWebGL2;
  const half = gl2 || renderer.extensions.has('OES_texture_half_float');
  const pr = renderer.getPixelRatio();
  const opts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat,
    type: half ? THREE.HalfFloatType : THREE.UnsignedByteType };
  // WebGL2: antialiasing real (MSAA) en la imagen intermedia; si no, FXAA al final
  const target = gl2 && THREE.WebGLMultisampleRenderTarget
    ? Object.assign(new THREE.WebGLMultisampleRenderTarget(W * pr, H * pr, opts), { samples: 4 })
    : new THREE.WebGLRenderTarget(W * pr, H * pr, opts);
  // en sRGB, como la pantalla: así las capas transparentes (niebla, humo, halos)
  // se mezclan exactamente igual que sin postprocesado
  target.texture.encoding = THREE.sRGBEncoding;
  composer = new THREE.EffectComposer(renderer, target);
  composer.addPass(new THREE.RenderPass(scene, camera));
  // solo brillan las bombillas, la estrella, la ventana, la luna…
  bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), 0.6, 0.35, 0.96);
  composer.addPass(bloomPass);
  composer.addPass(new THREE.ShaderPass(THREE.CopyShader));   // paso final a pantalla
  if (!gl2 && THREE.FXAAShader) {
    fxaaPass = new THREE.ShaderPass(THREE.FXAAShader);
    composer.addPass(fxaaPass);
  }
  setComposerSize();
  post.enabled = true;
}
function setComposerSize() {
  if (!composer) return;
  const pr = renderer.getPixelRatio();
  composer.setPixelRatio(pr);
  composer.setSize(W, H);
  if (fxaaPass) fxaaPass.material.uniforms.resolution.value.set(1 / (W * pr), 1 / (H * pr));
}
function renderFrame() {
  if (post.enabled) composer.render();
  else renderer.render(scene, camera);
}

function setupLights() {
  scene.background = TEX.sky;
  // noche: la niebla es azul oscura y la luz ambiente es muy débil
  scene.fog = new THREE.Fog(0x0c1a2e, 14, 50);

  lights.hemi = new THREE.HemisphereLight(0x3a5a96, 0x1a2236, 0.58);
  scene.add(lights.hemi);

  // la luz principal es la de la aurora: verde, desde el fondo del cielo; proyecta las sombras
  const key = new THREE.DirectionalLight(0x86ffc8, 0.62);
  key.position.set(-5, 10, -9);
  key.target.position.set(0.5, 0, 0.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 32 });
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  lights.key = key;

  // relleno magenta de la aurora, desde el otro lado
  const auroraPink = new THREE.DirectionalLight(0xd060ff, 0.32);
  auroraPink.position.set(8, 8, -10);
  scene.add(auroraPink);
  // un poco de luz azul de las estrellas por delante, para que las caras no queden negras
  const starFill = new THREE.DirectionalLight(0x7c92d0, 0.26);
  starFill.position.set(2, 6, 12);
  scene.add(starFill);

  // luz del cursor: una linterna cálida que proyecta sombras
  const cur = new THREE.PointLight(0xffd9a8, 0, 5, 2);
  cur.castShadow = true;
  cur.shadow.mapSize.set(512, 512);
  cur.shadow.bias = -0.003;
  cur.position.set(0, 3, 4);
  scene.add(cur);
  lights.cursor = cur;
  lights.cursorTarget = new THREE.Vector3(0, 3, 4);
}

/* =========================================================
   3 · AYUDAS DE GEOMETRÍA Y MATERIALES
   ========================================================= */
const GEO = {};
function makeGeometries() {
  GEO.sphere = new THREE.SphereGeometry(1, 28, 20);
  GEO.sphereLo = new THREE.SphereGeometry(1, 12, 8);
  GEO.box = new THREE.BoxGeometry(1, 1, 1);
  GEO.cyl = new THREE.CylinderGeometry(1, 1, 1, 18);
  GEO.cone = new THREE.ConeGeometry(1, 1, 24);
  GEO.plane = new THREE.PlaneGeometry(1, 1);
}

const MAT = {};
function std(opts) {
  return new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, ...opts });
}
function makeMaterials() {
  MAT.wall = std({ map: TEX.planks, bumpMap: TEX.planks, bumpScale: 0.035, roughness: 0.92 });
  MAT.post = std({ map: TEX.post, bumpMap: TEX.post, bumpScale: 0.02, roughness: 0.9 });
  MAT.bench = std({ map: TEX.bench, bumpMap: TEX.bench, bumpScale: 0.02, roughness: 0.75 });
  MAT.roof = std({ map: TEX.shingles, bumpMap: TEX.shingles, bumpScale: 0.05, roughness: 0.95 });
  MAT.snow = std({ map: TEX.snow, bumpMap: TEX.snow, bumpScale: 0.04, roughness: 0.85, color: 0xffffff });
  MAT.ice = std({ color: 0xdff1ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.82, emissive: 0x6f9fd8, emissiveIntensity: 0.18 });
  MAT.clay = std({ map: TEX.clay, bumpMap: TEX.clay, bumpScale: 0.02, roughness: 0.95 });
  MAT.metal = std({ map: TEX.metal, roughness: 0.42, metalness: 0.35 });
  MAT.darkMetal = std({ color: 0x2c2c32, roughness: 0.5, metalness: 0.7 });
  MAT.burlap = std({ map: TEX.burlap, bumpMap: TEX.burlap, bumpScale: 0.03, roughness: 1 });
  MAT.needles = std({ map: TEX.needles, bumpMap: TEX.needles, bumpScale: 0.05, roughness: 0.9 });
  MAT.pine = std({ map: TEX.needleDetail, vertexColors: true, roughness: 0.95 });
  MAT.xmasPine = std({ map: TEX.needleDetail, bumpMap: TEX.needleDetail, bumpScale: 0.03, vertexColors: true, roughness: 0.85 });
  MAT.bark = std({ map: TEX.bark, bumpMap: TEX.bark, bumpScale: 0.04, roughness: 1 });
  MAT.cream = std({ color: 0xece2cf, roughness: 0.7 });
  MAT.black = std({ color: 0x141010, roughness: 0.3 });
  MAT.eyeShine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  MAT.red = std({ color: 0xc0262f, roughness: 0.5 });
  MAT.redGloss = std({ color: 0xc0262f, roughness: 0.2, metalness: 0.4 });
  MAT.gold = std({ color: 0xe8b23a, roughness: 0.25, metalness: 0.8 });
  MAT.green = std({ color: 0x2f7048, roughness: 0.6 });
  MAT.leaf = std({ color: 0x2a7a45, roughness: 0.4, side: THREE.DoubleSide });
  MAT.straw = std({ color: 0xa8915f, roughness: 1 });
  MAT.pink = std({ color: 0xe6a2a0, roughness: 0.6 });
  MAT.orange = std({ color: 0xe08a2a, roughness: 0.5 });
  MAT.fur = Object.fromEntries(Object.entries(TEX.fur).map(([k, t]) => [k, std({ map: t, bumpMap: t, bumpScale: 0.004, roughness: 0.95 })]));
  MAT.papers = TEX.papers.map((t) => std({ map: t, roughness: 0.55 }));
}

// Crea una malla con posición/rotación/escala en una sola llamada
function mesh(geo, mat, parent, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = o.cast !== false;
  m.receiveShadow = o.receive !== false;
  if (o.p) m.position.set(o.p[0], o.p[1], o.p[2]);
  if (o.r) m.rotation.set(o.r[0], o.r[1], o.r[2]);
  if (o.s !== undefined) {
    if (Array.isArray(o.s)) m.scale.set(o.s[0], o.s[1], o.s[2]);
    else m.scale.setScalar(o.s);
  }
  if (parent) parent.add(m);
  return m;
}

function group(parent, p, r) {
  const g = new THREE.Group();
  if (p) g.position.set(p[0], p[1], p[2]);
  if (r) g.rotation.set(r[0], r[1], r[2]);
  if (parent) parent.add(g);
  return g;
}

function glowSprite(parent, color, size, p, opacity = 0.9) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX.glow, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  s.scale.setScalar(size);
  if (p) s.position.set(p[0], p[1], p[2]);
  s.userData.noRay = true;
  parent.add(s);
  return s;
}

function makeEye(parent, p, r = 0.022) {
  const eye = group(parent, p);
  mesh(GEO.sphereLo, MAT.black, eye, { s: r, cast: false });
  mesh(GEO.sphereLo, MAT.eyeShine, eye, { p: [r * 0.45, r * 0.4, r * 0.35], s: r * 0.3, cast: false });
  return eye;
}

// Registro de objetos interactivos 3D
const reactRoots = [];
function makeReact(obj, name, label) {
  obj.userData.react = name;
  obj.userData.label = label;
  reactRoots.push(obj);
  return obj;
}

const R = {};            // referencias a todo lo que se anima
const heads = [];        // cabezas que siguen al cursor
const blinkers = [];     // grupos de ojos que parpadean
const breathers = [];    // cuerpos que respiran

/* =========================================================
   4 · CONSTRUCCIÓN DE LA ESCENA
   ========================================================= */

// ---------- Suelo nevado con relieve ----------
// La malla del suelo tiene 51.200 triángulos: lanzar rayos contra ella es carísimo.
// Guardamos sus alturas y calculamos el punto exacto del triángulo bajo (x, z).
const GROUND = { size: 90, seg: 160, h: null };
function groundAt(x, z, outNormal) {
  const cell = GROUND.size / GROUND.seg, half = GROUND.size / 2, row = GROUND.seg + 1;
  const gx = clamp((x + half) / cell, 0, GROUND.seg - 1e-4);
  const gz = clamp((z + half) / cell, 0, GROUND.seg - 1e-4);
  const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz;
  const H = GROUND.h;
  const ha = H[iz * row + ix], hd = H[iz * row + ix + 1];
  const hb = H[(iz + 1) * row + ix], hc = H[(iz + 1) * row + ix + 1];
  let y, dx, dz;
  if (u + v <= 1) { y = ha + u * (hd - ha) + v * (hb - ha); dx = hd - ha; dz = hb - ha; }
  else { y = hc + (1 - u) * (hb - hc) + (1 - v) * (hd - hc); dx = hc - hb; dz = hc - hd; }
  if (outNormal) outNormal.set(-dx / cell, 1, -dz / cell).normalize();
  return y;
}

function buildGround() {
  const geo = new THREE.PlaneGeometry(GROUND.size, GROUND.size, GROUND.seg, GROUND.seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  GROUND.h = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const n = fbmT(x * 0.18 + 50, z * 0.18 + 50, 77, 64, 64, 4);
    const far = clamp((Math.hypot(x, z) - 4) / 8, 0, 1);
    const y = (n - 0.5) * (0.12 + far * 0.7) - 0.03;
    pos.setY(i, y);
    GROUND.h[i] = y;
  }
  geo.computeVertexNormals();
  const tex = TEX.snow.clone();
  tex.needsUpdate = true;
  tex.repeat.set(30, 30);
  const mat = std({ map: tex, bumpMap: tex, bumpScale: 0.05, roughness: 0.88 });
  const ground = mesh(geo, mat, scene, { cast: false });
  ground.userData.noCollide = true;   // su altura se calcula con groundAt(), sin rayos
  R.ground = ground;

  // montículos de nieve alrededor de las cosas
  [[-2.15, 1.0, 0.75], [2.4, 2.3, 0.6], [1.2, -0.9, 1.3], [-4.5, -2, 1.4], [5.5, -3.5, 1.8]].forEach(([x, z, r]) => {
    mesh(GEO.sphere, MAT.snow, scene, { p: [x, -r * 0.82, z], s: [r * 1.4, r, r * 1.2], cast: false });
  });
}

// ---------- Cielo: estrellas, luna y bandada ----------
function buildSky() {
  const starGeo = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i < 700; i++) {
    const a = rand(-Math.PI * 0.85, -Math.PI * 0.15);
    const e = rand(0.12, 0.9);
    const r = 90;
    pts.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  R.stars = [0.9, 1.6].map((size, i) => {
    const geo = i === 0 ? starGeo : starGeo.clone();
    if (i === 1) geo.setDrawRange(0, 160);
    const p = new THREE.Points(geo, new THREE.PointsMaterial({
      size: size * 2.2, sizeAttenuation: false, map: TEX.flake, transparent: true, depthWrite: false, fog: false, color: 0xfff6e8,
    }));
    p.userData.noRay = true;
    scene.add(p);
    return p;
  });


  // bandada (aparece de vez en cuando)
  R.flock = group(scene, [0, 0, -26]);
  R.flock.visible = false;
  R.flockBirds = [];
  const wingMat = new THREE.MeshBasicMaterial({ color: 0x1b1a2e, side: THREE.DoubleSide, fog: false });
  // ala de pájaro (silueta barrida hacia atrás); cada ala gira desde el hombro
  const ws = new THREE.Shape();
  ws.moveTo(0, 0.03); ws.bezierCurveTo(0.2, 0.1, 0.38, 0.08, 0.56, 0.0);
  ws.bezierCurveTo(0.4, -0.02, 0.24, -0.06, 0.08, -0.08); ws.lineTo(0, -0.05);
  const wingGeo = new THREE.ShapeGeometry(ws, 12);
  for (let i = 0; i < 7; i++) {
    const k = Math.abs(i - 3);
    const b = group(R.flock, [-k * 1.1, k * 0.55, rand(-0.5, 0.5)]);
    b.scale.setScalar(rand(0.85, 1.1));
    mesh(GEO.sphere, wingMat, b, { p: [0, -0.02, 0], s: [0.09, 0.05, 0.05], cast: false });
    mesh(GEO.sphere, wingMat, b, { p: [0, 0.03, 0], s: 0.035, cast: false });
    const l = group(b, [-0.04, 0, 0]);
    const r = group(b, [0.04, 0, 0]);
    mesh(wingGeo, wingMat, r, { cast: false });
    mesh(wingGeo, wingMat, l, { s: [-1, 1, 1], cast: false });
    R.flockBirds.push({ l, r, phase: rand(0, TAU), speed: rand(9, 11) });
  }
}

// ---------- Piso de ramas (cono con puntas caídas, agujas y nieve) ----------
// Cono unitario (radio 1, alto 1, centrado) con el borde en picos que cuelgan,
// y colores de vértice: verde oscuro dentro/abajo, más claro en las puntas y
// manchas de nieve en la parte de arriba de las ramas.
function branchTierGeometry(seed, o = {}) {
  const branches = o.branches || 9;
  const snowAmount = o.snow ?? 0.55;
  const dark = new THREE.Color(o.dark || 0x123a2a);
  const light = new THREE.Color(o.light || 0x2f6a4c);
  const snowC = new THREE.Color(0xf2f5fb);
  const geo = new THREE.ConeGeometry(1, 1, branches * 6, 6, false);
  const pos = geo.attributes.position;
  const colors = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const rr = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    const t = y + 0.5;                       // 0 = borde inferior, 1 = punta
    // picos de rama en el borde: la punta sale y cae
    const tip = Math.pow(0.5 + 0.5 * Math.cos(a * branches + seed), 3);
    const edge = Math.pow(1 - t, 2.5);       // solo afecta cerca del borde
    const n = noiseT(a * 3 + seed, t * 4, seed, 1000, 1000);
    const k = 1 + edge * (tip * 0.22 - 0.06) + (n - 0.5) * 0.08 * (1 - t);
    if (rr > 1e-4) { pos.setX(i, x * k); pos.setZ(i, z * k); }
    pos.setY(i, y - edge * tip * 0.1);
    // color: degradado por altura y por pico de rama
    const shade = clamp(0.35 + t * 0.25 + tip * edge * 0.45 + (n - 0.5) * 0.3, 0, 1);
    c.copy(dark).lerp(light, shade);
    // nieve: en la parte de arriba de cada piso y sobre las puntas de rama
    const sn = noiseT(a * 5 + seed * 3, t * 6, seed + 11, 1000, 1000);
    const snowy = (t > 0.55 ? (t - 0.55) * 1.6 : 0) + tip * edge * 0.55 + (sn - 0.5) * 0.9;
    if (rr > 1e-4 && snowy > 1 - snowAmount) c.lerp(snowC, clamp((snowy - (1 - snowAmount)) * 3, 0, 0.95));
    c.convertSRGBToLinear();               // el renderer trabaja en lineal → colores fieles, no lavados
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

// ---------- Pinos del bosque ----------
const pineTierGeos = [];
function makePine(parent, h, interactive) {
  if (!pineTierGeos.length) for (let i = 0; i < 4; i++) pineTierGeos.push(branchTierGeometry(i * 1.7 + 0.4, { snow: 0.3 + i * 0.06, branches: 13, dark: 0x0c2619, light: 0x2a5838 }));
  const root = group(parent);
  const sway = group(root);
  const inner = group(sway);
  // abeto: tronco visible abajo y muchos pisos de ramas que se estrechan hasta una punta fina
  mesh(GEO.cyl, MAT.bark, inner, { p: [0, h * 0.25, 0], s: [h * 0.03, h * 0.5, h * 0.03] });
  const tiers = 11;
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const r = h * 0.27 * Math.pow(1 - t * 0.92, 1.05) * rand(0.92, 1.06);
    const th = h * (0.2 - t * 0.06);
    const y = h * 0.1 + t * h * 0.74;
    mesh(pickTier(i), MAT.pine, inner, { p: [0, y + th / 2, 0], r: [0, rand(0, TAU), 0], s: [r, th, r] });
  }
  // ramas sueltas que sobresalen del borde de cada piso: silueta irregular y plumosa
  const cards = mesh(pineCardsGeometry(h, tiers), MAT.pineCards || (MAT.pineCards = std({
    map: TEX.branch, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.9,
  })), inner, { cast: false });
  cards.userData.noCollide = true;
  return { root, sway, inner, h, phase: rand(0, TAU), interactive };
}
function pineCardsGeometry(h, tiers) {
  const pos = [], uv = [], col = [], idx = [];
  const c = new THREE.Color();
  const snowC = new THREE.Color(0xeef2f8);
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const R0 = h * 0.27 * Math.pow(1 - t * 0.92, 1.05);
    const th = h * (0.2 - t * 0.06), y = h * 0.1 + t * h * 0.74;
    const slope = Math.atan2(th, R0);
    const n = Math.round(10 + R0 * 10);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + rand(-0.2, 0.2);
      const droop = slope * rand(0.55, 0.85);          // menos inclinada que el piso: asoma por fuera
      const f = rand(0.45, 0.65);                       // nace sobre la superficie del piso
      const len = R0 * rand(0.6, 0.85), wd = len * rand(0.5, 0.65);
      const dir = v3(Math.cos(a) * Math.cos(droop), -Math.sin(droop), Math.sin(a) * Math.cos(droop));
      const base = v3(Math.cos(a) * R0 * f, y + th * (1 - f) + h * 0.008, Math.sin(a) * R0 * f);
      const side = v3(-Math.sin(a), rand(-0.25, 0.25), Math.cos(a)).normalize().multiplyScalar(wd / 2);
      const tip = base.clone().addScaledVector(dir, len);
      const v0 = pos.length / 3;
      [[base, -1, 0, 0], [base, 1, 1, 0], [tip, -1, 0, 1], [tip, 1, 1, 1]].forEach(([p, sd, u, vv]) => {
        pos.push(p.x + side.x * sd, p.y + side.y * sd, p.z + side.z * sd);
        uv.push(u, vv);
        c.setRGB(1, 1, 1).multiplyScalar(0.42 + t * 0.15 + vv * 0.12);
        if (vv && Math.random() < 0.15) c.lerp(snowC, 0.35);  // algo de nieve en algunas puntas
        col.push(c.r, c.g, c.b);
      });
      idx.push(v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
const pickTier = (i) => pineTierGeos[(i + Math.floor(Math.random() * 4)) % pineTierGeos.length];

function buildForest() {
  R.pines = [];
  const spots = [
    [-4.8, -7.2, 4.2, true], [-3.1, -8.6, 3.4, true], [-6.6, -9.4, 4.8, true], [-1.6, -10.5, 3.8, true],
    [-8.5, -12, 5.2], [0.8, -13, 4.4], [3.4, -12.2, 5], [5.8, -10.8, 4.6], [7.8, -14, 5.6],
    [-10.5, -15.5, 6], [-5.5, -16, 5.4], [2.4, -17, 6], [9.5, -9, 4.4], [-12, -9, 5],
  ];
  spots.forEach(([x, z, h, interactive]) => {
    const pine = makePine(scene, h, interactive);
    pine.root.position.set(x, 0, z);
    pine.root.rotation.y = rand(0, TAU);
    if (interactive) makeReact(pine.root, 'pine', 'Un pino nevado');
    pine.root.userData.pine = pine;
    R.pines.push(pine);
  });
}

// ---------- Animales: anatomía, pelo y patas articuladas ----------
// Los cuerpos no son esferas pegadas: cada pieza es una sola superficie continua
// ("loft") que pasa por una serie de secciones elípticas a lo largo de una columna,
// con los colores del pelaje pintados en los vértices (vientre claro, grupa, etc.).
// El pelo son varias "capas" (shells) de la misma malla, infladas a lo largo de la
// normal y recortadas con un mapa de pelos sueltos: la silueta queda peluda.

const smooth01 = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const mixC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
function crm(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// rings: [{x, y, h, b, w, z}] · centro de la sección en el plano XY; h = medio alto hacia
// el "dorso" (normal izquierda de la columna), b = hacia el "vientre", w = medio ancho (Z).
// color(s, ang, x, y, z) → [r, g, b] 0..255 · s = 0..1 a lo largo, ang 0 = dorso, π = vientre
function loftGeometry(rings, o = {}) {
  const seg = o.seg || 20, steps = o.steps || 4;
  const K = ['x', 'y', 'h', 'b', 'w', 'z'];
  rings = rings.map((r) => ({ b: r.h, z: 0, ...r }));
  const n = rings.length, pts = [];
  for (let i = 0; i < n - 1; i++) {
    const r0 = rings[Math.max(0, i - 1)], r1 = rings[i], r2 = rings[i + 1], r3 = rings[Math.min(n - 1, i + 2)];
    for (let k = 0; k < steps; k++) {
      const r = {};
      K.forEach((key) => { r[key] = crm(r0[key], r1[key], r2[key], r3[key], k / steps); });
      pts.push(r);
    }
  }
  pts.push({ ...rings[n - 1] });
  pts.forEach((r) => { r.h = Math.max(r.h, 4e-4); r.b = Math.max(r.b, 4e-4); r.w = Math.max(r.w, 4e-4); });
  let L = 0, perim = 0;
  const acc = [0];
  for (let i = 1; i < pts.length; i++) { L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); acc.push(L); }
  pts.forEach((r) => { perim = Math.max(perim, Math.PI * ((r.h + r.b) / 2 + r.w)); });
  const dens = o.density || 6;                       // repeticiones de la textura de pelo por metro
  const uRep = Math.max(1, Math.round(perim * dens));
  const pos = [], uv = [], col = [], idx = [];
  const c = new THREE.Color();
  pts.forEach((r, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = -ty, ny = tx;
    for (let j = 0; j <= seg; j++) {
      const ang = (j / seg) * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
      const v = ca >= 0 ? r.h * ca : r.b * ca;
      const x = r.x + nx * v, y = r.y + ny * v, z = r.z + r.w * sa;
      pos.push(x, y, z);
      uv.push((j / seg) * uRep, acc[i] * dens);
      const rgb = o.color ? o.color(acc[i] / (L || 1), ang > Math.PI ? TAU - ang : ang, x, y, z, sa) : [255, 255, 255];
      c.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255).convertSRGBToLinear();
      col.push(c.r, c.g, c.b);
    }
  });
  for (let i = 0; i < pts.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * (seg + 1) + j, b = a + seg + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // costura: misma normal a los dos lados
  const nr = geo.attributes.normal;
  for (let i = 0; i < pts.length; i++) {
    const a = i * (seg + 1), b = a + seg;
    const sx = nr.getX(a) + nr.getX(b), sy = nr.getY(a) + nr.getY(b), sz = nr.getZ(a) + nr.getZ(b);
    const l = Math.hypot(sx, sy, sz) || 1;
    nr.setXYZ(a, sx / l, sy / l, sz / l);
    nr.setXYZ(b, sx / l, sy / l, sz / l);
  }
  return geo;
}

// Material de pelo: color en los vértices × detalle de pelo fino
const furMatCache = new Map();
function furMaterial(kind = 'fur') {
  if (!furMatCache.has(kind)) {
    furMatCache.set(kind, std({
      map: kind === 'feather' ? TEX.featherDetail : TEX.furDetail,
      vertexColors: true, roughness: kind === 'feather' ? 0.72 : 0.95,
    }));
  }
  return furMatCache.get(kind);
}

// Capas de pelo: cada capa es la misma malla, empujada hacia fuera y con menos pelos
const shellMatCache = new Map();
function shellMaterial(k, len, droop) {
  const key = `${k.toFixed(3)}|${len}|${droop}`;
  if (shellMatCache.has(key)) return shellMatCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    map: TEX.furDetail, alphaMap: TEX.strands, alphaTest: 0.3 + k * 0.6,
    vertexColors: true, roughness: 1, color: new THREE.Color().setScalar(0.68 + k * 0.42),
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.furOff = { value: k * len };
    sh.uniforms.furDroop = { value: droop * k * k * len };
    sh.vertexShader = 'uniform float furOff;\nuniform float furDroop;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  transformed += normalize(objectNormal) * furOff;\n  transformed.y -= furDroop;');
  };
  m.customProgramCacheKey = () => 'furShell';
  shellMatCache.set(key, m);
  return m;
}
let FUR_ON = true;
function addFur(m, len = 0.015, layers = 6, droop = 0.5) {
  if (!FUR_ON) return m;
  for (let i = 1; i <= layers; i++) {
    const s = new THREE.Mesh(m.geometry, shellMaterial(i / layers, len, droop));
    s.castShadow = false;
    s.receiveShadow = true;
    s.userData.noRay = true;
    s.userData.noCollide = true;
    m.add(s);
  }
  return m;
}

// Pieza de pelo: loft + material + capas de pelo
function furPart(parent, rings, o = {}) {
  const m = mesh(loftGeometry(rings, o), furMaterial(o.kind), parent, { p: o.p, r: o.r });
  if (o.fur) addFur(m, o.fur[0], o.fur[1], o.fur[2]);
  return m;
}

// Pata articulada: una cadena de huesos (grupos) con un segmento de carne en cada uno.
// segs: [{len, r0, r1, a, d, bulge, fur}] · a = ángulo absoluto en reposo (+ = hacia delante),
// d = profundidad (delante-detrás) respecto al ancho, bulge = músculo.
function makeLimb(parent, p, segs, o = {}) {
  const joints = [];
  let par = parent, prevAbs = 0;
  segs.forEach((s, i) => {
    const j = group(par, i === 0 ? p : [0, -segs[i - 1].len, 0]);
    j.rotation.z = s.a - prevAbs;
    j.userData.rest = j.rotation.z;
    prevAbs = s.a;
    const d = s.d || 1.25, bl = 1 + (s.bulge || 0), last = i === segs.length - 1;
    const rr = (r) => ({ h: r * d, b: r * d, w: r });
    const mid = (t) => lerp(s.r0, s.r1, t);
    const rings = [
      { x: 0, y: s.r0 * 0.9, ...rr(s.r0 * 0.3) },
      { x: 0, y: s.r0 * 0.45, ...rr(s.r0 * 0.88) },
      { x: 0, y: 0, ...rr(s.r0) },
      { x: 0, y: -s.len * 0.35, ...rr(mid(0.35) * bl) },
      { x: 0, y: -s.len * 0.75, ...rr(mid(0.75)) },
      { x: 0, y: -s.len, ...rr(s.r1) },
      { x: 0, y: -s.len - s.r1 * 0.5, ...rr(s.r1 * 0.8) },
      { x: 0, y: -s.len - s.r1 * 0.9, ...rr(s.r1 * (last ? 0.05 : 0.3)) },
    ];
    const m = mesh(loftGeometry(rings, { seg: 14, steps: 3, color: (t, ang, x, y, z) => o.color(i, t, ang) }), furMaterial(), j);
    if (s.fur) addFur(m, s.fur[0], s.fur[1], 0.2);
    joints.push(j);
    par = j;
  });
  const end = group(par, [0, -segs[segs.length - 1].len, 0]);
  if (o.foot) o.foot(end, prevAbs);
  return { joints, end };
}

// Ciclo de paso: balanceo de la cadera/hombro y flexión de las articulaciones al levantar la pata
function poseLegs(legs, t, moving, k = 0.3) {
  legs.forEach((leg) => {
    const ph = t + leg.phase * TAU;
    const swing = moving ? Math.sin(ph) * leg.amp : 0;
    const lift = moving ? Math.pow(Math.max(0, Math.cos(ph)), 1.5) : 0;
    const flex = leg.flex;   // cuánto se dobla cada articulación al levantar
    leg.joints.forEach((j, i) => {
      const target = j.userData.rest + (i === 0 ? swing : 0) + lift * (flex[i] || 0);
      j.rotation.z = lerp(j.rotation.z, target, k);
    });
  });
}

// Ojo realista: globo oscuro brillante con iris y reflejo
function realEye(parent, p, r, iris = 0x3a2416) {
  const eye = group(parent, p);
  mesh(GEO.sphere, MAT.eyeBall || (MAT.eyeBall = std({ color: 0x0b0806, roughness: 0.08, metalness: 0.2 })), eye, { s: r, cast: false });
  mesh(GEO.sphereLo, std({ color: iris, roughness: 0.15 }), eye, { p: [r * 0.55, 0, 0], s: [r * 0.5, r * 0.75, r * 0.75], cast: false });
  mesh(GEO.sphereLo, MAT.eyeShine, eye, { p: [r * 0.75, r * 0.35, r * 0.3], s: r * 0.22, cast: false });
  return eye;
}

// Asta de ciervo: tubo que se afina hacia la punta
function antlerTube(parent, mat, points, r0, r1) {
  const curve = new THREE.CatmullRomCurve3(points.map((v) => new THREE.Vector3(...v)));
  const tub = 16, rad = 7;
  const geo = new THREE.TubeGeometry(curve, tub, 1, rad, false);
  const pos = geo.attributes.position;
  const c = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i <= tub; i++) {
    curve.getPointAt(i / tub, c);
    const r = lerp(r0, r1, Math.pow(i / tub, 0.8));
    for (let j = 0; j <= rad; j++) {
      const k = i * (rad + 1) + j;
      q.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, q.x, q.y, q.z);
    }
  }
  geo.computeVertexNormals();
  return mesh(geo, mat, parent);
}

// ---------- Ciervo rojo (macho con cornamenta) ----------
const DEER_PAL = { RED: [146, 84, 46], DARK: [104, 64, 40], CREAM: [222, 200, 166], BELLY: [176, 140, 104], GREY: [112, 92, 76] };
// reno: gris parduzco con el cuello y la melena casi blancos
const REINDEER_PAL = { RED: [118, 92, 70], DARK: [74, 58, 46], CREAM: [228, 220, 204], BELLY: [204, 194, 176], GREY: [218, 208, 190], LEG: [58, 46, 38] };

function buildDeer() {
  const d = makeDeerModel(scene, { p: [-1.3, 0, -5.4], r: [0, -Math.PI / 2 + 0.5, 0] });
  R.deer = { ...d, x: -1.3, dir: 0, mode: 'idle', target: -1.3, paused: false, walkT: 0 };
  makeReact(d.root, 'deer', 'Un ciervo');
  heads.push({ obj: d.head, weight: 0.8, max: 1.0 });
  blinkers.push(d.eyes);
  breathers.push({ obj: d.body, amp: 0.01, speed: 1.6 });
}

// Ciervo (o reno) completo: o.pal = colores, o.fur = false para quitar las capas de pelo (lejos)
function makeDeerModel(parent, o = {}) {
  const deer = group(parent, o.p, o.r);
  const body = group(deer);
  const { RED, DARK, CREAM, BELLY, GREY, LEG } = o.pal || DEER_PAL;
  FUR_ON = o.fur !== false;
  furPart(body, [
    { x: -0.63, y: 1.04, h: 0.02, b: 0.02, w: 0.02 },
    { x: -0.57, y: 1.04, h: 0.13, b: 0.17, w: 0.13 },
    { x: -0.43, y: 1.02, h: 0.19, b: 0.24, w: 0.19 },
    { x: -0.2, y: 0.99, h: 0.19, b: 0.22, w: 0.19 },
    { x: 0.02, y: 0.99, h: 0.2, b: 0.24, w: 0.2 },
    { x: 0.22, y: 1.01, h: 0.23, b: 0.26, w: 0.18 },
    { x: 0.4, y: 1.04, h: 0.21, b: 0.22, w: 0.14 },
    { x: 0.5, y: 1.07, h: 0.12, b: 0.14, w: 0.1 },
    { x: 0.55, y: 1.09, h: 0.01, b: 0.01, w: 0.01 },
  ], {
    seg: 24, fur: [0.014, 6, 0.4],
    color: (s, ang, x, y) => {
      let c = mixC(RED, DARK, smooth01(0.5, 0, ang) * 0.5);                  // raya dorsal más oscura
      c = mixC(c, BELLY, smooth01(2.0, 2.7, ang));                            // vientre
      c = mixC(c, CREAM, smooth01(-0.42, -0.55, x) * smooth01(2.6, 1.2, ang)); // mancha clara de la grupa
      return mixC(c, GREY, smooth01(0.25, 0.5, x) * 0.6);                    // cruz y pecho más grises
    },
  });
  const tail = group(body, [-0.59, 1.12, 0]);
  furPart(tail, [
    { x: 0.02, y: 0.01, h: 0.03, w: 0.035 }, { x: -0.03, y: -0.04, h: 0.035, w: 0.035 },
    { x: -0.05, y: -0.11, h: 0.025, w: 0.025 }, { x: -0.055, y: -0.14, h: 0.004, w: 0.004 },
  ], { seg: 12, fur: [0.012, 4, 0.5], color: (s, ang) => mixC(RED, CREAM, smooth01(1.2, 2.2, ang)) });

  // patas: delanteras (hombro, antebrazo, caña, cuartilla) y traseras (muslo, pierna, corvejón…)
  const legCol = (i, t, ang) => {
    const c = i === 0 ? RED : LEG ? mixC(RED, LEG, Math.min(1, 0.45 + i * 0.25)) : mixC(RED, GREY, 0.45 + i * 0.12);
    return mixC(c, CREAM, smooth01(2.2, 2.9, ang) * (i < 2 ? 0.5 : 0.25));
  };
  const hoof = (end, abs) => {
    const h = group(end, [0, -0.01, 0], [0, 0, -abs]);
    mesh(new THREE.CylinderGeometry(0.019, 0.026, 0.055, 12), MAT.hoof || (MAT.hoof = std({ color: 0x241a14, roughness: 0.55 })), h, { p: [0.008, -0.022, 0] });
    mesh(GEO.sphereLo, MAT.hoof, h, { p: [-0.022, 0.006, 0], s: [0.012, 0.01, 0.014], cast: false });   // espolón
  };
  const front = (z) => makeLimb(body, [0.36, 1.0, z], [
    { len: 0.26, r0: 0.062, r1: 0.055, a: -0.35, d: 1.3, bulge: 0.1, fur: [0.01, 4] },
    { len: 0.3, r0: 0.05, r1: 0.03, a: 0.0, d: 1.25, bulge: 0.15, fur: [0.006, 3] },
    { len: 0.34, r0: 0.025, r1: 0.021, a: 0.03, d: 1.3, fur: [0.004, 2] },
    { len: 0.08, r0: 0.022, r1: 0.02, a: 0.5 },
  ], { color: legCol, foot: hoof });
  const hind = (z) => makeLimb(body, [-0.38, 1.04, z], [
    { len: 0.36, r0: 0.085, r1: 0.055, a: 0.4, d: 1.35, bulge: 0.15, fur: [0.01, 4] },
    { len: 0.36, r0: 0.055, r1: 0.03, a: -0.6, d: 1.45, bulge: 0.2, fur: [0.006, 3] },
    { len: 0.29, r0: 0.026, r1: 0.021, a: -0.04, d: 1.3, fur: [0.004, 2] },
    { len: 0.08, r0: 0.022, r1: 0.02, a: 0.5 },
  ], { color: legCol, foot: hoof });
  // fases de un paso de ciervo (secuencia lateral) y flexión de cada articulación
  const FF = [0, 0.4, -1.4, -0.6], HF = [0, -0.6, 0.95, -0.6];
  const legs = [
    { ...front(0.085), phase: 0.25, amp: 0.35, flex: FF }, { ...front(-0.085), phase: 0.75, amp: 0.35, flex: FF },
    { ...hind(0.095), phase: 0, amp: 0.32, flex: HF }, { ...hind(-0.095), phase: 0.5, amp: 0.32, flex: HF },
  ];

  // cuello con melena (el macho tiene la garganta muy peluda)
  const neck = group(body, [0.4, 1.1, 0]);
  furPart(neck, [
    { x: -0.08, y: -0.1, h: 0.16, b: 0.18, w: 0.13 },
    { x: 0.06, y: 0.07, h: 0.12, b: 0.14, w: 0.1 },
    { x: 0.17, y: 0.21, h: 0.085, b: 0.1, w: 0.075 },
    { x: 0.25, y: 0.31, h: 0.075, b: 0.08, w: 0.068 },
    { x: 0.29, y: 0.37, h: 0.01, b: 0.01, w: 0.01 },
  ], { seg: 20, fur: [0.03, 7, 0.9], color: (s, ang) => mixC(GREY, DARK, smooth01(1.8, 2.8, ang) * 0.6) });

  const head = group(neck, [0.27, 0.35, 0]);
  furPart(head, [
    { x: -0.11, y: 0.02, h: 0.01, w: 0.01 },
    { x: -0.08, y: 0.02, h: 0.075, b: 0.08, w: 0.072 },
    { x: 0.0, y: 0.01, h: 0.08, b: 0.08, w: 0.074 },
    { x: 0.1, y: -0.03, h: 0.052, b: 0.06, w: 0.05 },
    { x: 0.2, y: -0.075, h: 0.038, b: 0.045, w: 0.036 },
    { x: 0.255, y: -0.095, h: 0.033, b: 0.036, w: 0.031 },
    { x: 0.275, y: -0.1, h: 0.004, w: 0.004 },
  ], {
    seg: 20, fur: [0.006, 4, 0.2],
    color: (s, ang, x) => {
      let c = mixC(RED, GREY, 0.35);
      c = mixC(c, CREAM, smooth01(2.0, 2.6, ang) * smooth01(0.0, 0.15, x));   // barbilla y labio claros
      return mixC(c, [34, 26, 24], smooth01(0.235, 0.255, x));                // trufa negra húmeda
    },
  });
  const ears = [1, -1].map((side) => {
    const ear = group(head, [-0.06, 0.07, side * 0.06], [side * 0.75, side * -0.35, 0.25]);
    furPart(ear, [
      { x: 0, y: 0, h: 0.012, w: 0.018 }, { x: 0, y: 0.05, h: 0.012, w: 0.042 },
      { x: 0, y: 0.11, h: 0.01, w: 0.04 }, { x: 0, y: 0.16, h: 0.006, w: 0.016 }, { x: 0, y: 0.175, h: 0.002, w: 0.002 },
    ], { seg: 12, color: (s, ang) => mixC(mixC(RED, GREY, 0.4), [236, 226, 210], smooth01(1.9, 2.6, ang)) });
    return ear;
  });
  const eyes = [1, -1].map((side) => realEye(head, [0.035, 0.035, side * 0.066], 0.019));
  // cornamenta: vara, luchadera, punta media y corona
  const antlerMat = std({ map: TEX.bark, color: 0xc9a982, roughness: 0.75 });
  const tipMat = std({ color: 0xf1e6d2, roughness: 0.5 });
  [1, -1].forEach((sd) => {
    const P = (x, y, z) => [x, y, z * sd];
    antlerTube(head, antlerMat, [P(-0.04, 0.08, 0.04), P(-0.09, 0.2, 0.1), P(-0.13, 0.36, 0.15), P(-0.11, 0.5, 0.16), P(-0.05, 0.62, 0.12)], 0.018, 0.008);
    [
      [P(-0.065, 0.14, 0.07), P(0.0, 0.17, 0.1), P(0.08, 0.2, 0.12)],
      [P(-0.1, 0.24, 0.115), P(-0.03, 0.29, 0.14), P(0.04, 0.33, 0.15)],
      [P(-0.125, 0.38, 0.155), P(-0.06, 0.44, 0.19), P(-0.02, 0.48, 0.21)],
      [P(-0.11, 0.5, 0.16), P(-0.14, 0.58, 0.19), P(-0.15, 0.65, 0.2)],
    ].forEach((pts) => {
      antlerTube(head, antlerMat, pts, 0.011, 0.004);
      mesh(GEO.sphereLo, tipMat, head, { p: pts[2], s: 0.005, cast: false });
    });
  });

  FUR_ON = true;
  return { root: deer, body, legs, neck, head, ears, tail, eyes };
}

// ---------- Zorro rojo ----------
function buildFox() {
  const fox = group(scene, [9, 0, -4.4], [0, Math.PI, 0]);
  const body = group(fox);
  const ORANGE = [206, 96, 34], DEEP = [168, 70, 26], WHITE = [242, 236, 226], BLACK = [38, 30, 28];
  furPart(body, [
    { x: -0.37, y: 0.47, h: 0.01, w: 0.01 },
    { x: -0.31, y: 0.47, h: 0.085, b: 0.095, w: 0.085 },
    { x: -0.16, y: 0.46, h: 0.095, b: 0.105, w: 0.095 },
    { x: 0.04, y: 0.46, h: 0.095, b: 0.11, w: 0.095 },
    { x: 0.2, y: 0.48, h: 0.1, b: 0.125, w: 0.09 },
    { x: 0.31, y: 0.51, h: 0.085, b: 0.11, w: 0.078 },
    { x: 0.38, y: 0.55, h: 0.01, w: 0.01 },
  ], {
    seg: 22, fur: [0.02, 7, 0.5],
    color: (s, ang, x) => {
      let c = mixC(ORANGE, DEEP, smooth01(0.6, 0, ang) * 0.6);
      c = mixC(c, [226, 210, 190], smooth01(2.1, 2.8, ang));                  // vientre crema
      return mixC(c, WHITE, smooth01(1.9, 2.5, ang) * smooth01(0.12, 0.25, x)); // pecho blanco
    },
  });
  furPart(body, [
    { x: 0.22, y: 0.5, h: 0.09, b: 0.11, w: 0.085 },
    { x: 0.31, y: 0.56, h: 0.075, b: 0.09, w: 0.075 },
    { x: 0.37, y: 0.61, h: 0.06, b: 0.07, w: 0.064 },
    { x: 0.39, y: 0.63, h: 0.01, w: 0.01 },
  ], { seg: 18, fur: [0.025, 7, 0.6], color: (s, ang) => mixC(ORANGE, WHITE, smooth01(1.6, 2.3, ang)) });

  const legCol = (i, t, ang) => (i === 0 ? mixC(ORANGE, BLACK, smooth01(0.4, 1, t)) : BLACK);
  const paw = (end, abs) => {
    const p = group(end, [0, 0, 0], [0, 0, -abs]);
    furPart(p, [
      { x: -0.015, y: 0.012, h: 0.004, w: 0.004 }, { x: -0.005, y: 0.014, h: 0.014, b: 0.012, w: 0.018 },
      { x: 0.025, y: 0.01, h: 0.012, b: 0.01, w: 0.019 }, { x: 0.042, y: 0.008, h: 0.002, w: 0.002 },
    ], { seg: 10, steps: 3, color: () => BLACK });
  };
  const front = (z) => makeLimb(body, [0.24, 0.47, z], [
    { len: 0.15, r0: 0.045, r1: 0.03, a: -0.3, d: 1.25, bulge: 0.1, fur: [0.014, 4] },
    { len: 0.17, r0: 0.026, r1: 0.017, a: 0.02, d: 1.2 },
    { len: 0.1, r0: 0.017, r1: 0.015, a: 0.3 },
  ], { color: legCol, foot: paw });
  const hind = (z) => makeLimb(body, [-0.25, 0.48, z], [
    { len: 0.17, r0: 0.06, r1: 0.036, a: 0.45, d: 1.35, bulge: 0.15, fur: [0.016, 4] },
    { len: 0.17, r0: 0.032, r1: 0.019, a: -0.6, d: 1.35, bulge: 0.15 },
    { len: 0.13, r0: 0.018, r1: 0.016, a: -0.02 },
  ], { color: legCol, foot: paw });
  // trote: diagonales a la vez
  const FF = [0, 0.5, -1.5], HF = [0, -0.7, 1.0];
  const legs = [
    { ...front(0.065), phase: 0, amp: 0.55, flex: FF }, { ...front(-0.065), phase: 0.5, amp: 0.55, flex: FF },
    { ...hind(0.07), phase: 0.5, amp: 0.5, flex: HF }, { ...hind(-0.07), phase: 0, amp: 0.5, flex: HF },
  ];

  // cola muy poblada con la punta blanca
  const tail = group(body, [-0.33, 0.49, 0], [0, 0, 0.3]);
  furPart(tail, [
    { x: -0.62, y: -0.13, h: 0.004, w: 0.004 },
    { x: -0.59, y: -0.12, h: 0.04, w: 0.04 },
    { x: -0.47, y: -0.09, h: 0.07, w: 0.07 },
    { x: -0.27, y: -0.05, h: 0.068, w: 0.066 },
    { x: -0.1, y: -0.01, h: 0.045, w: 0.045 },
    { x: 0.02, y: 0.0, h: 0.03, w: 0.03 },
  ], {
    seg: 16, fur: [0.04, 8, 0.8],
    color: (s, ang) => {
      let c = mixC(DEEP, ORANGE, smooth01(0.9, 0.5, s));
      c = mixC(c, [70, 44, 30], smooth01(0.16, 0.12, s) * 0.8);   // anillo oscuro antes de la punta
      return mixC(c, WHITE, smooth01(0.11, 0.07, s));             // punta blanca
    },
  });

  const head = group(body, [0.37, 0.62, 0]);
  furPart(head, [
    { x: -0.09, y: 0.005, h: 0.01, w: 0.01 },
    { x: -0.065, y: 0.01, h: 0.07, b: 0.068, w: 0.078 },
    { x: 0.01, y: 0.0, h: 0.064, b: 0.06, w: 0.074 },
    { x: 0.09, y: -0.022, h: 0.036, b: 0.036, w: 0.034 },
    { x: 0.165, y: -0.036, h: 0.02, b: 0.022, w: 0.018 },
    { x: 0.2, y: -0.04, h: 0.013, b: 0.014, w: 0.012 },
    { x: 0.212, y: -0.04, h: 0.003, w: 0.003 },
  ], {
    seg: 20, fur: [0.012, 5, 0.3],
    color: (s, ang, x) => {
      let c = mixC(ORANGE, WHITE, smooth01(1.75, 2.25, ang) * smooth01(-0.05, 0.0, x));   // mejillas y mandíbula blancas
      c = mixC(c, [60, 40, 32], smooth01(0.11, 0.16, x) * smooth01(1.2, 1.9, ang) * 0.6);  // lagrimal oscuro
      return mixC(c, BLACK, smooth01(0.19, 0.2, x));                                      // trufa
    },
  });
  [1, -1].forEach((side) => {
    const ear = group(head, [-0.035, 0.055, side * 0.042], [side * 0.3, side * -0.25, 0.08]);
    furPart(ear, [
      { x: 0, y: 0, h: 0.014, w: 0.036 }, { x: 0, y: 0.05, h: 0.012, w: 0.032 },
      { x: 0, y: 0.095, h: 0.008, w: 0.014 }, { x: 0, y: 0.125, h: 0.002, w: 0.002 },
    ], { seg: 12, color: (s, ang) => mixC(mixC(BLACK, ORANGE, smooth01(0.1, 0.0, s) * 0.6), WHITE, smooth01(2.0, 2.6, ang) * 0.85) });
  });
  const eyes = [1, -1].map((side) => realEye(head, [0.062, 0.03, side * 0.046], 0.013, 0x8a5a14));
  R.fox = { root: fox, body, legs, tail, head, eyes, x: 9, active: false, paused: false, t: 0 };
  makeReact(fox, 'fox', 'Un zorro');
  heads.push({ obj: head, weight: 0.9, max: 1.2 });
  blinkers.push(eyes);
  breathers.push({ obj: body, amp: 0.012, speed: 2.4 });
}

// ---------- Conejo gris chinchilla, acurrucado ----------
function buildRabbit() {
  const rabbit = group(scene, [-0.55, 0, 2.55], [0, Math.PI - 0.55, 0]);
  const body = group(rabbit);
  const GREY = [126, 124, 128], DARK = [84, 82, 88], LIGHT = [184, 182, 186], WHITE = [236, 234, 234];
  const ticked = (c, x, y, z) => mixC(c, DARK, (hash(Math.round(x * 400), Math.round(y * 400 + z * 300), 4) > 0.6 ? 0.35 : 0));
  furPart(body, [
    { x: -0.245, y: 0.15, h: 0.01, w: 0.01 },
    { x: -0.21, y: 0.155, h: 0.1, b: 0.12, w: 0.11 },
    { x: -0.11, y: 0.17, h: 0.14, b: 0.15, w: 0.15 },
    { x: 0.02, y: 0.165, h: 0.13, b: 0.14, w: 0.135 },
    { x: 0.12, y: 0.18, h: 0.1, b: 0.11, w: 0.1 },
    { x: 0.18, y: 0.21, h: 0.01, w: 0.01 },
  ], {
    seg: 22, fur: [0.012, 7, 0.4],
    color: (s, ang, x, y, z) => {
      let c = mixC(DARK, GREY, smooth01(0, 0.9, ang));
      c = mixC(c, LIGHT, smooth01(1.4, 2.2, ang));
      return ticked(mixC(c, WHITE, smooth01(2.4, 2.9, ang)), x, y, z);
    },
  });
  // patas articuladas: traseras (cadera → corvejón → pie largo) y manos delanteras
  const hind = [], front = [];
  [1, -1].forEach((sd) => {
    const hip = group(body, [-0.07, 0.11, sd * 0.095]);
    furPart(hip, [
      { x: 0, y: 0.02, h: 0.03, w: 0.03 }, { x: 0, y: -0.03, h: 0.028, w: 0.026 },
      { x: 0, y: -0.075, h: 0.02, w: 0.02 }, { x: 0, y: -0.09, h: 0.004, w: 0.004 },
    ], { seg: 12, fur: [0.012, 4, 0.2], color: () => GREY });
    const hock = group(hip, [0, -0.08, 0]);
    furPart(hock, [
      { x: -0.015, y: 0.0, h: 0.004, w: 0.004 }, { x: 0.01, y: 0.002, h: 0.026, b: 0.022, w: 0.032 },
      { x: 0.12, y: -0.005, h: 0.02, b: 0.018, w: 0.03 }, { x: 0.165, y: -0.008, h: 0.003, w: 0.003 },
    ], { seg: 12, fur: [0.012, 4, 0.2], color: (s, ang) => mixC(GREY, WHITE, smooth01(1.2, 2.4, ang)) });
    hind.push({ hip, hock });
    const arm = group(body, [0.1, 0.09, sd * 0.045]);
    furPart(arm, [
      { x: 0, y: 0.01, h: 0.018, w: 0.018 }, { x: 0, y: -0.04, h: 0.016, w: 0.016 }, { x: 0.005, y: -0.062, h: 0.004, w: 0.004 },
    ], { seg: 10, fur: [0.01, 3, 0.2], color: () => LIGHT });
    furPart(arm, [
      { x: -0.005, y: -0.062, h: 0.003, w: 0.003 }, { x: 0.005, y: -0.064, h: 0.014, w: 0.018 },
      { x: 0.045, y: -0.07, h: 0.012, w: 0.016 }, { x: 0.06, y: -0.071, h: 0.003, w: 0.003 },
    ], { seg: 10, fur: [0.01, 3, 0.2], color: () => LIGHT });
    front.push(arm);
  });
  const tailM = furPart(body, [
    { x: -0.02, y: 0, h: 0.003, w: 0.003 }, { x: -0.005, y: 0, h: 0.035, w: 0.035 }, { x: 0.03, y: 0, h: 0.003, w: 0.003 },
  ], { p: [-0.25, 0.17, 0], seg: 12, fur: [0.016, 5, 0.2], color: () => WHITE });
  tailM.rotation.z = Math.PI;

  const head = group(body, [0.15, 0.29, 0]);
  const eyeP = [0.025, 0.022, 0.06];
  furPart(head, [
    { x: -0.075, y: 0.0, h: 0.01, w: 0.01 },
    { x: -0.055, y: 0.0, h: 0.068, b: 0.068, w: 0.07 },
    { x: 0.02, y: 0.0, h: 0.064, b: 0.06, w: 0.068 },
    { x: 0.075, y: -0.018, h: 0.038, b: 0.044, w: 0.046 },
    { x: 0.1, y: -0.026, h: 0.02, b: 0.022, w: 0.026 },
    { x: 0.108, y: -0.028, h: 0.003, w: 0.003 },
  ], {
    seg: 22, fur: [0.012, 6, 0.2],
    color: (s, ang, x, y, z) => {
      let c = mixC(DARK, GREY, smooth01(0.2, 1.2, ang));
      c = mixC(c, WHITE, smooth01(2.0, 2.6, ang) * smooth01(0.0, 0.05, x));   // hocico y barbilla blancos
      const de = Math.hypot(x - eyeP[0], y - eyeP[1], Math.abs(z) - eyeP[2]);
      c = mixC(c, WHITE, smooth01(0.034, 0.024, de) * 0.9);                 // anillo blanco del ojo
      return ticked(c, x, y, z);
    },
  });
  const nose = mesh(GEO.sphereLo, std({ color: 0x8a6f70, roughness: 0.4 }), head, { p: [0.104, -0.022, 0], s: [0.008, 0.008, 0.012] });
  const ears = [1, -1].map((side) => {
    const ear = group(head, [-0.035, 0.05, side * 0.026], [side * 0.18, side * -0.2, -0.15]);
    furPart(ear, [
      { x: 0, y: 0, h: 0.012, w: 0.018 }, { x: 0, y: 0.06, h: 0.012, w: 0.036 },
      { x: 0, y: 0.13, h: 0.01, w: 0.034 }, { x: 0, y: 0.175, h: 0.008, w: 0.02 }, { x: 0, y: 0.19, h: 0.002, w: 0.002 },
    ], {
      seg: 12, fur: [0.005, 3, 0.1],
      color: (s, ang, x, y, z, sa) => {
        let c = mixC(GREY, [196, 176, 176], smooth01(1.8, 2.6, ang) * smooth01(0.9, 0.5, Math.abs(sa)));
        return mixC(c, DARK, smooth01(0.85, 1, s) * 0.8);                  // borde oscuro de la punta
      },
    });
    return ear;
  });
  const eyes = [1, -1].map((side) => realEye(head, [eyeP[0], eyeP[1], side * (eyeP[2] - 0.004)], 0.016, 0x4a2a1a));
  R.rabbit = { root: rabbit, body, head, ears, nose, eyes, hind, front, baseX: -0.55, x: 0, paused: false };
  makeReact(rabbit, 'rabbit', 'Un conejo');
  heads.push({ obj: head, weight: 0.7, max: 0.9 });
  blinkers.push(eyes);
  breathers.push({ obj: body, amp: 0.02, speed: 3.2 });
}

// ---------- Pájaros: cuerpo, cabeza, alas y cola con el plumaje de cada especie ----------
const BIRDS = {
  // lavandera blanca: cara blanca, píleo y babero negros, dorso gris, cola larga negra con bordes blancos
  wagtail: {
    tail: 0.13, crest: false,
    body: (s, ang, x) => (x > 0.035 && ang > 1.4 ? [22, 22, 26] : ang < 1.3 ? [70, 70, 76] : [244, 244, 242]),
    head: (x, y, z, ang) => (y > 0.012 || (y < -0.012 && x > -0.01) ? [20, 20, 24] : [246, 246, 244]),
    wing: (s, ang) => (s > 0.3 && s < 0.4 && ang > 0.9 ? [240, 240, 238] : s > 0.55 && ang < 0.8 ? [230, 230, 228] : [26, 26, 30]),
    tailC: (s, sa) => (Math.abs(sa) > 0.75 ? [240, 240, 240] : [18, 18, 22]),
    beak: 0x161616, legs: 0x1a1a1a,
  },
  // arrendajo azul: copete, dorso azul, collar negro, alas azul intenso con barras negras y manchas blancas
  jay: {
    tail: 0.11, crest: [86, 124, 196],
    body: (s, ang, x, y) => {
      if (x > 0.05 && x < 0.062 && ang > 1.3) return [20, 20, 26];        // collar negro fino
      return ang < 1.5 ? [96, 128, 178] : mixC([206, 210, 218], [236, 236, 238], smooth01(1.8, 2.8, ang));
    },
    head: (x, y, z, ang) => {
      if (Math.abs(y + 0.004) < 0.005 && x > 0.0) return [18, 18, 24];   // línea negra del ojo
      return y > 0.008 ? [82, 122, 196] : [236, 238, 242];
    },
    wing: (s) => (Math.sin(s * 40) > 0.65 ? [16, 20, 30] : s > 0.7 ? [244, 246, 250] : s < 0.3 ? [76, 118, 196] : [44, 108, 206]),
    tailC: (s) => (s < 0.1 ? [240, 240, 244] : Math.sin(s * 48) > 0.7 ? [16, 20, 30] : [52, 104, 196]),
    beak: 0x161616, legs: 0x2a2a30,
  },
  // petirrojo: dorso pardo oliva, cara y pecho naranja, vientre blanco
  robin: {
    tail: 0.08, crest: false,
    body: (s, ang, x) => (ang < 1.2 ? [122, 104, 78] : x > 0.0 && ang < 2.6 ? [218, 108, 48] : [238, 232, 226]),
    head: (x, y, z, ang) => (y > 0.01 && x < 0.025 ? [122, 104, 78] : [222, 112, 50]),
    wing: () => [112, 94, 70], tailC: () => [104, 86, 64], beak: 0x2a221c, legs: 0x8a6a58,
  },
  // cardenal rojo con antifaz negro
  cardinal: {
    tail: 0.1, crest: [200, 34, 44],
    body: (s, ang) => (ang < 1.3 ? [176, 28, 38] : [206, 44, 50]),
    head: (x, y, z) => (x > 0.02 && y < 0.008 ? [20, 14, 14] : [206, 38, 46]),
    wing: () => [140, 22, 30], tailC: () => [130, 22, 30], beak: 0xe8823a, legs: 0x8a5a50,
  },
  // carbonero: píleo y babero negros, mejillas blancas, dorso gris, flancos ante
  chickadee: {
    tail: 0.09, crest: false,
    body: (s, ang, x) => (x > 0.045 && ang > 1.6 ? [22, 22, 24] : ang < 1.2 ? [138, 138, 134] : ang < 2.2 ? [216, 196, 166] : [242, 240, 236]),
    head: (x, y, z) => (y > 0.008 || (y < -0.016 && x > -0.005) ? [22, 22, 24] : [246, 246, 244]),
    wing: (s, ang) => (ang < 0.9 && s > 0.4 ? [210, 210, 206] : [110, 110, 108]), tailC: () => [100, 100, 98], beak: 0x161616, legs: 0x3a3a40,
  },
};

function makeBird(parent, o) {
  const sp = BIRDS[o.species];
  const root = group(parent, o.p, [0, o.yaw || 0, 0]);
  const body = group(root, null);
  body.scale.setScalar(o.size || 1);
  const fm = { kind: 'feather' };
  furPart(body, [
    { x: -0.075, y: 0.105, h: 0.006, w: 0.01 },
    { x: -0.05, y: 0.097, h: 0.028, b: 0.034, w: 0.034 },
    { x: -0.005, y: 0.09, h: 0.042, b: 0.05, w: 0.048 },
    { x: 0.04, y: 0.1, h: 0.04, b: 0.046, w: 0.044 },
    { x: 0.07, y: 0.122, h: 0.03, b: 0.032, w: 0.032 },
    { x: 0.085, y: 0.135, h: 0.004, w: 0.004 },
  ], { ...fm, seg: 18, density: 14, color: sp.body });
  // cola: pala de plumas plana
  const tl = sp.tail;
  furPart(body, [
    { x: -0.05, y: 0.105, h: 0.006, w: 0.012 }, { x: -0.05 - tl * 0.4, y: 0.11, h: 0.004, w: 0.018 },
    { x: -0.05 - tl, y: 0.115, h: 0.003, w: 0.022 }, { x: -0.053 - tl, y: 0.115, h: 0.001, w: 0.002 },
  ], { ...fm, seg: 12, steps: 3, density: 14, color: (s, ang, x, y, z, sa) => sp.tailC(1 - s, sa), r: [0, 0, 0.18] });
  const wings = [1, -1].map((side) => {
    // ala plegada: plana y pegada al costado (fina en Z, alta en Y)
    const w = group(body, [0.03, 0.112, side * 0.036]);
    w.userData.folded = furPart(w, [
      { x: 0.025, y: 0, h: 0.006, w: 0.004 }, { x: 0.005, y: 0, h: 0.027, w: 0.008 },
      { x: -0.05, y: 0.004, h: 0.024, w: 0.007 }, { x: -0.1, y: 0.01, h: 0.01, w: 0.004 }, { x: -0.112, y: 0.011, h: 0.001, w: 0.001 },
    ], { ...fm, seg: 12, steps: 3, density: 14, color: (s, ang) => sp.wing(s, ang), r: [-side * 0.12, 0, 0.1] });
    // ala abierta para volar: se extiende hacia el lado con las plumas barridas hacia atrás
    const spread = furPart(w, [
      { x: 0, y: 0, h: 0.005, w: 0.024, z: 0 }, { x: 0.05, y: 0.004, h: 0.006, w: 0.04, z: side * 0.006 },
      { x: 0.11, y: 0.006, h: 0.004, w: 0.036, z: side * 0.022 }, { x: 0.16, y: 0.004, h: 0.002, w: 0.022, z: side * 0.04 },
      { x: 0.175, y: 0.003, h: 0.001, w: 0.004, z: side * 0.046 },
    ], { ...fm, seg: 12, steps: 3, density: 14, color: (s, ang) => sp.wing(1 - s, ang), r: [0, -side * Math.PI / 2, 0] });
    spread.visible = false;
    w.userData.spread = spread;
    return w;
  });
  // patas finas con dedos
  const legMat = std({ color: sp.legs, roughness: 0.6 });
  [0.022, -0.022].forEach((z) => {
    mesh(GEO.cyl, legMat, body, { p: [0.01, 0.03, z], s: [0.0035, 0.06, 0.0035], cast: false });
    [-0.6, 0, 0.6].forEach((a) => mesh(GEO.cyl, legMat, body, { p: [0.022 + Math.cos(a) * 0.006, 0.003, z + Math.sin(a) * 0.008], r: [0, -a, Math.PI / 2], s: [0.0025, 0.026, 0.0025], cast: false }));
    mesh(GEO.cyl, legMat, body, { p: [-0.006, 0.003, z], r: [0, 0, Math.PI / 2], s: [0.0025, 0.016, 0.0025], cast: false });
  });
  const head = group(body, [0.075, 0.14, 0]);
  furPart(head, [
    { x: -0.042, y: 0.004, h: 0.004, w: 0.004 },
    { x: -0.03, y: 0.004, h: 0.034, b: 0.034, w: 0.034 },
    { x: 0.008, y: 0.002, h: 0.038, b: 0.036, w: 0.036 },
    { x: 0.034, y: -0.004, h: 0.024, b: 0.024, w: 0.026 },
    { x: 0.044, y: -0.006, h: 0.004, w: 0.004 },
  ], { ...fm, seg: 16, density: 14, color: (s, ang, x, y, z) => sp.head(x, y, z, ang) });
  if (sp.crest) {
    furPart(head, [
      { x: 0.02, y: 0.02, h: 0.004, w: 0.004 }, { x: 0.005, y: 0.03, h: 0.012, w: 0.012 },
      { x: -0.025, y: 0.05, h: 0.007, w: 0.008 }, { x: -0.045, y: 0.066, h: 0.001, w: 0.001 },
    ], { ...fm, seg: 10, steps: 3, color: () => sp.crest });
  }
  const beak = new THREE.ConeGeometry(1, 1, 10);
  mesh(beak, std({ color: sp.beak, roughness: 0.35 }), head, { p: [0.054, -0.006, 0], r: [0, 0, -Math.PI / 2], s: [o.species === 'cardinal' ? 0.014 : 0.009, 0.03, o.species === 'cardinal' ? 0.014 : 0.009] });
  const eyes = [1, -1].map((side) => realEye(head, [0.024, 0.008, side * 0.03], 0.0075, 0x1a120c));
  blinkers.push(eyes);
  heads.push({ obj: head, weight: 0.8, max: 1.0 });
  const bird = { root, body, head, wings, eyes, base: root.position.clone() };
  BIRD_LIST.push(bird);
  return bird;
}

function buildGroundBirds() {
  R.sparrow = makeBird(scene, { p: [0.45, 0, 3.05], yaw: 0.6, species: 'wagtail', size: 1.25 });
  R.sparrow.paused = false;
  makeReact(R.sparrow.root, 'sparrow', 'Una lavandera');

  R.robin = makeBird(scene, { p: [1.1, 0, 2.95], yaw: 2.6, species: 'robin', size: 1.3 });
  R.robin.paused = false;
  makeReact(R.robin.root, 'robin', 'Un petirrojo');
}

// ---------- Árbol de Navidad ----------
// ---------- Decoración del árbol ----------
// cinta ancha de raso: tira de triángulos a lo largo de una espiral (fn devuelve [ángulo, y, radio])
function ribbonSpiral(fn, width) {
  if (!MAT.velvetRed) MAT.velvetRed = std({ color: lin(0xa80f1c), roughness: 0.55, metalness: 0.05 });
  const N = 320, pos = [], idx = [];
  const pt = (tt) => { const [a, y, r] = fn(tt); return v3(Math.cos(a) * r, y, Math.sin(a) * r); };
  for (let i = 0; i <= N; i++) {
    const tt = i / N;
    const c = pt(tt);
    const tan = pt(Math.min(1, tt + 0.002)).sub(pt(Math.max(0, tt - 0.002))).normalize();
    const out = v3(c.x, 0, c.z).normalize();
    const b = new THREE.Vector3().crossVectors(tan, out).normalize();
    if (b.y < 0) b.negate();
    const wave = Math.sin(i * 0.55) * 0.012;
    c.addScaledVector(out, wave);
    const tw = Math.sin(i * 0.55 + 1.2) * 0.25;          // la cinta se riza un poco
    const e = b.clone().multiplyScalar(width / 2).addScaledVector(out, tw * width * 0.5);
    pos.push(c.x + e.x, c.y + e.y, c.z + e.z, c.x - e.x, c.y - e.y, c.z - e.z);
    if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, MAT.ribbonSatin || (MAT.ribbonSatin = std({ color: lin(0xb8121f), roughness: 0.32, metalness: 0.08, side: THREE.DoubleSide })));
  m.castShadow = false;
  m.receiveShadow = true;
  return m;
}
// cadenetas de cuentas doradas colgando entre puntos de anclaje (una sola malla instanciada)
function beadSwags(radiusAt, levels) {
  const pts = [];
  levels.forEach(([y0, ph, n]) => {
    for (let k = 0; k < n; k++) {
      const a0 = ph + (k / n) * TAU, a1 = ph + ((k + 1) / n) * TAU;
      const r = radiusAt(y0);
      const len = (a1 - a0) * r;
      const beads = Math.floor(len / 0.024);
      for (let i = 0; i < beads; i++) {
        const t = i / beads;
        const a = lerp(a0, a1, t);
        const y = y0 - Math.sin(t * Math.PI) * Math.min(0.13, len * 0.22);
        const rr = radiusAt(y) * 0.97 + 0.03;
        pts.push([Math.cos(a) * rr, y, Math.sin(a) * rr]);
      }
    }
  });
  const im = new THREE.InstancedMesh(GEO.sphereLo, std({ color: lin(0xe7b84a), roughness: 0.2, metalness: 0.9 }), pts.length);
  const m4 = new THREE.Matrix4();
  pts.forEach((q, i) => { m4.makeScale(0.011, 0.011, 0.011).setPosition(q[0], q[1], q[2]); im.setMatrixAt(i, m4); });
  im.castShadow = false;
  im.userData.noCollide = true;
  im.userData.noRay = true;
  return im;
}
// lucecitas cálidas: una malla instanciada cuyo color de cada instancia titila
function fairyLights(radiusAt, n) {
  const im = new THREE.InstancedMesh(GEO.sphereLo, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
  const m4 = new THREE.Matrix4();
  const col = new THREE.Color(0xffd79a);
  const phases = [];
  for (let i = 0; i < n; i++) {
    const y = 0.25 + Math.pow(Math.random(), 0.8) * 1.75;
    const a = rand(0, TAU);
    const r = radiusAt(y) * rand(0.86, 0.99);
    m4.makeScale(0.013, 0.013, 0.013).setPosition(Math.cos(a) * r, y, Math.sin(a) * r);
    im.setMatrixAt(i, m4);
    im.setColorAt(i, col);
    phases.push([rand(0, TAU), rand(1.5, 4.5)]);
  }
  im.castShadow = false;
  im.userData.noCollide = true;
  im.userData.noRay = true;
  return { mesh: im, phases, col };
}
// textura con purpurina para las bolas
function glitterTexture() {
  if (TEX.glitter) return TEX.glitter;
  TEX.glitter = pixelTexture(128, 64, () => {
    const v = Math.random();
    const g = v > 0.93 ? 255 : v > 0.7 ? 205 : 150 + Math.random() * 30;
    return [g, g, g];
  });
  return TEX.glitter;
}
const ornMatCache = new Map();
function ornamentMat(color, finish) {
  const k = color + finish;
  if (!ornMatCache.has(k)) {
    const o = { color: lin(color) };
    if (finish === 'gloss') Object.assign(o, { roughness: 0.12, metalness: 0.55 });
    if (finish === 'satin') Object.assign(o, { roughness: 0.5, metalness: 0.25 });
    if (finish === 'glitter') Object.assign(o, { roughness: 0.35, metalness: 0.65, map: glitterTexture(), bumpMap: glitterTexture(), bumpScale: 0.004 });
    ornMatCache.set(k, std(o));
  }
  return ornMatCache.get(k);
}
// una bola que cuelga de un hilo: el pivote está en la rama y la bola oscila como un péndulo
function makeOrnament(parent, p, o) {
  const pivot = group(parent, p);
  const capM = MAT.ornCap || (MAT.ornCap = std({ color: lin(0xcfa64a), roughness: 0.3, metalness: 0.9 }));
  mesh(GEO.cyl, capM, pivot, { p: [0, -o.hang / 2, 0], s: [0.0018, o.hang, 0.0018], cast: false });
  const ball = group(pivot, [0, -o.hang - o.r, 0]);
  if (o.drop) {
    if (!GEO.drop) {
      GEO.drop = new THREE.LatheGeometry([[0.001, -1.9], [0.25, -1.4], [0.7, -0.7], [1, 0], [0.85, 0.55], [0.45, 0.9], [0.001, 1]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
    }
    mesh(GEO.drop, ornamentMat(o.color, o.finish), ball, { s: o.r, cast: false });
  } else {
    mesh(GEO.sphere, ornamentMat(o.color, o.finish), ball, { s: o.r, cast: false });
  }
  mesh(GEO.cyl, capM, ball, { p: [0, o.r * 0.98, 0], s: [o.r * 0.3, o.r * 0.22, o.r * 0.3], cast: false });
  mesh(GEO.sphereLo, capM, ball, { p: [0, o.r * 1.12, 0], s: o.r * 0.1, cast: false });
  return { pivot, ball, ax: 0, az: 0, vx: 0, vz: 0, phase: rand(0, TAU), len: o.hang + o.r, spin: rand(-0.4, 0.4) };
}
// péndulos: viento, ráfagas, el cursor que las empuja y el meneo al tocar el árbol
const _lastCursor = new THREE.Vector3();
let _hadCursor = false;
function updateOrnaments(dt, time) {
  if (!dt) return;
  let cvx = 0, cvz = 0, cvy = 0;
  const cp = mouse.inside ? cursorPoint : null;
  if (cp) {
    if (_hadCursor) { cvx = (cp.x - _lastCursor.x) / dt; cvy = (cp.y - _lastCursor.y) / dt; cvz = (cp.z - _lastCursor.z) / dt; }
    _lastCursor.copy(cp);
    _hadCursor = true;
  } else _hadCursor = false;
  const gust = 0.3 + Math.abs(wind.value);
  R.ornaments.forEach((o) => {
    const K = 9.8 / o.len * 0.35;                       // rigidez del péndulo según la longitud del hilo
    let fz = Math.sin(time * 1.6 + o.phase) * 0.9 * gust + Math.sin(time * 4.1 + o.phase * 2) * 0.35 * gust;
    let fx = Math.sin(time * 1.25 + o.phase * 1.7) * 0.7 * gust;
    if (cp) {
      const d = Math.hypot(o.wp.x - cp.x, o.wp.y - cp.y, o.wp.z - cp.z);
      if (d < 0.32) {
        const k = (1 - d / 0.32) * 7;
        fz += clamp(cvx + cvy * 0.3, -4, 4) * k;
        fx -= clamp(cvz, -4, 4) * k;
      }
    }
    o.vz += (-K * (o.az + wind.value * 0.22) - 1.4 * o.vz + fz) * dt;
    o.vx += (-K * o.ax - 1.4 * o.vx + fx) * dt;
    o.az = clamp(o.az + o.vz * dt, -1.3, 1.3);
    o.ax = clamp(o.ax + o.vx * dt, -1.3, 1.3);
    o.pivot.rotation.z = o.az;
    o.pivot.rotation.x = o.ax;
    // la bola gira un poco sobre su hilo: los reflejos se deslizan
    o.ball.rotation.y = Math.sin(time * 0.6 + o.phase) * 0.8 + o.az * 1.5 + o.spin * time;
  });
  const F = R.fairy;
  if (F) {
    const c = F.col, tmp = new THREE.Color();
    F.phases.forEach(([ph, sp], i) => {
      const k = 0.55 + 0.45 * Math.max(0, Math.sin(time * sp + ph));
      tmp.setRGB(c.r * k * 1.4, c.g * k * 1.4, c.b * k * 1.4);
      F.mesh.setColorAt(i, tmp);
    });
    F.mesh.instanceColor.needsUpdate = true;
  }
}
// meneo de todas las bolas (al tocar el árbol o al caerle un regalo cerca)
function shakeOrnaments(power = 1) {
  R.ornaments.forEach((o) => { o.vz += rand(-2.5, 2.5) * power; o.vx += rand(-2, 2) * power; });
}

// une varias geometrías no indexadas o indexadas en una sola (una única malla = una sola llamada de dibujo)
function mergeGeometries(list) {
  let nPos = 0, nIdx = 0;
  list.forEach((g) => { nPos += g.attributes.position.count; nIdx += g.index ? g.index.count : g.attributes.position.count; });
  const pos = new Float32Array(nPos * 3), nor = new Float32Array(nPos * 3), idx = new Uint32Array(nIdx);
  let vo = 0, io = 0;
  list.forEach((g) => {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    const n = g.attributes.position.count;
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo; io += g.index.count; }
    else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
    vo += n;
    g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
// Estrella de 12 puntas (largas y cortas) hecha de alambre dorado, en dos planos cruzados
// para que tenga volumen, con lucecitas cálidas a lo largo de cada punta que titilan.
function buildWireStar(parent) {
  MAT.starWire = MAT.starWire || std({ color: lin(0xd8a84c), emissive: lin(0x6a4410), emissiveIntensity: 0.7, metalness: 0.85, roughness: 0.3 });
  const tubes = [], lightsA = [], lightsB = [];
  const P = (r, a, z = 0) => v3(Math.cos(a) * r, Math.sin(a) * r, z);
  [-0.26, 0.26].forEach((yaw, layer) => {
    const rot = new THREE.Matrix4().makeRotationY(yaw);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU + Math.PI / 2;
      const L = i % 2 ? 0.2 : 0.3;
      const inner = P(0.03, a), s1 = P(0.1, a - 0.15), tip = P(L, a), s2 = P(0.1, a + 0.15);
      const path = new THREE.CurvePath();
      [[inner, s1], [s1, tip], [tip, s2], [s2, inner], [inner, tip]].forEach(([u, v]) => path.add(new THREE.LineCurve3(u, v)));
      const g = new THREE.TubeGeometry(path, 50, 0.0032, 4, false);
      g.applyMatrix4(rot);
      tubes.push(g);
      // lucecitas en la varilla central
      (i % 2 ? [0.45, 0.8] : [0.35, 0.62, 0.9]).forEach((t, k) => {
        const q = inner.clone().lerp(tip, t).applyMatrix4(rot);
        ((i + k + layer) % 2 ? lightsA : lightsB).push(q.x, q.y, q.z);
      });
    }
  });
  mesh(mergeGeometries(tubes), MAT.starWire, parent, { cast: false });
  return [lightsA, lightsB].map((arr) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: TEX.glow, color: 0xffe2a8, size: 0.1, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    pts.userData.noRay = true;
    parent.add(pts);
    return pts;
  });
}

function buildTree() {
  const root = group(scene, [-2.15, 0, 1.0]);
  const pts = [[0.001, 0], [0.33, 0], [0.42, 0.52], [0.45, 0.54], [0.44, 0.56], [0.001, 0.56]].map(([r, y]) => new THREE.Vector2(r, y));
  mesh(new THREE.LatheGeometry(pts, 40), MAT.metal, root);
  mesh(new THREE.TorusGeometry(0.425, 0.025, 8, 40), MAT.metal, root, { p: [0, 0.54, 0], r: [Math.PI / 2, 0, 0] });
  [0.18, 0.36].forEach((y) => mesh(new THREE.TorusGeometry(0.36 + y * 0.12, 0.012, 6, 40), MAT.darkMetal, root, { p: [0, y, 0], r: [Math.PI / 2, 0, 0] }));
  mesh(GEO.cyl, MAT.snow, root, { p: [0, 0.55, 0], s: [0.41, 0.02, 0.41] });

  const sway = group(root, [0, 0.55, 0]);
  const tree = group(sway);
  mesh(GEO.cyl, MAT.bark, tree, { p: [0, 0.15, 0], s: [0.07, 0.3, 0.07] });
  const tiers = [{ y: 0.2, r: 0.95, h: 1.0 }, { y: 0.68, r: 0.78, h: 0.9 }, { y: 1.12, r: 0.58, h: 0.78 }, { y: 1.5, r: 0.38, h: 0.62 }];
  tiers.forEach((t, i) => {
    // abeto más verde y con solo un toque de nieve en las puntas
    const geo = branchTierGeometry(i * 2.3 + 1, { branches: 11, snow: 0.3, dark: 0x0f3b24, light: 0x3c8a57 });
    mesh(geo, MAT.xmasPine, tree, { p: [0, t.y + t.h / 2, 0], s: [t.r, t.h, t.r] });
  });

  const radiusAt = (y) => {
    for (let i = tiers.length - 1; i >= 0; i--) {
      const t = tiers[i];
      if (y >= t.y && y <= t.y + t.h) return t.r * (1 - (y - t.y) / t.h);
    }
    return 0.1;
  };

  // radio suavizado (sin saltos entre pisos) para que la cinta y las cadenetas fluyan
  const radiusSmooth = (y) => {
    let acc = 0;
    for (let k = -4; k <= 4; k++) acc += radiusAt(y + k * 0.03);
    return acc / 9;
  };
  // cinta de raso roja y ancha que baja en espiral, con ondas
  tree.add(ribbonSpiral((tt) => {
    const y = 0.3 + tt * 1.68;
    const ang = tt * TAU * 2.7 + 0.5;
    return [ang, y, radiusSmooth(y) * 0.98 + 0.035];
  }, 0.08));
  // cadenetas de cuentas doradas que cuelgan en guirnaldas
  tree.add(beadSwags(radiusSmooth, [[0.5, 0.0, 8], [0.98, 0.5, 7], [1.42, 0.2, 6], [1.78, 0.9, 4]]));

  // luces
  const palette = XMAS_LIGHTS;
  R.treeLights = [];
  for (let i = 0; i < 44; i++) {
    const tt = i / 44;
    const y = 0.28 + tt * 1.7;
    const r = radiusAt(y) * 0.94 + 0.02;
    const a = tt * TAU * 4.6 + 1.2;
    const color = palette[i % palette.length];
    const bulbMat = new THREE.MeshStandardMaterial({ color: lin(color), emissive: lin(color), emissiveIntensity: 1.2, roughness: 0.3 });
    const p = [Math.cos(a) * r, y, Math.sin(a) * r];
    const bulb = mesh(GEO.sphereLo, bulbMat, tree, { p, s: 0.032, cast: false });
    bulb.userData.noCollide = true;
    const glow = glowSprite(tree, color, 0.26, p, 0.8);
    R.treeLights.push({ bulb, glow, mat: bulbMat, phase: rand(0, TAU), index: i });
  }

  // bolas de Navidad: muchas, de tamaños y acabados distintos, colgando de un hilo (péndulo)
  R.ornaments = [];
  const ORN = [0xb3121e, 0xd4a537, 0xe9d3a0, 0xd8dde6, 0x7a0e1c, 0xb3121e, 0xd4a537, 0x1d6b3a];
  const perTier = [13, 11, 9, 5];
  tiers.forEach((t, ti) => {
    const n = perTier[ti];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + ti * 0.55 + rand(-0.15, 0.15);
      const y = t.y + t.h * rand(0.05, ti === 3 ? 0.4 : 0.55);
      const cx = Math.cos(a), cz = Math.sin(a);
      // no tapar el cardenal
      if (Math.hypot(cx * 0.6 + 0.42, y - 0.98, cz * 0.6 - 0.4) < 0.28) continue;
      const big = 1 - ti * 0.17;
      const r = rand(0.04, 0.068) * big;
      const hang = rand(0.03, 0.075);
      const yb = y - hang - r;
      const rad = Math.max(radiusAt(y) * 0.94, radiusAt(yb) + r * 0.9);
      R.ornaments.push(makeOrnament(tree, [cx * rad, y, cz * rad], {
        color: ORN[(k * 3 + ti) % ORN.length], r, hang, finish: pick(['gloss', 'gloss', 'gloss', 'satin', 'glitter', 'glitter']),
        drop: Math.random() < 0.18,
      }));
    }
  });
  // lazos rojos sobre la cinta y uno grande en la punta
  [0.08, 0.22, 0.36, 0.5, 0.64, 0.8].forEach((tt, i) => {
    const y = 0.3 + tt * 1.68;
    const ang = tt * TAU * 2.7 + 0.5;
    const rr = radiusSmooth(y) * 0.98 + 0.06;
    ribbonBow(tree, [Math.cos(ang) * rr, y + 0.02, Math.sin(ang) * rr], MAT.velvetRed, 1.9 - i * 0.12, [0, -ang + Math.PI / 2, 0]);
  });
  ribbonBow(tree, [0, 1.96, 0.13], MAT.velvetRed, 2.1, [0, 0, 0]);
  // lucecitas blancas cálidas por todo el árbol (titilan)
  R.fairy = fairyLights(radiusAt, 90);
  tree.add(R.fairy.mesh);
  root.updateMatrixWorld(true);
  R.ornaments.forEach((o) => { o.wp = worldOf(o.ball); });

  // estrella de alambre dorado con lucecitas, sobre una espiral que la sujeta a la punta
  const starRoot = makeReact(group(tree, [0, 2.4, 0]), 'treeStar', 'La estrella del árbol');
  const star = group(starRoot);
  R.starLights = buildWireStar(star);
  R.starGlow = glowSprite(starRoot, 0xffd27a, 0.55, [0, 0, 0], 0.4);
  {
    const pts = [];
    for (let i = 0; i <= 160; i++) {
      const t = i / 160, a = t * TAU * 7;
      const r = lerp(0.075, 0.018, t);
      pts.push(v3(Math.cos(a) * r, lerp(-0.4, -0.07, t), Math.sin(a) * r));
    }
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 320, 0.006, 5), MAT.starWire, starRoot, { cast: false });
    mesh(GEO.cyl, MAT.starWire, starRoot, { p: [0, -0.2, 0], s: [0.006, 0.34, 0.006], cast: false });
  }
  const starLight = new THREE.PointLight(0xffc36a, 0.75, 4, 2);
  starRoot.add(starLight);
  // resplandor de las bombillas del árbol sobre la nieve, los juguetes y los regalos
  const treeGlow = new THREE.PointLight(0xffa860, 1.6, 4.8, 2);
  treeGlow.position.set(0.3, 1.0, 0.6);
  root.add(treeGlow);
  R.treeGlow = treeGlow;
  R.star = star;

  // cardenal posado en una rama
  R.cardinal = makeBird(tree, { p: [-0.42, 0.98, 0.4], yaw: -2.3, species: 'cardinal', size: 1.5 });
  makeReact(R.cardinal.root, 'cardinal', 'Un cardenal');

  R.tree = { root, sway, tree };
  makeReact(tree, 'tree', 'El árbol de Navidad');
}

// ---------- Regalo 3D con tapa que se abre ----------
function makeGift(parent, w, h, d, paper, ribbonMat, p) {
  const root = group(parent, p);
  const bodyH = h * 0.82;
  mesh(GEO.box, paper, root, { p: [0, bodyH / 2, 0], s: [w, bodyH, d] });
  mesh(GEO.box, ribbonMat, root, { p: [0, bodyH / 2, 0], s: [w * 0.16, bodyH * 1.005, d * 1.01] });
  mesh(GEO.box, ribbonMat, root, { p: [0, bodyH / 2, 0], s: [w * 1.01, bodyH * 1.005, d * 0.16] });
  const lid = group(root, [0, bodyH, -d / 2]);
  const lidH = h * 0.18;
  mesh(GEO.box, paper, lid, { p: [0, lidH / 2, d / 2], s: [w * 1.07, lidH, d * 1.07] });
  mesh(GEO.box, ribbonMat, lid, { p: [0, lidH / 2, d / 2], s: [w * 0.17, lidH * 1.02, d * 1.08] });
  mesh(GEO.box, ribbonMat, lid, { p: [0, lidH / 2, d / 2], s: [w * 1.08, lidH * 1.02, d * 0.17] });
  // geometría del lazo compartida (antes se creaba una nueva por regalo)
  if (!GEO.loop) GEO.loop = new THREE.TorusGeometry(1, 0.25, 8, 20);
  const ls = Math.min(w, d) * 0.16;
  mesh(GEO.loop, ribbonMat, lid, { p: [-w * 0.1, lidH + Math.min(w, d) * 0.12, d / 2], r: [0, 0.4, 0.5], s: ls });
  mesh(GEO.loop, ribbonMat, lid, { p: [w * 0.1, lidH + Math.min(w, d) * 0.12, d / 2], r: [0, -0.4, -0.5], s: ls });
  mesh(GEO.sphere, ribbonMat, lid, { p: [0, lidH + 0.01, d / 2], s: Math.min(w, d) * 0.07 });
  return { root, lid, bodyH, w, h, d };
}

// un único material dorado para todos los lazos (crear materiales en cada regalo es lento)
let ribbonGoldMat = null;
const ribbonGold = () => ribbonGoldMat || (ribbonGoldMat = std({ color: 0xe8b23a, roughness: 0.3, metalness: 0.5 }));

// ---------- Caseta, banco y todo lo que hay en ella ----------
function buildShed() {
  const shed = group(scene, [1.45, 0, -2.1], [0, 0.3, 0]);
  R.shed = shed;
  const Wd = 3.6, D = 2.4, Hh = 2.3, PEAK = 3.45, OV = 0.35;
  const slope = Math.atan2(PEAK - Hh, D / 2);
  const front = D / 2;

  // paredes
  mesh(GEO.box, MAT.wall, shed, { p: [0, Hh / 2, front], s: [Wd, Hh, 0.12] });
  mesh(GEO.box, MAT.wall, shed, { p: [0, Hh / 2, -front], s: [Wd, Hh, 0.12] });
  // pared lateral izquierda con el hueco de la puerta (ver buildShedDoor)
  {
    const z0 = SHED_DOOR.z - SHED_DOOR.w / 2, z1 = SHED_DOOR.z + SHED_DOOR.w / 2;
    mesh(GEO.box, MAT.wall, shed, { p: [-Wd / 2, Hh / 2, (-front + z0) / 2], s: [0.12, Hh, z0 + front] });
    mesh(GEO.box, MAT.wall, shed, { p: [-Wd / 2, Hh / 2, (z1 + front) / 2], s: [0.12, Hh, front - z1] });
    mesh(GEO.box, MAT.wall, shed, { p: [-Wd / 2, (Hh + SHED_DOOR.h) / 2, SHED_DOOR.z], s: [0.12, Hh - SHED_DOOR.h, SHED_DOOR.w] });
  }
  mesh(GEO.box, MAT.wall, shed, { p: [Wd / 2, Hh / 2, 0], s: [0.12, Hh, D] });
  const tri = new THREE.Shape();
  tri.moveTo(-front, 0); tri.lineTo(front, 0); tri.lineTo(0, PEAK - Hh); tri.lineTo(-front, 0);
  const gable = new THREE.ExtrudeGeometry(tri, { depth: 0.12, bevelEnabled: false });
  [-Wd / 2 - 0.06, Wd / 2 - 0.06].forEach((x) => mesh(gable, MAT.wall, shed, { p: [x, Hh, 0], r: [0, Math.PI / 2, 0] }));
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => mesh(GEO.box, MAT.post, shed, { p: [sx * Wd / 2, Hh / 2, sz * front], s: [0.18, Hh, 0.18] }));
  mesh(GEO.box, MAT.post, shed, { p: [0, 0.1, front + 0.02], s: [Wd + 0.2, 0.2, 0.16] });

  // tejado de tejas + capa de nieve
  const halfDepth = front + OV;
  const panelLen = Math.hypot(halfDepth, halfDepth * Math.tan(slope)) + 0.05;
  const eaveY = PEAK - halfDepth * Math.tan(slope);
  [1, -1].forEach((side) => {
    const cz = side * halfDepth / 2;
    const cy = (PEAK + eaveY) / 2;
    const normal = new THREE.Vector3(0, Math.cos(slope), side * Math.sin(slope));
    mesh(GEO.box, MAT.roof, shed, { p: [0, cy + 0.04, cz], r: [side * slope, 0, 0], s: [Wd + OV * 2, 0.1, panelLen] });
    const snow = mesh(GEO.box, MAT.snow, shed, { p: [0, cy + 0.04 + normal.y * 0.12, cz + normal.z * 0.12], r: [side * slope, 0, 0], s: [Wd + OV * 2 + 0.06, 0.15, panelLen + 0.06] });
    if (side === 1) R.roofSnowPanel = snow;
  });
  // rodillos de nieve de la cumbrera y del alero: decorativos (los regalos no se quedan en equilibrio encima)
  mesh(GEO.cyl, MAT.snow, shed, { p: [0, PEAK + 0.2, 0], r: [0, 0, Math.PI / 2], s: [0.13, Wd + OV * 2 + 0.05, 0.13] }).userData.noCollide = true;
  mesh(GEO.cyl, MAT.snow, shed, { p: [0, eaveY + 0.07, halfDepth + 0.02], r: [0, 0, Math.PI / 2], s: [0.1, Wd + OV * 2 + 0.06, 0.1] }).userData.noCollide = true;
  mesh(GEO.box, MAT.post, shed, { p: [0, eaveY - 0.04, halfDepth - 0.02], s: [Wd + OV * 2, 0.12, 0.05] });

  // placa de nieve que puede resbalar
  const chunk = makeReact(group(shed, [-0.9, 0, 0]), 'roofSnow', 'Nieve sobre el tejado');
  const zc = halfDepth * 0.55;
  const yc = PEAK - zc * Math.tan(slope) + 0.36;
  const chunkInner = group(chunk, [0, yc, zc]);   // el grupo está en el centro de la placa: así puede volcar al caer
  mesh(GEO.sphere, MAT.snow, chunkInner, { r: [slope, 0, 0], s: [0.55, 0.12, 0.42] });
  mesh(GEO.sphere, MAT.snow, chunkInner, { p: [0.35, 0.02, -0.1], r: [slope, 0, 0], s: [0.3, 0.1, 0.3] });
  R.roofChunk = { inner: chunkInner, slope, base: v3(0, yc, zc), offX: -0.9, slideDist: (halfDepth - zc) / Math.cos(slope) + 0.08 };

  // carámbanos + guirnalda de luces del alero
  const eave = makeReact(group(shed), 'eave', 'Carámbanos y luces del alero');
  eave.userData.noCollide = true;
  R.icicles = [];
  for (let x = -Wd / 2 - OV + 0.12; x < Wd / 2 + OV - 0.1; x += rand(0.12, 0.24)) {
    const len = rand(0.08, 0.38);
    const ic = mesh(GEO.cone, MAT.ice, eave, { p: [x, eaveY - 0.06 - len / 2, halfDepth - 0.02], r: [Math.PI, 0, 0], s: [0.022, len, 0.022], cast: false });
    R.icicles.push({ mesh: ic, tip: new THREE.Vector3(x, eaveY - 0.06 - len, halfDepth - 0.02) });
  }
  const wirePts = [];
  const nb = 16;
  for (let i = 0; i <= nb * 4; i++) {
    const t = i / (nb * 4);
    const x = -Wd / 2 - OV + 0.1 + t * (Wd + OV * 2 - 0.2);
    const sag = Math.abs(Math.sin(t * nb * Math.PI)) * 0.07;
    wirePts.push(new THREE.Vector3(x, eaveY - 0.08 - sag, halfDepth + 0.03));
  }
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(wirePts), 200, 0.008, 5), std({ color: 0x1a1410 }), eave, { cast: false });
  const bulbColors = XMAS_LIGHTS;
  R.eaveLights = [];
  for (let i = 0; i <= nb; i++) {
    const x = -Wd / 2 - OV + 0.1 + (i / nb) * (Wd + OV * 2 - 0.2);
    const pivot = group(eave, [x, eaveY - 0.09, halfDepth + 0.03]);
    const color = bulbColors[i % bulbColors.length];
    const mat = new THREE.MeshStandardMaterial({ color: lin(color), emissive: lin(color), emissiveIntensity: 1.2, roughness: 0.3 });
    mesh(GEO.cyl, MAT.darkMetal, pivot, { p: [0, -0.02, 0], s: [0.015, 0.03, 0.015], cast: false });
    const bulb = mesh(GEO.sphere, mat, pivot, { p: [0, -0.07, 0], s: [0.03, 0.045, 0.03], cast: false });
    const glow = glowSprite(pivot, color, 0.3, [0, -0.07, 0], 0.8);
    R.eaveLights.push({ pivot, bulb, glow, mat, phase: rand(0, TAU), index: i });
  }
  // la guirnalda tiñe de colores la pared, el banco y la nieve de delante
  R.eaveGlows = [[-1.5, XMAS_LIGHTS[0]], [-0.5, XMAS_LIGHTS[1]], [0.5, XMAS_LIGHTS[2]], [1.5, XMAS_LIGHTS[3]]].map(([x, col]) => {
    const l = new THREE.PointLight(col, 0.55, 2.6, 2);
    l.position.set(x, eaveY - 0.25, halfDepth + 0.35);
    shed.add(l);
    return l;
  });
  decorateShed(shed, { Wd, Hh, PEAK, OV, slope, halfDepth, eaveY });
  buildShedDoor(shed, Wd);

  // chimenea de estufa
  const chimney = makeReact(group(shed, [1.1, PEAK - 0.5 * Math.tan(slope), -0.5]), 'chimney', 'La chimenea');
  const chimInner = group(chimney);
  mesh(GEO.cyl, MAT.darkMetal, chimInner, { p: [0, 0.45, 0], s: [0.1, 1.1, 0.1] });
  mesh(GEO.cyl, MAT.darkMetal, chimInner, { p: [0, 1.02, 0], s: [0.17, 0.07, 0.17] });
  mesh(GEO.cone, MAT.darkMetal, chimInner, { p: [0, 1.12, 0], s: [0.2, 0.1, 0.2] });
  mesh(GEO.sphere, MAT.snow, chimInner, { p: [0, 1.16, 0], s: [0.17, 0.05, 0.17] });
  R.chimney = { root: chimney, inner: chimInner, top: new THREE.Vector3(0, 1.2, 0) };

  // ventana con interior iluminado y osito
  const winP = [0.95, 1.55, front];
  const win = makeReact(group(shed, winP), 'window', 'La ventana');
  const interiorTex = canvasTexture(256, 200, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w * 0.55, h * 0.75, 10, w * 0.55, h * 0.7, w * 0.8);
    g.addColorStop(0, '#ffe2a0'); g.addColorStop(0.45, '#d98c3e'); g.addColorStop(1, '#3a2414');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2a1a0f'; ctx.fillRect(10, 74, 110, 6);
    ['#6b4a30', '#7d5a3c', '#5c3f29'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(16 + i * 30, 40 - i * 6, 20, 34 + i * 6); });
  });
  const interiorMat = new THREE.MeshBasicMaterial({ map: interiorTex, color: 0x9a8070 });
  mesh(GEO.plane, interiorMat, win, { p: [0, 0, 0.065], s: [0.92, 0.72, 1], cast: false });
  const teddy = group(win, [0.18, -0.24, 0.1]);
  const bear = MAT.fur.bear;
  mesh(GEO.sphere, bear, teddy, { p: [0, 0.07, 0], s: [0.07, 0.08, 0.05] });
  mesh(GEO.sphere, bear, teddy, { p: [0, 0.18, 0], s: 0.055 });
  [-1, 1].forEach((s) => mesh(GEO.sphere, bear, teddy, { p: [s * 0.04, 0.23, 0], s: 0.022 }));
  mesh(GEO.sphere, MAT.cream, teddy, { p: [0, 0.165, 0.045], s: [0.025, 0.02, 0.015] });
  [-1, 1].forEach((s) => mesh(GEO.sphereLo, MAT.black, teddy, { p: [s * 0.02, 0.19, 0.05], s: 0.007, cast: false }));
  mesh(GEO.box, MAT.red, teddy, { p: [0, 0.12, 0.02], s: [0.1, 0.02, 0.06] });
  const teddyArm = group(teddy, [0.06, 0.1, 0], [0, 0, -0.4]);
  mesh(GEO.sphere, bear, teddyArm, { p: [0.03, 0.04, 0], s: [0.022, 0.05, 0.022] });
  const glass = std({ color: 0xfff1d8, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.16 });
  mesh(GEO.plane, glass, win, { p: [0, 0, 0.13], s: [0.92, 0.72, 1], cast: false });
  const frameMat = std({ color: 0xe9dfcc, roughness: 0.6 });
  [[0, 0.39, 1.04, 0.07], [0, -0.39, 1.04, 0.07], [-0.49, 0, 0.07, 0.85], [0.49, 0, 0.07, 0.85], [0, 0, 0.04, 0.72], [0, 0.02, 0.92, 0.04]]
    .forEach(([x, y, sx, sy]) => mesh(GEO.box, frameMat, win, { p: [x, y, 0.13], s: [sx, sy, 0.08] }));
  mesh(GEO.box, frameMat, win, { p: [0, -0.45, 0.17], s: [1.16, 0.06, 0.2] });
  mesh(GEO.box, MAT.snow, win, { p: [0, -0.4, 0.18], s: [1.12, 0.05, 0.18] });
  const winLight = new THREE.PointLight(0xffa04a, 1.8, 6.5, 2);
  winLight.position.set(0, -0.1, 0.9);
  win.add(winLight);
  R.window = { root: win, interiorMat, teddy, teddyArm, light: winLight };

  // corona de acebo con campanillas
  const wreathWind = group(shed, [-0.55, 1.98, front + 0.08]);
  const wreath = makeReact(group(wreathWind), 'wreath', 'La corona');
  const wreathRing = group(wreath, [0, -0.3, 0]);
  mesh(new THREE.TorusGeometry(0.26, 0.08, 12, 32), MAT.needles, wreathRing);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    mesh(GEO.sphereLo, MAT.redGloss, wreathRing, { p: [Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0.08], s: 0.03 });
  }
  [-1, 1].forEach((s) => mesh(GEO.cone, MAT.red, wreathRing, { p: [s * 0.07, -0.27, 0.08], r: [0, 0, s * Math.PI / 2], s: [0.05, 0.12, 0.03] }));
  mesh(GEO.sphere, MAT.red, wreathRing, { p: [0, -0.27, 0.09], s: 0.035 });
  R.bells = [-1, 1].map((s) => {
    const pivot = group(wreathRing, [s * 0.04, -0.3, 0.08]);
    mesh(GEO.cone, MAT.gold, pivot, { p: [0, -0.07, 0], s: [0.04, 0.07, 0.04] });
    mesh(GEO.sphereLo, MAT.gold, pivot, { p: [0, -0.11, 0], s: 0.012 });
    return pivot;
  });
  R.wreath = { wind: wreathWind, root: wreath };

  // casita de pájaros colgando del alero
  const bhY = PEAK - (front + 0.2) * Math.tan(slope) - 0.06;
  const bhWind = group(shed, [-1.15, bhY, front + 0.2]);
  const birdhouse = makeReact(group(bhWind), 'birdhouse', 'La casita de pájaros');
  mesh(GEO.cyl, MAT.black, birdhouse, { p: [0, -0.15, 0], s: [0.006, 0.3, 0.006], cast: false });
  const bhRed = std({ map: TEX.post, color: 0xd04a3a, roughness: 0.8 });
  mesh(GEO.box, bhRed, birdhouse, { p: [0, -0.46, 0], s: [0.24, 0.26, 0.2] });
  [-1, 1].forEach((s) => mesh(GEO.box, MAT.post, birdhouse, { p: [s * 0.075, -0.3, 0], r: [0, 0, s * -0.75], s: [0.2, 0.025, 0.25] }));
  [-1, 1].forEach((s) => mesh(GEO.box, MAT.snow, birdhouse, { p: [s * 0.07, -0.275, 0], r: [0, 0, s * -0.75], s: [0.19, 0.025, 0.24] }));
  mesh(new THREE.CircleGeometry(0.04, 20), MAT.black, birdhouse, { p: [0, -0.43, 0.101], cast: false });
  mesh(GEO.cyl, MAT.post, birdhouse, { p: [0, -0.51, 0.13], r: [Math.PI / 2, 0, 0], s: [0.008, 0.07, 0.008] });
  const peek = group(birdhouse, [0, -0.43, 0.08]);
  mesh(GEO.sphere, MAT.black, peek, { s: 0.035 });
  mesh(GEO.sphere, MAT.cream, peek, { p: [0.0, -0.01, 0.02], s: [0.025, 0.015, 0.02] });
  mesh(GEO.cone, MAT.black, peek, { p: [0, 0, 0.04], r: [Math.PI / 2, 0, 0], s: [0.01, 0.03, 0.01] });
  peek.scale.setScalar(0.001);
  R.birdhouse = { wind: bhWind, root: birdhouse, peek };

  // arrendajo azul sobre la nieve del tejado
  const jz = halfDepth * 0.72;
  R.jay = makeBird(shed, { p: [-1.45, PEAK - jz * Math.tan(slope) + 0.27, jz], yaw: -0.3, species: 'jay', size: 1.6 });
  R.jay.slope = slope;
  makeReact(R.jay.root, 'jay', 'Un arrendajo azul');
  buildNest(shed, { slope, PEAK, halfDepth, Wd });
  // segundo pájaro del nido, de otro color: un cardenal rojo en el otro lado del tejado
  const rz = halfDepth * 0.62;
  R.roofBird = makeBird(shed, { p: [0.55, PEAK - rz * Math.tan(slope) + 0.27, rz], yaw: 0.4, species: 'cardinal', size: 1.45 });
  makeReact(R.roofBird.root, 'roofBird', 'Un cardenal');

  // herramientas apoyadas en la pared
  const shovel = makeReact(group(shed, [-1.6, 0, front + 0.4], [-0.17, 0, 0.05]), 'shovel', 'La pala');
  const shovelInner = group(shovel);
  mesh(GEO.cyl, MAT.bench, shovelInner, { p: [0, 0.85, 0], s: [0.022, 1.3, 0.022] });
  mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16, Math.PI), MAT.bench, shovelInner, { p: [0, 1.5, 0] });
  mesh(GEO.box, MAT.metal, shovelInner, { p: [0, 0.16, 0], s: [0.24, 0.32, 0.02] });
  R.shovel = shovelInner;

  const rake = makeReact(group(shed, [-1.36, 0, front + 0.38], [-0.15, 0, -0.06]), 'rake', 'El rastrillo');
  const rakeInner = group(rake);
  mesh(GEO.cyl, MAT.bench, rakeInner, { p: [0, 0.75, 0], s: [0.02, 1.5, 0.02] });
  const tines = group(rakeInner, [0, 1.5, 0]);
  tines.userData.noCollide = true;
  for (let i = 0; i < 9; i++) {
    const a = (i / 8 - 0.5) * 1.1;
    mesh(GEO.cyl, MAT.metal, tines, { p: [Math.sin(a) * 0.14, 0.13, 0], r: [0, 0, -a], s: [0.005, 0.28, 0.005], cast: false });
  }
  mesh(GEO.box, MAT.metal, tines, { p: [0, 0.02, 0], s: [0.12, 0.03, 0.02] });
  R.rake = { inner: rakeInner, tines };

  buildBench(shed, front);
}

function buildBench(shed, front) {
  const bench = group(shed, [0.1, 0, front + 0.42]);
  mesh(GEO.box, MAT.bench, bench, { p: [0, 0.98, 0], s: [2.7, 0.07, 0.62] });
  mesh(GEO.box, MAT.bench, bench, { p: [0, 0.91, 0.29], s: [2.7, 0.12, 0.04] });
  [[-1.25, -0.25], [1.25, -0.25], [-1.25, 0.26], [1.25, 0.26]].forEach(([x, z]) => mesh(GEO.box, MAT.post, bench, { p: [x, 0.48, z], s: [0.08, 0.96, 0.08] }));
  mesh(GEO.box, MAT.bench, bench, { p: [0, 0.3, 0], s: [2.6, 0.05, 0.56] });
  mesh(GEO.sphere, MAT.snow, bench, { p: [-1.18, 1.02, 0.15], s: [0.18, 0.03, 0.12], cast: false });
  mesh(GEO.sphere, MAT.snow, bench, { p: [0.95, 1.02, -0.18], s: [0.22, 0.03, 0.1], cast: false });
  const top = 1.015;
  const low = 0.325;

  // regadera
  const can = makeReact(group(bench, [-0.98, top, -0.02]), 'can', 'La regadera');
  const canInner = group(can, [0.17, 0, 0]);
  const canBody = group(canInner, [-0.17, 0, 0]);
  const canPts = [[0.001, 0], [0.13, 0], [0.12, 0.26], [0.1, 0.27], [0.001, 0.27]].map(([r, y]) => new THREE.Vector2(r, y));
  mesh(new THREE.LatheGeometry(canPts, 32), MAT.metal, canBody);
  mesh(GEO.cyl, MAT.metal, canBody, { p: [0.17, 0.2, 0], r: [0, 0, -0.9], s: [0.02, 0.32, 0.02] });
  mesh(GEO.cyl, MAT.metal, canBody, { p: [0.3, 0.3, 0], r: [0, 0, -0.9], s: [0.04, 0.04, 0.04] });
  mesh(new THREE.TorusGeometry(0.1, 0.012, 8, 20, Math.PI), MAT.metal, canBody, { p: [-0.02, 0.27, 0] });
  R.can = { inner: canInner, spout: new THREE.Vector3(0.32, 0.3, 0), body: canBody };

  // maceta con acebo y carbonero
  const holly = makeReact(group(bench, [-0.48, top, 0]), 'holly', 'El acebo');
  const potPts = [[0.001, 0], [0.09, 0], [0.12, 0.2], [0.135, 0.21], [0.135, 0.25], [0.12, 0.25], [0.11, 0.23], [0.001, 0.23]].map(([r, y]) => new THREE.Vector2(r, y));
  const potGeo = new THREE.LatheGeometry(potPts, 32);
  mesh(potGeo, MAT.clay, holly);
  const leaves = group(holly, [0, 0.23, 0]);
  const leafGeo = new THREE.SphereGeometry(1, 10, 6);
  for (let i = 0; i < 18; i++) {
    const a = rand(0, TAU), r = rand(0.02, 0.14), y = rand(0.04, 0.24);
    const leaf = group(leaves, [Math.cos(a) * r, y, Math.sin(a) * r], [rand(-0.6, 0.6), a, rand(-0.6, 0.6)]);
    mesh(leafGeo, MAT.leaf, leaf, { s: [0.07, 0.012, 0.035] });
  }
  for (let i = 0; i < 9; i++) {
    const a = rand(0, TAU), r = rand(0.03, 0.1);
    mesh(GEO.sphereLo, MAT.redGloss, leaves, { p: [Math.cos(a) * r, rand(0.12, 0.26), Math.sin(a) * r], s: 0.022 });
  }
  R.holly = { leaves };
  R.chickadee = makeBird(holly, { p: [0.03, 0.47, 0.02], yaw: 0.9, species: 'chickadee', size: 1.3 });
  makeReact(R.chickadee.root, 'chickadee', 'Un carbonero');

  // regalo grande con sorpresa de muelle
  const jackG = makeGift(bench, 0.38, 0.32, 0.32, MAT.papers[0], ribbonGold(), [0.12, top, 0]);
  makeReact(jackG.root, 'jackGift', 'Un regalo grande');
  const jack = group(jackG.root, [0, jackG.bodyH - 0.05, 0]);
  const spring = [];
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    spring.push(new THREE.Vector3(Math.cos(t * TAU * 5) * 0.04, t * 0.3, Math.sin(t * TAU * 5) * 0.04));
  }
  mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spring), 120, 0.006, 5), MAT.metal, jack);
  const jStar = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + Math.PI / 2, rr = i % 2 ? 0.045 : 0.1;
    if (i === 0) jStar.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else jStar.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const jsGeo = new THREE.ExtrudeGeometry(jStar, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.008, bevelSegments: 2 });
  jsGeo.center();
  mesh(jsGeo, std({ color: 0xf2c14e, emissive: 0xc88a1a, emissiveIntensity: 0.4, metalness: 0.5, roughness: 0.3 }), jack, { p: [0, 0.38, 0] });
  jack.scale.set(1, 0.001, 1);
  R.jackGift = { ...jackG, jack };

  // ardilla con su bellota
  buildSquirrel(bench, [0.62, top, 0.02]);

  // regalo pequeño de confeti
  const confG = makeGift(bench, 0.2, 0.2, 0.2, MAT.papers[1], MAT.red, [1.0, top, 0.05]);
  makeReact(confG.root, 'confettiGift', 'Un regalo pequeño');
  R.confettiGift = confG;

  // balda inferior: maceta boca abajo con ratón, caja de música, semillas, macetas
  const mousePot = makeReact(group(bench, [-0.95, low, 0]), 'mousePot', 'Una maceta boca abajo');
  const mouse3d = group(mousePot);
  mesh(GEO.sphere, MAT.fur.gray, mouse3d, { p: [0, 0.05, 0], s: [0.07, 0.045, 0.045] });
  mesh(GEO.sphere, MAT.fur.gray, mouse3d, { p: [0.07, 0.07, 0], s: 0.035 });
  [-1, 1].forEach((s) => mesh(GEO.sphere, MAT.pink, mouse3d, { p: [0.06, 0.11, s * 0.025], s: [0.012, 0.025, 0.022] }));
  mesh(GEO.sphereLo, MAT.pink, mouse3d, { p: [0.105, 0.065, 0], s: 0.008 });
  [-1, 1].forEach((s) => makeEye(mouse3d, [0.09, 0.08, s * 0.018], 0.007));
  mouse3d.scale.setScalar(0.001);
  const upPot = group(mousePot);
  const upPotInner = group(upPot, [0, 0.25, 0], [Math.PI, 0, 0]);
  mesh(potGeo, MAT.clay, upPotInner);
  R.mousePot = { pot: upPot, mouse: mouse3d };

  const music = makeGift(bench, 0.26, 0.17, 0.2, MAT.papers[2], MAT.cream, [-0.35, low, 0]);
  makeReact(music.root, 'musicBox', 'Una caja de música');
  const musicStar = group(music.root, [0, 0.12, 0]);
  mesh(jsGeo, std({ color: 0xffe08a, emissive: 0xd9a52e, emissiveIntensity: 0.5, metalness: 0.5, roughness: 0.3 }), musicStar, { s: 0.7 });
  musicStar.scale.setScalar(0.001);
  R.musicBox = { ...music, star: musicStar };

  const seed = makeReact(group(bench, [0.3, low, 0]), 'seedBag', 'Semillas de ilusión');
  const seedInner = group(seed, [0.1, 0, 0]);
  const seedBody = group(seedInner, [-0.1, 0, 0]);
  const bagPts = [[0.001, 0], [0.11, 0], [0.12, 0.12], [0.1, 0.22], [0.07, 0.25], [0.085, 0.29], [0.001, 0.29]].map(([r, y]) => new THREE.Vector2(r, y));
  mesh(new THREE.LatheGeometry(bagPts, 24), MAT.burlap, seedBody);
  const seedLabel = labelTexture([
    { text: 'semillas', font: 'italic 700 46px Fraunces, Georgia, serif', color: '#5e3c1c', y: 0.38 },
    { text: 'de ilusión', font: 'italic 700 40px Fraunces, Georgia, serif', color: '#5e3c1c', y: 0.72 },
  ], { bg: '#efe1c2' });
  mesh(GEO.plane, std({ map: seedLabel, roughness: 0.9 }), seedBody, { p: [0, 0.12, 0.118], s: [0.17, 0.085, 1], cast: false });
  const sprout = group(seedBody, [0, 0.27, 0]);
  mesh(GEO.cyl, MAT.leaf, sprout, { p: [0, 0.06, 0], s: [0.006, 0.12, 0.006] });
  [-1, 1].forEach((s) => mesh(leafGeo, MAT.leaf, sprout, { p: [s * 0.03, 0.12, 0], r: [0, 0, s * 0.5], s: [0.04, 0.008, 0.02] }));
  sprout.scale.setScalar(0.001);
  R.seedBag = { inner: seedInner, sprout, mouth: new THREE.Vector3(0.1, 0.29, 0) };

  const pots = makeReact(group(bench, [0.9, low, 0]), 'pots', 'Macetas de barro');
  R.pots = [[-0.14, 1], [0.12, 0.8], [0.0, 0.7]].map(([x, s], i) => {
    const pot = group(pots, [x, i === 2 ? 0.2 : 0, i === 2 ? -0.1 : 0]);
    mesh(potGeo, MAT.clay, pot, { s });
    return pot;
  });
}

function buildSquirrel(parent, p) {
  const root = makeReact(group(parent, p, [0, -0.5, 0]), 'squirrel', 'Una ardilla');
  const body = group(root);
  const RUST = [176, 92, 46], GREY = [150, 136, 128], CREAM = [242, 234, 220], DARK = [120, 62, 32];
  // sentada: la columna va hacia arriba (el "dorso" queda detrás)
  furPart(body, [
    { x: 0.0, y: 0.015, h: 0.01, w: 0.01 },
    { x: 0.0, y: 0.04, h: 0.07, b: 0.068, w: 0.07 },
    { x: 0.0, y: 0.11, h: 0.082, b: 0.078, w: 0.078 },
    { x: 0.012, y: 0.2, h: 0.066, b: 0.058, w: 0.062 },
    { x: 0.022, y: 0.27, h: 0.048, b: 0.044, w: 0.048 },
    { x: 0.026, y: 0.305, h: 0.01, w: 0.01 },
  ], {
    seg: 20, fur: [0.014, 6, 0.3],
    color: (s, ang) => {
      let c = mixC(RUST, GREY, smooth01(0.6, 1.5, ang) * 0.7);   // flancos grisáceos
      return mixC(c, CREAM, smooth01(2.0, 2.6, ang));           // vientre blanco
    },
  });
  // ancas, pies y manitas
  [-1, 1].forEach((s) => {
    furPart(body, [
      { x: -0.04, y: 0.05, h: 0.004, w: 0.004 }, { x: -0.02, y: 0.05, h: 0.045, b: 0.04, w: 0.03 },
      { x: 0.03, y: 0.04, h: 0.03, b: 0.03, w: 0.026 }, { x: 0.05, y: 0.035, h: 0.004, w: 0.004 },
    ], { p: [0, 0, s * 0.05], seg: 12, fur: [0.012, 4, 0.2], color: () => RUST });
    furPart(body, [
      { x: 0.0, y: 0.012, h: 0.003, w: 0.003 }, { x: 0.02, y: 0.012, h: 0.012, w: 0.016 },
      { x: 0.08, y: 0.008, h: 0.008, w: 0.014 }, { x: 0.095, y: 0.007, h: 0.002, w: 0.002 },
    ], { p: [0, 0, s * 0.045], seg: 10, color: () => DARK });
    furPart(body, [
      { x: 0.03, y: 0.2, h: 0.003, w: 0.003 }, { x: 0.045, y: 0.19, h: 0.012, w: 0.012 },
      { x: 0.075, y: 0.17, h: 0.008, w: 0.01 }, { x: 0.085, y: 0.165, h: 0.002, w: 0.002 },
    ], { p: [0, 0, s * 0.028], seg: 10, color: () => RUST });
  });
  // cola enorme en S, muy poblada
  const tail = group(body, [-0.04, 0.05, 0]);
  furPart(tail, [
    { x: 0.0, y: -0.01, h: 0.01, w: 0.01 },
    { x: -0.04, y: 0.0, h: 0.035, w: 0.035 },
    { x: -0.14, y: 0.06, h: 0.05, w: 0.05 },
    { x: -0.19, y: 0.2, h: 0.055, w: 0.055 },
    { x: -0.15, y: 0.34, h: 0.05, w: 0.05 },
    { x: -0.06, y: 0.39, h: 0.035, w: 0.035 },
    { x: -0.02, y: 0.37, h: 0.004, w: 0.004 },
  ], { seg: 14, fur: [0.045, 8, 0.4], color: (s) => mixC(RUST, DARK, s * 0.5) });

  const head = group(body, [0.03, 0.3, 0]);
  furPart(head, [
    { x: -0.06, y: 0.005, h: 0.008, w: 0.008 },
    { x: -0.045, y: 0.005, h: 0.052, b: 0.052, w: 0.054 },
    { x: 0.015, y: 0.0, h: 0.05, b: 0.046, w: 0.05 },
    { x: 0.065, y: -0.01, h: 0.028, b: 0.03, w: 0.03 },
    { x: 0.086, y: -0.013, h: 0.012, b: 0.012, w: 0.012 },
    { x: 0.092, y: -0.013, h: 0.002, w: 0.002 },
  ], {
    seg: 18, fur: [0.008, 5, 0.2],
    color: (s, ang, x) => {
      let c = mixC(RUST, CREAM, smooth01(2.0, 2.6, ang) * smooth01(-0.02, 0.02, x));
      return mixC(c, [40, 28, 24], smooth01(0.084, 0.09, x));
    },
  });
  // orejas con pinceles
  [-1, 1].forEach((s) => {
    const ear = group(head, [-0.02, 0.04, s * 0.03], [s * 0.25, 0, -0.1]);
    furPart(ear, [
      { x: 0, y: 0, h: 0.008, w: 0.014 }, { x: 0, y: 0.025, h: 0.007, w: 0.016 },
      { x: 0, y: 0.045, h: 0.006, w: 0.008 }, { x: 0, y: 0.075, h: 0.001, w: 0.001 },
    ], { seg: 10, fur: [0.016, 5, 0.1], color: (t) => mixC(RUST, DARK, t) });
  });
  const eyes = [1, -1].map((s) => realEye(head, [0.035, 0.018, s * 0.042], 0.012, 0x120c08));
  const acorn = group(body, [0.085, 0.18, 0]);
  mesh(GEO.sphere, std({ color: 0x9a6a3c, roughness: 0.5 }), acorn, { s: [0.025, 0.03, 0.025] });
  mesh(GEO.sphere, std({ color: 0x5b3c20, roughness: 1 }), acorn, { p: [0, 0.022, 0], s: [0.027, 0.015, 0.027] });
  const mini = makeGift(body, 0.07, 0.07, 0.07, MAT.papers[0], ribbonGold(), [0.09, 0.15, 0]);
  mini.root.scale.setScalar(0.001);
  R.squirrel = { root, body, tail, head, eyes, acorn, mini: mini.root, paused: false };
  heads.push({ obj: head, weight: 0.8, max: 1.0 });
  blinkers.push(eyes);
  breathers.push({ obj: body, amp: 0.02, speed: 3 });
}

// ---------- Saco de "ILUSIÓN" ----------
function buildSack() {
  const sack = makeReact(group(scene, [2.35, 0, 2.3], [0, -0.3, 0]), 'sack', 'El saco de ilusión');
  const inner = group(sack);
  const pts = [[0.001, 0], [0.34, 0.02], [0.44, 0.16], [0.47, 0.38], [0.42, 0.6], [0.3, 0.74], [0.17, 0.82], [0.14, 0.88], [0.21, 0.97], [0.001, 0.97]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  mesh(new THREE.LatheGeometry(pts, 40), MAT.burlap, inner);
  mesh(new THREE.TorusGeometry(0.15, 0.022, 8, 24), std({ color: 0x6b4f30, roughness: 1 }), inner, { p: [0, 0.85, 0], r: [Math.PI / 2, 0, 0] });
  const label = labelTexture([
    { text: 'ILUSIÓN', font: '900 64px Fraunces, Georgia, serif', color: '#5e4426', y: 0.42 },
    { text: 'para todos', font: 'italic 600 34px Fraunces, Georgia, serif', color: '#5e4426', y: 0.78 },
  ], { w: 320, h: 160 });
  const labelMat = new THREE.MeshStandardMaterial({ map: label, transparent: true, roughness: 1 });
  mesh(GEO.plane, labelMat, inner, { p: [0, 0.42, 0.47], r: [-0.05, 0, 0], s: [0.6, 0.3, 1], cast: false });
  const peek = group(inner, [0, 0.82, 0]);
  makeGift(peek, 0.18, 0.2, 0.16, MAT.papers[3], ribbonGold(), [-0.06, 0, 0]).root.rotation.z = 0.3;
  makeGift(peek, 0.16, 0.18, 0.15, MAT.papers[4], MAT.cream, [0.08, 0, 0.02]).root.rotation.z = -0.25;
  R.sack = { inner, peek };
}

// ---------- Hierba seca que asoma de la nieve ----------
function buildGrass() {
  R.grass = [];
  const spots = [[-3.4, 2.3], [-2.9, 3.2], [-1.2, 3.4], [-0.1, 2.2], [0.2, 3.6], [1.7, 3.3], [2.2, 2.7], [3.6, 3.0], [3.9, 1.2], [-3.9, 0.4], [-0.9, 1.6], [4.2, 2.3]];
  spots.forEach(([x, z]) => {
    const tuft = group(scene, [x, 0, z]);
    tuft.userData.noCollide = true;   // los regalos no se apoyan en la hierba
    for (let i = 0; i < 7; i++) {
      const h = rand(0.18, 0.42);
      const blade = group(tuft, [rand(-0.05, 0.05), 0, rand(-0.05, 0.05)], [rand(-0.35, 0.35), rand(0, TAU), rand(-0.35, 0.35)]);
      mesh(GEO.cone, MAT.straw, blade, { p: [0, h / 2, 0], s: [0.008, h, 0.008] });
      if (Math.random() < 0.4) mesh(GEO.sphereLo, MAT.straw, blade, { p: [0, h, 0], s: [0.012, 0.03, 0.012] });
    }
    R.grass.push({ tuft, x, z, bend: 0, phase: rand(0, TAU) });
  });
}

/* =========================================================
   5 · SISTEMA DE ANIMACIÓN (tweens y oscilaciones)
   ========================================================= */
const anims = [];

function run(ms, fn, opts = {}) {
  const a = { t: -(opts.delay || 0), ms, fn, ease: opts.ease || ease.outCubic, done: opts.done, alive: true };
  anims.push(a);
  return a;
}

function cancel(a) {
  if (a) a.alive = false;
}

// lleva obj[key] hasta un valor (cancela la animación anterior de esa propiedad)
function tweenTo(obj, key, to, ms, opts = {}) {
  obj.__tw = obj.__tw || {};
  cancel(obj.__tw[key]);
  let from;
  const a = run(ms, (e) => {
    if (from === undefined) from = obj[key];
    obj[key] = from + (to - from) * e;
  }, opts);
  obj.__tw[key] = a;
  return a;
}

function scaleTo(obj, s, ms, opts) {
  tweenTo(obj.scale, 'x', Array.isArray(s) ? s[0] : s, ms, opts);
  tweenTo(obj.scale, 'y', Array.isArray(s) ? s[1] : s, ms, opts);
  tweenTo(obj.scale, 'z', Array.isArray(s) ? s[2] : s, ms, opts);
}

// oscilación amortiguada (sacudidas, balanceos, campanillas…)
function wobble(obj, key, amp, ms, freq = 3, opts = {}) {
  obj.__tw = obj.__tw || {};
  cancel(obj.__tw[key]);
  let base;
  const a = run(ms, (e, p) => {
    if (base === undefined) base = obj[key];
    obj[key] = base + amp * Math.sin(p * freq * TAU) * (1 - p);
  }, { ...opts, ease: ease.linear, done: () => { obj[key] = base; if (opts.done) opts.done(); } });
  obj.__tw[key] = a;
  return a;
}

function updateAnims(dt) {
  for (let i = anims.length - 1; i >= 0; i--) {
    const a = anims[i];
    if (!a.alive) { anims.splice(i, 1); continue; }
    a.t += dt * 1000;
    if (a.t < 0) continue;
    const p = Math.min(1, a.t / a.ms);
    a.fn(a.ease(p), p);
    if (p >= 1) {
      anims.splice(i, 1);
      a.alive = false;
      if (a.done) a.done();
    }
  }
}

/* =========================================================
   6 · PARTÍCULAS 3D (sprites y confeti)
   ========================================================= */
const particles = [];
const tmpV = new THREE.Vector3();

function emit(tex, pos, o = {}) {
  if (particles.length > 450) return;
  const mat = new THREE.SpriteMaterial({
    map: tex, color: o.color || 0xffffff, transparent: true, depthWrite: false,
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, opacity: o.opacity || 1, fog: false,
  });
  const s = new THREE.Sprite(mat);
  s.position.copy(pos);
  const size = o.size || 0.15;
  s.scale.set(size * (o.aspect || 1), size, 1);
  s.userData.noRay = true;
  scene.add(s);
  particles.push({
    obj: s, mat, vel: o.vel || new THREE.Vector3(), gravity: o.gravity ?? 1.5, life: 1,
    decay: o.decay || 0.8, grow: o.grow || 0, spin: o.spin || 0, windy: o.windy || 0,
    size, aspect: o.aspect || 1, maxOpacity: o.opacity || 1, flutter: o.flutter || 0, phase: rand(0, TAU),
  });
}

function emitMesh(color, pos, o = {}) {
  if (particles.length > 450) return;
  const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true });
  const m = new THREE.Mesh(GEO.plane, mat);
  m.position.copy(pos);
  m.scale.set(o.w || 0.04, o.h || 0.02, 1);
  m.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
  m.userData.noRay = true;
  scene.add(m);
  particles.push({
    obj: m, mat, vel: o.vel || new THREE.Vector3(), gravity: o.gravity ?? 2, life: 1, decay: o.decay || 0.4,
    spinV: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), windy: o.windy || 0, isMesh: true, flutter: o.flutter || 0, phase: rand(0, TAU),
  });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vel.y -= p.gravity * dt;
    p.vel.x += wind.value * p.windy * dt;
    if (p.flutter) p.vel.x += Math.sin(p.phase + p.life * 12) * p.flutter * dt;
    p.obj.position.addScaledVector(p.vel, dt);
    p.life -= p.decay * dt;
    if (p.life <= 0) {
      scene.remove(p.obj);
      p.mat.dispose();
      particles.splice(i, 1);
      continue;
    }
    if (p.isMesh) {
      p.obj.rotation.x += p.spinV.x * dt;
      p.obj.rotation.y += p.spinV.y * dt;
      p.mat.opacity = Math.min(1, p.life * 2);
    } else {
      const g = 1 + (1 - p.life) * p.grow;
      p.obj.scale.set(p.size * g * p.aspect, p.size * g, 1);
      p.mat.opacity = Math.min(1, p.life * 1.6) * p.maxOpacity;
      p.mat.rotation += p.spin * dt;
    }
  }
}

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const worldOf = (obj, local = v3(0, 0, 0)) => obj.localToWorld(local.clone());

function sparks(pos, n = 14, power = 1.6, color = 0xffd27a) {
  for (let i = 0; i < n; i++) {
    const dir = v3(rand(-1, 1), rand(-0.2, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(0.4, power));
    emit(TEX.star4, pos, { vel: dir, gravity: 1.2, size: rand(0.06, 0.13), decay: rand(0.9, 1.5), additive: true, color: pick([color, 0xffffff, 0xff8a7a]), spin: rand(-4, 4) });
  }
}
function hearts(pos, n = 4) {
  for (let i = 0; i < n; i++) emit(TEX.heart, pos.clone().add(v3(rand(-0.1, 0.1), 0, 0)), { vel: v3(rand(-0.2, 0.2), rand(0.4, 0.7), 0), gravity: -0.05, size: rand(0.1, 0.16), decay: 0.6, color: 0xff5a64 });
}
function notes(pos, n = 3, color = 0xffe08a) {
  for (let i = 0; i < n; i++) emit(TEX.note, pos.clone().add(v3(rand(-0.1, 0.1), i * 0.05, 0)), { vel: v3(rand(-0.25, 0.25), rand(0.4, 0.7), 0), gravity: -0.05, size: rand(0.14, 0.2), decay: 0.55, color, flutter: 1.5 });
}
function say(pos, text, color = '#fbf3e6') {
  emit(textSpriteTexture(text, color), pos.clone().add(v3(0, 0.15, 0)), { vel: v3(0, 0.35, 0), gravity: 0, size: 0.16, aspect: 4, decay: 0.45 });
}
function puff(pos, n = 14, spread = 0.25) {
  for (let i = 0; i < n; i++) emit(TEX.flake, pos.clone().add(v3(rand(-spread, spread), 0, rand(-spread, spread))), { vel: v3(rand(-0.6, 0.6), rand(0.3, 1.2), rand(-0.6, 0.6)), gravity: 2, size: rand(0.04, 0.09), decay: 0.9 });
}
function snowFall(pos, n = 18, spread = 0.6) {
  for (let i = 0; i < n; i++) emit(TEX.flake, pos.clone().add(v3(rand(-spread, spread), rand(-spread, spread), rand(-spread, spread))), { vel: v3(rand(-0.2, 0.2), rand(-0.3, 0.2), rand(-0.2, 0.2)), gravity: 1.2, size: rand(0.03, 0.08), decay: 0.5, windy: 0.6 });
}
function drops(pos, n = 2, color = 0x9fd0ff) {
  for (let i = 0; i < n; i++) emit(TEX.flake, pos.clone(), { vel: v3(rand(0.1, 0.5), rand(-0.2, 0.1), rand(-0.1, 0.1)), gravity: 6, size: 0.03, decay: 1.4, color });
}
function smoke(pos, power = 1) {
  emit(TEX.smoke, pos.clone().add(v3(rand(-0.03, 0.03), 0, 0)), { vel: v3(rand(-0.05, 0.05), rand(0.35, 0.6) * power, rand(-0.05, 0.05)), gravity: -0.02, size: rand(0.18, 0.3) * power, grow: 3, decay: 0.22, windy: 0.9, opacity: 0.55, color: 0xd8d2e0, spin: rand(-0.5, 0.5) });
}
function confetti(pos, n = 50) {
  const cols = [0xc0262f, 0xf2c35b, 0x4f7fc2, 0x3f8a5c, 0xffffff];
  for (let i = 0; i < n; i++) emitMesh(pick(cols), pos, { vel: v3(rand(-1.2, 1.2), rand(1.5, 3.2), rand(-1.2, 1.2)), gravity: 3.2, decay: 0.45, flutter: 3 });
}
function leaf(pos) {
  emitMesh(pick([0x3f8a5c, 0x2a6142, 0x8a6a3a, 0xb07a3a]), pos, { w: 0.05, h: 0.02, vel: v3(wind.value * 1.5, rand(-0.2, 0.3), rand(-0.3, 0.3)), gravity: 0.25, decay: 0.18, windy: 2.2, flutter: 2 });
}

/* =========================================================
   7 · NIEVE 3D (dos capas: lejana y cercana desenfocada)
   ========================================================= */
const snowLayers = [];
// Copos calculados en la tarjeta gráfica: caen, se mecen, los arrastra el viento y los
// cercanos se apartan del cursor, sin ningún bucle en JavaScript (no cuesta nada al procesador).
// Los copos grandes son cristales de seis puntas que giran; los pequeños, bolitas suaves.
const SNOW_VS = `
uniform float uTime, uWindX, uSize, uScale, uRepel;
uniform vec3 uBoxMin, uBoxSize, uRayO, uRayD;
attribute vec4 seed;    // posición inicial (0..1) y velocidad de caída
attribute vec2 look;    // fase y tamaño relativo
varying float vAlpha, vKind, vSpin;
void main() {
  vec3 p;
  p.y = uBoxMin.y + uBoxSize.y * fract(seed.y - uTime * seed.w / uBoxSize.y);
  p.x = uBoxMin.x + uBoxSize.x * fract(seed.x + uWindX / uBoxSize.x) + sin(uTime * 0.7 + look.x) * 0.3;
  p.z = uBoxMin.z + uBoxSize.z * seed.z + cos(uTime * 0.5 + look.x * 1.3) * 0.15;
  // remolino suave alrededor del rayo del cursor
  if (uRepel > 0.0) {
    vec3 q = p - uRayO;
    vec3 perp = q - uRayD * dot(q, uRayD);
    float d = length(perp);
    if (d < 0.7 && d > 0.001) p += perp / d * (0.7 - d) * 0.6 * uRepel;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = uSize * look.y * uScale / -mv.z;
  // se desvanecen al nacer arriba, al llegar al suelo y a lo lejos (niebla)
  float h = (p.y - uBoxMin.y) / uBoxSize.y;
  vAlpha = smoothstep(0.0, 0.04, h) * smoothstep(1.0, 0.9, h) * smoothstep(48.0, 18.0, -mv.z);
  vKind = step(1.3, look.y);
  vSpin = uTime * (look.x - 3.14) * 0.25 + look.x;
  gl_Position = projectionMatrix * mv;
}`;
const SNOW_FS = `
uniform float uOpacity;
varying float vAlpha, vKind, vSpin;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float cs = cos(vSpin), sn = sin(vSpin);
  c = mat2(cs, -sn, sn, cs) * c;
  float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float disc = smoothstep(1.0, 0.15, r);
  // cristal: seis brazos finos con ramitas y un centro
  float a = atan(c.y, c.x);
  float arm = smoothstep(0.16, 0.0, abs(sin(a * 3.0)) * r * 3.0) * smoothstep(1.0, 0.75, r);
  float twig = smoothstep(0.1, 0.0, abs(sin(a * 3.0 + 0.6)) * r * 3.0) * step(0.45, r) * step(r, 0.7);
  float star = max(max(arm, twig * 0.8), smoothstep(0.3, 0.0, r));
  float alpha = mix(disc * 0.85, star, vKind);
  gl_FragColor = vec4(0.93, 0.96, 1.0, alpha * uOpacity * vAlpha);
}`;
function makeSnowLayer(count, box, size, speed, opacity) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count * 4), look = new Float32Array(count * 2);
  const big = box.y1 - box.y0 < 9;     // la capa cercana tiene más cristales grandes
  for (let i = 0; i < count; i++) {
    seed.set([Math.random(), Math.random(), Math.random(), rand(speed * 0.6, speed * 1.4)], i * 4);
    const sz = Math.random() < (big ? 0.3 : 0.12) ? rand(1.35, 2.1) : rand(0.55, 1.25);
    look.set([rand(0, TAU), sz], i * 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('look', new THREE.BufferAttribute(look, 2));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uWindX: { value: 0 }, uSize: { value: size }, uScale: { value: 600 }, uOpacity: { value: opacity },
      uRepel: { value: 0 }, uRayO: { value: new THREE.Vector3() }, uRayD: { value: new THREE.Vector3(0, 0, -1) },
      uBoxMin: { value: new THREE.Vector3(box.x0, box.y0, box.z0) },
      uBoxSize: { value: new THREE.Vector3(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0) },
    },
    vertexShader: SNOW_VS, fragmentShader: SNOW_FS, transparent: true, depthWrite: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.userData.noRay = true;
  pts.frustumCulled = false;
  scene.add(pts);
  snowLayers.push({ pts, mat, box, count, near: snowLayers.length === 1 });
}

const ray = new THREE.Raycaster();
ray.firstHitOnly = true;
const pointerNDC = new THREE.Vector2();

const _bufSize = new THREE.Vector2();
let snowWindX = 0, snowClock = 0;
function updateSnow(dt, time) {
  snowWindX += wind.value * 1.6 * dt;
  snowClock += dt;
  renderer.getDrawingBufferSize(_bufSize);
  snowLayers.forEach((L) => {
    const u = L.mat.uniforms;
    u.uTime.value = snowClock;
    u.uWindX.value = snowWindX;
    u.uScale.value = _bufSize.y / 2;
    // solo la capa cercana se aparta del cursor
    u.uRepel.value = lerp(u.uRepel.value, L.near && mouse.inside ? 1 : 0, 0.1);
    if (L.near) { u.uRayO.value.copy(ray.ray.origin); u.uRayD.value.copy(ray.ray.direction); }
  });
}

/* =========================================================
   8 · VIENTO
   ========================================================= */
function updateWind(time, dt) {
  const gust = 0.5 * Math.sin(time * 0.33) + 0.3 * Math.sin(time * 0.83 + 1.3) + 0.2 * Math.sin(time * 2.1 + 0.4);
  let target = 0.25 + gust * 0.6 + clamp(mouse.vx * 0.05, -1.3, 1.3);
  wind.value = lerp(wind.value, target, 0.03);
  const strength = Math.abs(wind.value);
  const calm = 0.3 + strength;
  const s = (ph, sp = 1) => Math.sin(time * 2.4 * sp + ph);

  // árbol de Navidad, pinos, bolas, bombillas, casita, corona, acebo y hierba
  R.tree.sway.rotation.z = -wind.value * 0.05 - s(0) * 0.012 * calm;
  R.tree.sway.rotation.x = s(1.3, 0.7) * 0.008 * calm;
  R.pines.forEach((p) => { p.sway.rotation.z = -wind.value * 0.035 - s(p.phase, 0.8) * 0.01 * calm; });
  R.eaveLights.forEach((l) => { l.pivot.rotation.z = -wind.value * 0.4 + s(l.phase, 1.4) * 0.1 * calm; });
  R.birdhouse.wind.rotation.z = -wind.value * 0.12 + s(0.5, 0.8) * 0.04;
  R.wreath.wind.rotation.z = -wind.value * 0.03 + s(2, 0.6) * 0.012;
  R.holly.leaves.rotation.z = -wind.value * 0.06 + s(3, 1.8) * 0.03 * calm;
  R.grass.forEach((g) => {
    let push = 0;
    if (mouse.inside && cursorPoint) {
      const dd = Math.hypot(g.x - cursorPoint.x, g.z - cursorPoint.z);
      if (dd < 0.8) push = Math.sign(g.x - cursorPoint.x || 1) * (1 - dd / 0.8) * 0.6;
    }
    g.bend = lerp(g.bend, push, 0.12);
    g.tuft.rotation.z = -wind.value * 0.3 - s(g.phase, 2) * 0.08 * calm - g.bend;
  });

  // humo continuo y efectos de ráfaga
  if (Math.random() < 0.18) smoke(worldOf(R.chimney.inner, R.chimney.top));
  if (strength > 0.6) {
    if (Math.random() < 0.3) leaf(worldOf(R.tree.tree, v3(rand(-0.6, 0.6), rand(0.3, 1.9), rand(-0.6, 0.6))));
    if (Math.random() < 0.2) leaf(worldOf(pick(R.pines).inner, v3(0, rand(1, 3), 0)));
    if (Math.random() < 0.4) snowFall(worldOf(R.shed, v3(rand(-2, 2), 3.3, rand(0, 1.4))), 2, 0.2);
  } else if (Math.random() < 0.02) {
    leaf(worldOf(R.tree.tree, v3(rand(-0.6, 0.6), rand(0.3, 1.9), rand(-0.6, 0.6))));
  }
}

/* =========================================================
   9 · VIDA PROPIA DE LOS ANIMALES
   ========================================================= */
function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}

// ---- Ciervo: pasea, pasta y mira alrededor
function deerNextAction() {
  const d = R.deer;
  if (d.paused) { later('deer', deerNextAction, 1500); return; }
  const r = Math.random();
  if (r < 0.45) {
    d.target = rand(-3.2, 0.4);
    d.mode = 'walk';
    setDeerGraze(false);
  } else if (r < 0.8) {
    d.mode = 'graze';
    setDeerGraze(true);
    later('deer', deerNextAction, rand(2500, 4500));
  } else {
    d.mode = 'idle';
    setDeerGraze(false);
    wobble(d.head.rotation, 'y', 0.5, 1800, 1);
    later('deer', deerNextAction, rand(2000, 3500));
  }
}

function setDeerGraze(on) {
  tweenTo(R.deer.neck.rotation, 'z', on ? -1.6 : 0, 1300, { ease: ease.inOutSine });
  tweenTo(R.deer.head.rotation, 'z', on ? -0.7 : 0, 1300, { ease: ease.inOutSine });
}

function updateDeer(dt, time) {
  const d = R.deer;
  let facing = -Math.PI / 2 + 0.5;
  if (d.mode === 'walk' && !d.paused) {
    const dir = Math.sign(d.target - d.x);
    d.x += dir * 0.45 * dt;
    d.walkT += dt * 7;
    facing = dir > 0 ? 0 : Math.PI;
    if (Math.abs(d.target - d.x) < 0.05) {
      d.mode = 'idle';
      later('deer', deerNextAction, rand(1500, 3000));
    }
  }
  const walking = d.mode === 'walk' && !d.paused;
  poseLegs(d.legs, d.walkT, walking, 0.3);
  d.body.position.y = walking ? Math.abs(Math.sin(d.walkT * 2)) * 0.012 : 0;
  d.root.position.x = d.x;
  d.root.rotation.y = angleLerp(d.root.rotation.y, facing, 0.06);
  d.tail.rotation.z = Math.sin(time * 9) * (Math.sin(time * 0.7) > 0.85 ? 0.4 : 0.02);
}

// ---- Zorro: cruza el bosque y desaparece detrás de la caseta
function foxStart() {
  const f = R.fox;
  f.active = true;
  f.x = 9;
}

function updateFox(dt) {
  const f = R.fox;
  if (!f.active) return;
  if (!f.paused) {
    f.x -= 1.5 * dt;
    f.t += dt * 13;
    if (f.x < -10) {
      f.active = false;
      later('fox', foxStart, rand(14000, 22000));
    }
  }
  const trot = f.active && !f.paused;
  poseLegs(f.legs, f.t, trot, 0.35);
  f.body.position.y = trot ? Math.abs(Math.sin(f.t)) * 0.03 : 0;
  f.tail.rotation.y = Math.sin(f.t * (f.paused ? 0.9 : 0.25)) * (f.paused ? 0.5 : 0.15);
  f.root.position.x = f.x;
}

// ---- Conejo: da saltitos por la nieve
function rabbitWander() {
  const r = R.rabbit;
  if (!r.paused) {
    const from = r.x;
    const to = clamp(from + rand(-0.6, 0.6), -0.8, 0.6);
    r.x = to;
    const facing = to > from ? -0.4 : Math.PI + 0.4;
    tweenTo(r.root.rotation, 'y', r.root.rotation.y + ((((facing - r.root.rotation.y + Math.PI) % TAU) + TAU) % TAU - Math.PI), 300);
    run(1000, (e, p) => {
      r.root.position.x = r.baseX + lerp(from, to, e);
      r.root.position.y = Math.abs(Math.sin(p * Math.PI * 2)) * 0.16;
    }, { ease: ease.inOutSine, done: () => puff(r.root.position.clone(), 6, 0.1) });
  }
  later('rabbit', rabbitWander, rand(4000, 8000));
}

// ---- Gorrión y petirrojo: saltitos y picoteos
function hopBird(bird) {
  if (bird.paused) return;
  const from = bird.root.position.clone();
  const to = bird.base.clone().add(v3(rand(-0.3, 0.3), 0, rand(-0.2, 0.2)));
  run(320, (e, p) => {
    bird.root.position.lerpVectors(from, to, e);
    bird.root.position.y = Math.sin(p * Math.PI) * 0.08;
  });
}
function peck(bird) {
  wobble(bird.head.rotation, 'z', -0.7, 600, 2);
}

function groundBirdsLife() {
  [R.sparrow, R.robin].forEach((b) => {
    if (b.paused) return;
    const r = Math.random();
    if (r < 0.45) hopBird(b);
    else if (r < 0.8) peck(b);
    else b.wings.forEach((w, i) => wobble(w.rotation, 'x', i ? -0.8 : 0.8, 400, 3));
  });
  later('groundBirds', groundBirdsLife, rand(1500, 3200));
}

// ---- Ardilla, arrendajo, cardenal y carbonero: pequeños gestos
function smallCreaturesLife() {
  const r = Math.random();
  if (r < 0.3 && !R.squirrel.paused) {
    wobble(R.squirrel.acorn.position, 'y', 0.06, 900, 3);
    for (let i = 0; i < 3; i++) emit(TEX.flake, worldOf(R.squirrel.head, v3(0.08, -0.02, 0)), { vel: v3(rand(-0.2, 0.2), 0, 0), gravity: 2, size: 0.02, decay: 1, color: 0x7a5030 });
  } else if (r < 0.5) {
    wobble(R.jay.head.rotation, 'z', 0.4, 700, 1.5);
    R.jay.wings.forEach((w, i) => wobble(w.rotation, 'x', i ? -0.6 : 0.6, 450, 3));
  } else if (r < 0.75 && !R.cardinal.flying) {
    run(420, (e, p) => { R.cardinal.root.position.y = R.cardinal.base.y + Math.sin(p * Math.PI) * 0.08; });
  } else {
    wobble(R.chickadee.head.rotation, 'y', 0.8, 900, 1.5);
  }
  wobble(R.squirrel.tail.rotation, 'z', 0.12, 900, 2);
  later('smallLife', smallCreaturesLife, rand(1500, 3200));
}

// ---- Parpadeo y respiración
function blinkSomeone() {
  const eyes = pick(blinkers);
  eyes.forEach((e) => { e.scale.y = 0.1; });
  later('unblink', () => eyes.forEach((e) => { e.scale.y = 1; }), 130);
  later('blink', blinkSomeone, rand(350, 1200));
}

function updateBreathing(time) {
  breathers.forEach((b, i) => {
    const k = 1 + Math.sin(time * b.speed + i) * b.amp;
    b.obj.scale.set(1, k, 1 + (k - 1) * 0.6);
  });
}

// ---- Las cabezas siguen al cursor (en 3D)
const qTmp = new THREE.Quaternion();
const eTmp = new THREE.Euler();
const hTmp = new THREE.Vector3();
function updateHeads() {
  heads.forEach((h) => {
    let target = 0;
    if (mouse.inside && cursorPoint) {
      h.obj.getWorldPosition(hTmp);
      const dx = cursorPoint.x - hTmp.x;
      const dz = cursorPoint.z - hTmp.z;
      const worldYaw = Math.atan2(-dz, dx);
      h.obj.parent.getWorldQuaternion(qTmp);
      eTmp.setFromQuaternion(qTmp, 'YXZ');
      let local = worldYaw - eTmp.y;
      local = ((local + Math.PI) % TAU + TAU) % TAU - Math.PI;
      target = clamp(local, -h.max, h.max) * h.weight;
    }
    const busy = h.obj.rotation.__tw && h.obj.rotation.__tw.y && h.obj.rotation.__tw.y.alive;
    if (!busy) {
      h.obj.rotation.y = lerp(h.obj.rotation.y, target, 0.08);
    }
  });
}

// ---- Bandada cruzando el cielo
function flyFlock() {
  const f = R.flock;
  f.visible = true;
  const dir = Math.random() < 0.5 ? 1 : -1;
  const y = rand(9, 14);
  f.rotation.y = dir > 0 ? 0 : Math.PI;
  run(18000, (e) => {
    f.position.set(lerp(-34 * dir, 34 * dir, e), y + e * 2, -26);
  }, { ease: ease.linear, done: () => { f.visible = false; } });
  later('flock', flyFlock, rand(24000, 34000));
}

function updateFlock(time) {
  if (!R.flock.visible) return;
  R.flockBirds.forEach((b) => {
    // aleteo con algún planeo
    const ph = time * b.speed + b.phase;
    const glide = Math.sin(time * 0.6 + b.phase) > 0.75;
    const a = glide ? 0.12 : Math.sin(ph) * 0.75 + 0.15;
    b.r.rotation.z = a;
    b.l.rotation.z = -a;
  });
}

/* =========================================================
   10 · REACCIONES 3D (hover por raycasting)
   Cada objeto tiene su función de entrada y de salida.
   ========================================================= */
let starBoost = 0;
let treeChaseUntil = 0;
let eaveChaseUntil = 0;

const REACTIONS = {
  pine: {
    enter(obj) {
      const p = obj.userData.pine;
      wobble(p.inner.rotation, 'z', 0.07, 1000, 4);
      snowFall(worldOf(p.inner, v3(0, p.h * 0.6, 0)), 30, 0.8);
    },
    leave() {},
  },
  deer: {
    enter() {
      const d = R.deer;
      d.paused = true;
      setDeerGraze(false);
      tweenTo(d.neck.rotation, 'z', 0.25, 500);
      d.ears.forEach((e, i) => wobble(e.rotation, 'x', i ? -0.5 : 0.5, 700, 3));
      wobble(d.tail.rotation, 'z', 0.6, 800, 4);
      hearts(worldOf(d.head, v3(0, 0.25, 0)), 4);
      say(worldOf(d.head, v3(0, 0.35, 0)), '¡hola!');
      playSound('ciervo', { volume: 0.9 });
    },
    leave() {
      const d = R.deer;
      d.paused = false;
      tweenTo(d.neck.rotation, 'z', 0, 600);
    },
  },
  fox: {
    enter() { R.fox.paused = true; say(worldOf(R.fox.head, v3(0, 0.25, 0)), '¡yip!', '#ffd2a8'); },
    leave() { R.fox.paused = false; },
  },
  chimney: {
    enter() {
      wobble(R.chimney.inner.rotation, 'z', 0.06, 600, 5);
      const top = worldOf(R.chimney.inner, R.chimney.top);
      for (let i = 0; i < 12; i++) later('smk' + i, () => smoke(top, 1.8), i * 50);
      say(top.clone().add(v3(0.3, 0.2, 0)), '¡puf!');
    },
    leave() {},
  },
  roofSnow: {
    enter() { slideRoofSnow(); },
    leave() {},
  },
  eave: {
    enter() {
      eaveChaseUntil = performance.now() + 3000;
      R.icicles.forEach((ic, i) => wobble(ic.mesh.rotation, 'z', 0.12, 500, 3, { delay: i * 25 }));
      every('drip', () => {
        const ic = pick(R.icicles);
        drops(worldOf(R.shed, ic.tip), 1, 0xcfe6fb);
      }, 90);
    },
    leave() { stopEvery('drip'); },
  },
  birdhouse: {
    enter() {
      wobble(R.birdhouse.root.rotation, 'z', 0.35, 1200, 2);
      scaleTo(R.birdhouse.peek, 1, 400, { ease: ease.outBack });
      say(worldOf(R.birdhouse.root, v3(0, -0.2, 0.2)), '¡pi-pío!');
    },
    leave() { scaleTo(R.birdhouse.peek, 0.001, 300); },
  },
  jay: {
    enter() {
      say(worldOf(R.jay.head, v3(0, 0.15, 0)), '¡crá, crá!', '#cfe0ff');
      playSound('mordecai', { volume: 0.85 });
      jayVisitNest();
    },
    leave() {},
  },
  window: {
    enter() {
      tweenTo(R.window.light, 'intensity', 3.2, 500);
      R.window.interiorMat.color.set(0xffffff);
      R.window.wave = run(1e9, (e, p) => { R.window.teddyArm.rotation.z = -0.4 - Math.abs(Math.sin(performance.now() / 160)) * 1.1; }, { ease: ease.linear });
      hearts(worldOf(R.window.teddy, v3(0, 0.3, 0.2)), 3);
    },
    leave() {
      tweenTo(R.window.light, 'intensity', 1.8, 500);
      R.window.interiorMat.color.set(0x9a8070);
      cancel(R.window.wave);
      tweenTo(R.window.teddyArm.rotation, 'z', -0.4, 300);
    },
  },
  wreath: {
    enter() {
      wobble(R.wreath.root.rotation, 'z', 0.2, 1200, 2.5);
      R.bells.forEach((b, i) => wobble(b.rotation, 'z', 0.7, 1000, 4, { delay: i * 100 }));
      const p = worldOf(R.wreath.root, v3(0, -0.6, 0.1));
      say(p, '¡din don!', '#ffe08a');
      notes(p, 3);
    },
    leave() {},
  },
  rake: {
    enter() {
      wobble(R.rake.inner.rotation, 'z', 0.12, 1100, 2.5);
      wobble(R.rake.tines.scale, 'x', 0.2, 600, 6);
      snowFall(worldOf(R.rake.tines, v3(0, 0.2, 0)), 8, 0.15);
    },
    leave() {},
  },
  shovel: {
    enter() {
      const s = R.shovel;
      run(900, (e, p) => {
        const up = p < 0.5 ? Math.sin(p * Math.PI) : Math.sin(p * Math.PI) * 0.6;
        s.position.y = up * 0.3 - (p > 0.7 ? (p - 0.7) * 0.2 : 0);
        s.rotation.x = up * 0.3;   // se inclina hacia fuera (separándose de la pared), nunca hacia dentro
      }, { ease: ease.linear, done: () => { s.position.y = 0; s.rotation.x = 0; puff(worldOf(s, v3(0, 0.02, 0)), 18, 0.15); } });
    },
    leave() {},
  },
  mousePot: {
    enter() {
      const m = R.mousePot;
      tweenTo(m.pot.position, 'y', 0.22, 400, { ease: ease.outBack });
      tweenTo(m.pot.rotation, 'z', 0.35, 400);
      scaleTo(m.mouse, 1, 450, { ease: ease.outBack, delay: 150 });
      say(worldOf(m.mouse, v3(0, 0.25, 0)), '¡hola!');
    },
    leave() {
      const m = R.mousePot;
      tweenTo(m.pot.position, 'y', 0, 350);
      tweenTo(m.pot.rotation, 'z', 0, 350);
      scaleTo(m.mouse, 0.001, 250);
    },
  },
  musicBox: {
    enter() {
      const m = R.musicBox;
      tweenTo(m.lid.rotation, 'x', -1.7, 500, { ease: ease.outBack });
      scaleTo(m.star, 1, 500, { ease: ease.outBack });
      tweenTo(m.star.position, 'y', 0.32, 500);
      m.spin = run(1e9, () => { m.star.rotation.y += 0.05; }, { ease: ease.linear });
      every('music', () => notes(worldOf(m.star, v3(0, 0.1, 0)), 1), 300);
    },
    leave() {
      const m = R.musicBox;
      tweenTo(m.lid.rotation, 'x', 0, 400);
      scaleTo(m.star, 0.001, 300);
      tweenTo(m.star.position, 'y', 0.12, 300);
      cancel(m.spin);
      stopEvery('music');
    },
  },
  seedBag: {
    enter() {
      const s = R.seedBag;
      tweenTo(s.inner.rotation, 'z', -0.5, 500);
      scaleTo(s.sprout, 1, 900, { ease: ease.outBack, delay: 300 });
      every('seeds', () => {
        for (let i = 0; i < 2; i++) emit(TEX.flake, worldOf(s.inner, s.mouth), { vel: v3(rand(0.2, 0.6), 0, rand(-0.1, 0.1)), gravity: 3, size: 0.025, decay: 1, color: pick([0xf2c35b, 0xffe9a8]) });
      }, 60);
      later('seedsStop', () => stopEvery('seeds'), 800);
    },
    leave() {
      tweenTo(R.seedBag.inner.rotation, 'z', 0, 400);
      scaleTo(R.seedBag.sprout, 0.001, 300);
      stopEvery('seeds');
    },
  },
  pots: {
    enter(obj) {
      R.pots.forEach((p, i) => wobble(p.rotation, 'z', 0.2, 500, 3, { delay: i * 130 }));
      say(worldOf(obj, v3(0, 0.4, 0)), '¡clin!');
    },
    leave() {},
  },
  can: {
    enter() {
      const c = R.can;
      tweenTo(c.inner.rotation, 'z', -0.5, 500);
      every('pour', () => drops(worldOf(c.body, c.spout), 2), 50);
    },
    leave() {
      tweenTo(R.can.inner.rotation, 'z', 0, 400);
      stopEvery('pour');
    },
  },
  holly: {
    enter() {
      wobble(R.holly.leaves.rotation, 'y', 0.3, 800, 3);
      for (let i = 0; i < 4; i++) emit(TEX.flake, worldOf(R.holly.leaves, v3(rand(-0.1, 0.1), 0.2, rand(-0.1, 0.1))), { vel: v3(rand(-0.3, 0.3), 0.4, rand(-0.3, 0.3)), gravity: 3, size: 0.04, decay: 0.9, color: 0xd0262f });
    },
    leave() {},
  },
  chickadee: {
    enter() {
      const c = R.chickadee;
      run(450, (e, p) => { c.root.position.y = c.base.y + Math.sin(p * Math.PI) * 0.12; c.root.position.x = c.base.x - e * 0.08; });
      wobble(c.head.rotation, 'z', -0.8, 900, 3, { delay: 450 });
      say(worldOf(c.head, v3(0, 0.12, 0)), '¡chic-a-dí!');
    },
    leave() {
      const c = R.chickadee;
      run(400, (e) => { c.root.position.x = lerp(c.base.x - 0.08, c.base.x, e); });
    },
  },
  jackGift: {
    enter() {
      const g = R.jackGift;
      tweenTo(g.lid.rotation, 'x', -1.9, 450, { ease: ease.outBack });
      tweenTo(g.jack.scale, 'y', 1, 700, { ease: ease.outBack, delay: 150 });
      sparks(worldOf(g.root, v3(0, 0.6, 0)), 18, 1.6);
      say(worldOf(g.root, v3(0, 0.75, 0)), 'ilusión', '#ffd27a');
    },
    leave() {
      const g = R.jackGift;
      tweenTo(g.jack.scale, 'y', 0.001, 300);
      tweenTo(g.lid.rotation, 'x', 0, 400, { delay: 150 });
    },
  },
  confettiGift: {
    enter() {
      const g = R.confettiGift;
      if (g.flying) return;
      g.flying = true;
      run(900, (e, p) => {
        g.lid.position.y = g.bodyH + Math.sin(p * Math.PI) * 0.5;
        g.lid.rotation.y = e * TAU;
        g.lid.rotation.x = Math.sin(p * Math.PI) * -0.6;
      }, { ease: ease.linear, done: () => { g.lid.position.y = g.bodyH; g.lid.rotation.set(0, 0, 0); g.flying = false; } });
      confetti(worldOf(g.root, v3(0, 0.25, 0)), 60);
      say(worldOf(g.root, v3(0, 0.6, 0)), '¡fiesta!', '#ffe08a');
    },
    leave() {},
  },
  squirrel: {
    enter() {
      const s = R.squirrel;
      s.paused = true;
      scaleTo(s.acorn, 0.001, 200);
      scaleTo(s.mini, 1, 400, { ease: ease.outBack, delay: 150 });
      tweenTo(s.mini.position, 'y', 0.3, 400, { delay: 150 });
      wobble(s.tail.rotation, 'z', 0.25, 900, 3);
      sparks(worldOf(s.head, v3(0.1, 0.05, 0)), 10, 1);
    },
    leave() {
      const s = R.squirrel;
      s.paused = false;
      scaleTo(s.acorn, 1, 300, { delay: 150 });
      scaleTo(s.mini, 0.001, 250);
      tweenTo(s.mini.position, 'y', 0.15, 250);
    },
  },
  tree: {
    enter() {
      treeChaseUntil = performance.now() + 4000;
      shakeOrnaments(1.2);
      wobble(R.tree.tree.rotation, 'y', 0.06, 900, 2);
    },
    leave() {},
  },
  treeStar: {
    enter() {
      tweenTo(R.star.rotation, 'y', R.star.rotation.y + TAU, 900, { ease: ease.outBack });
      scaleTo(R.star, 1.35, 500, { ease: ease.outBack });
      scaleTo(R.starGlow, 0.9, 500);
      sparks(worldOf(R.star), 26, 2.2);
    },
    leave() {
      scaleTo(R.star, 1, 400);
      scaleTo(R.starGlow, 0.55, 400);
    },
  },
  cardinal: {
    enter() {
      const c = R.cardinal;
      if (c.flying) return;
      c.flying = true;
      const b = c.base;
      run(2400, (e, p) => {
        const a = p * TAU;
        c.root.position.set(b.x + Math.sin(a) * 0.9, b.y + Math.sin(p * Math.PI) * 1.1, b.z + (1 - Math.cos(a)) * 0.6);
        c.root.rotation.y = -2.3 - a;
        c.wings.forEach((w, i) => { w.rotation.x = Math.sin(p * 90) * (i ? -1 : 1) * 0.9; });
      }, { ease: ease.inOutSine, done: () => { c.root.position.copy(b); c.root.rotation.y = -2.3; c.wings.forEach((w) => { w.rotation.x = 0; }); c.flying = false; } });
      notes(worldOf(c.head), 3, 0xff8a8a);
    },
    leave() {},
  },
  rabbit: {
    enter() {
      const r = R.rabbit;
      r.paused = true;
      r.ears.forEach((e, i) => tweenTo(e.rotation, 'z', 0.3, 300));
      run(950, (e, p) => {
        r.root.position.y = Math.abs(Math.sin(p * Math.PI * 2)) * (p < 0.5 ? 0.35 : 0.15);
      }, { ease: ease.linear, done: () => puff(r.root.position.clone(), 16, 0.15) });
    },
    leave() {
      const r = R.rabbit;
      r.paused = false;
      r.ears.forEach((e) => tweenTo(e.rotation, 'z', -0.15, 300));
    },
  },
  sparrow: {
    enter() {
      const s = R.sparrow;
      s.paused = true;
      cancel(s.back);
      const from = s.root.position.clone();
      run(1100, (e) => {
        s.root.position.set(from.x + e * 2.5, from.y + e * 3, from.z - e * 2);
        s.wings.forEach((w, i) => { w.rotation.x = Math.sin(e * 60) * (i ? -1 : 1) * 1.1; });
      }, { ease: (p) => p * p });
      scaleTo(s.root, 0.001, 1100);
      puff(from, 8, 0.1);
    },
    leave() {
      const s = R.sparrow;
      later('sparrowBack', () => {
        s.root.position.copy(s.base).add(v3(0, 1.5, 0));
        scaleTo(s.root, 1, 600);
        s.back = run(800, (e) => { s.root.position.y = s.base.y + (1 - e) * 1.5; s.wings.forEach((w, i) => { w.rotation.x = Math.sin(e * 40) * (i ? -1 : 1) * (1 - e); }); }, { done: () => { s.paused = false; } });
      }, 900);
    },
  },
  robin: {
    enter() {
      const r = R.robin;
      r.paused = true;
      const from = r.root.position.clone();
      run(700, (e, p) => {
        r.root.position.set(from.x - e * 0.35, Math.abs(Math.sin(p * Math.PI * 2)) * 0.08, from.z + e * 0.1);
      });
      say(worldOf(r.head, v3(0, 0.15, 0)), '¡pío!', '#ff9a7a');
    },
    leave() {
      const r = R.robin;
      const from = r.root.position.clone();
      run(600, (e) => r.root.position.lerpVectors(from, r.base, e), { done: () => { r.paused = false; } });
    },
  },
  sack: {
    enter() {
      wobble(R.sack.inner.rotation, 'z', 0.08, 700, 3);
      tweenTo(R.sack.peek.position, 'y', 0.97, 400, { ease: ease.outBack });
    },
    leave() { tweenTo(R.sack.peek.position, 'y', 0.82, 300); },
  },
  fallingGift: {
    enter(obj) {
      const g = obj.userData.gift;
      tweenTo(g.lid.rotation, 'x', -1.8, 400, { ease: ease.outBack });
      sparks(worldOf(g.root, v3(0, g.h, 0)), 12, 1.2);
      say(worldOf(g.root, v3(0, g.h + 0.2, 0)), g.word, '#ffd27a');
      if (g.settled) { g.vel.y = 2.4; g.settled = false; }
    },
    leave(obj) { tweenTo(obj.userData.gift.lid.rotation, 'x', 0, 400); },
  },
  toy: {
    enter(obj) {
      const y0 = obj.position.y;
      run(650, (e, p) => { obj.position.y = y0 + Math.sin(p * Math.PI) * 0.12; }, { ease: ease.linear });
      wobble(obj.rotation, 'z', 0.12, 700, 2);
      R.spinners.forEach((s) => { s.boost = 1; });
      sparks(worldOf(obj, v3(0, 0.3, 0)), 10, 1.1);
      if (obj.userData.sound) playSound(obj.userData.sound, { volume: 0.75 });
    },
    leave() {},
  },
  toyGift: {
    enter(obj) {
      tweenTo(obj.userData.gift.lid.rotation, 'x', -1.6, 400, { ease: ease.outBack });
      sparks(worldOf(obj, v3(0, 0.35, 0)), 12, 1.2);
      say(worldOf(obj, v3(0, 0.45, 0)), pick(GIFT_WORDS), '#ffd27a');
    },
    leave(obj) { tweenTo(obj.userData.gift.lid.rotation, 'x', 0, 400); },
  },
  roofBird: {
    enter() {
      say(worldOf(R.roofBird.head, v3(0, 0.15, 0)), '¡pío, pío!', '#ffd0d0');
      jayVisitNest();
    },
    leave() {},
  },
  nest: {
    enter() {
      R.nest.hungry = 1;
      say(worldOf(R.nest.root, v3(0, 0.25, 0)), '¡pío, pío!', '#fff3c4');
      later('jayCall', jayVisitNest, 400);
    },
    leave() {},
  },
  shedDoor: {
    enter() { tweenTo(R.shedDoor.hinge.rotation, 'y', -1.35, 700, { ease: ease.outBack }); },
    leave() { tweenTo(R.shedDoor.hinge.rotation, 'y', SHED_DOOR.open, 900); },
  },
  lantern: {
    enter(obj) {
      const l = R.lanterns.find((q) => q.root === obj);
      if (l) l.boost = 0.9;
      sparks(worldOf(obj, v3(0, 0.3, 0)), 10, 0.9, 0xffc060);
      wobble(obj.rotation, 'z', 0.08, 600, 2);
    },
    leave() {},
  },
  snowPile: {
    enter(obj) {
      puff(worldOf(obj, v3(0, 0.12, 0)), 12, 0.3);
      wobble(obj.scale, 'y', 0.18, 600, 2);
    },
    leave() {},
  },
  santa: {
    enter() {
      const S = R.santa;
      say(worldOf(S.head, v3(0, 0.4, 0)), '¡Jo, jo, jo!', '#ffe08a');
      sparks(worldOf(S.sl, v3(0, 0.6, 0)), 30, 2.4, 0xffd27a);
      wobble(S.head.rotation, 'y', 0.5, 900, 2);
      S.waveUntil = performance.now() + 2600;
    },
    leave() {},
  },
};

/* ---------- Raycasting: qué objeto 3D hay bajo el cursor ---------- */
let rayTargets = [];
let hovered = null;
let cursorPoint = null;
let cursorHit = null;

// Solo proyectan sombra las piezas que se notan (rendimiento)
function optimizeShadows() {
  const sphere = new THREE.Sphere();
  const sc = new THREE.Vector3();
  let casters = 0;
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    if (!o.isMesh || !o.castShadow) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    sphere.copy(o.geometry.boundingSphere);
    o.getWorldScale(sc);
    const radius = sphere.radius * Math.max(sc.x, sc.y, sc.z);
    o.getWorldPosition(sc);
    if (radius < 0.05 || sc.z < -8.5) o.castShadow = false;
    else casters++;
  });
  return casters;
}

// Si el ordenador va justo, se reduce la calidad automáticamente
const perf = { frames: 0, time: 0, checked: false };
function adaptQuality(dt) {
  if (perf.checked) return;
  perf.frames++;
  perf.time += dt;
  if (perf.time > 4) {
    perf.checked = true;
    const fps = perf.frames / perf.time;
    if (fps < 40) {
      lights.cursor.castShadow = false;
      renderer.setPixelRatio(1);
      renderer.setSize(W, H, false);
      setComposerSize();
    }
    if (fps < 25) {
      post.enabled = false;   // sin postprocesado: se dibuja directamente (con antialias del navegador)
      lights.key.shadow.mapSize.set(1024, 1024);
      lights.key.shadow.map && lights.key.shadow.map.dispose();
      lights.key.shadow.map = null;
    }
  }
}

// Árbol de cajas (BVH) en cada malla grande: un rayo ya no prueba todos los triángulos,
// solo los de las cajas que atraviesa. Hace casi gratis el cursor y la física de los regalos.
function setupBVH() {
  const lib = window.MeshBVHLib;
  if (!lib) return;
  THREE.BufferGeometry.prototype.computeBoundsTree = lib.computeBoundsTree;
  THREE.Mesh.prototype.raycast = lib.acceleratedRaycast;
  const done = new Set();
  scene.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.noRay || !o.geometry || done.has(o.geometry)) return;
    const g = o.geometry;
    const tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    if (tris < 200 || g.boundsTree) return;
    done.add(g);
    try { g.computeBoundsTree({ maxLeafTris: 8 }); } catch (err) { /* geometría rara: se queda con el rayo normal */ }
  });
}

function collectRayTargets() {
  rayTargets = [];
  scene.traverse((o) => {
    if (o.isMesh && !o.userData.noRay) rayTargets.push(o);
  });
  // la escena fija (suelo, caseta, árbol, banco…) sirve de "suelo" para los regalos que caen;
  // se excluyen piezas finas como la hierba, los carámbanos o los cables de luces
  const noCollide = (o) => { for (; o; o = o.parent) if (o.userData.noCollide) return true; return false; };
  staticColliders = rayTargets.filter((o) => !noCollide(o));
}

function reactOwner(obj) {
  while (obj) {
    if (obj.userData && obj.userData.react) return obj;
    obj = obj.parent;
  }
  return null;
}

function updateHover() {
  if (!mouse.inside) {
    if (hovered) setHovered(null);
    return;
  }
  pointerNDC.set((mouse.x / W) * 2 - 1, -(mouse.y / H) * 2 + 1);
  ray.setFromCamera(pointerNDC, camera);
  if (!mouse.moved) return;
  mouse.moved = false;
  const hits = ray.intersectObjects(rayTargets, false);
  if (hits.length) {
    cursorHit = hits[0];
    cursorPoint = hits[0].point.clone();
    setHovered(reactOwner(hits[0].object));
  } else {
    cursorHit = null;
    cursorPoint = ray.ray.at(10, new THREE.Vector3());
    setHovered(null);
  }
}

function setHovered(obj) {
  if (obj === hovered) return;
  if (hovered) REACTIONS[hovered.userData.react].leave(hovered);
  hovered = obj;
  if (hovered) {
    REACTIONS[hovered.userData.react].enter(hovered);
    tooltip.textContent = hovered.userData.label;
    tooltip.style.opacity = '1';
    setCursorScale(1.7);
  } else {
    tooltip.style.opacity = '0';
    setCursorScale(1);
  }
}

/* =========================================================
   11 · REGALOS QUE CAEN (física sencilla en 3D)
   ========================================================= */
const fallingGifts = [];
const GIFT_WORDS = ['risas', 'ilusión', 'juego', 'abrazos', 'magia', 'sueños', 'alegría', 'calor', 'amigos', 'cuentos', 'futuro'];

let staticColliders = [];
const downRay = new THREE.Raycaster();
downRay.firstHitOnly = true;
const DOWN = new THREE.Vector3(0, -1, 0);

// Fase amplia: en cada fotograma se actualiza la esfera envolvente de cada pieza
// (algunas se mueven, como los animales) y cada regalo solo lanza rayos contra
// las piezas que tiene cerca, no contra toda la escena.
const colliderBounds = [];
let boundsFrame = -1, physFrame = 0;
let nearColliders = staticColliders;
function refreshColliderBounds() {
  if (boundsFrame === physFrame) return;
  boundsFrame = physFrame;
  for (let i = 0; i < staticColliders.length; i++) {
    const o = staticColliders[i];
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const b = colliderBounds[i] || (colliderBounds[i] = new THREE.Sphere());
    b.copy(o.geometry.boundingSphere).applyMatrix4(o.matrixWorld);
  }
}
const _near = [];
function selectNear(g) {
  refreshColliderBounds();
  const p = g.root.position;
  const reach = g.radius / 0.85 + Math.hypot(g.vel.x, g.vel.z) * 0.05 + 0.1;
  const top = p.y + g.h + Math.max(0, g.vel.y) * 0.05 + 0.2;
  _near.length = 0;
  for (let i = 0; i < staticColliders.length; i++) {
    const b = colliderBounds[i];
    if (b.center.y - b.radius > top) continue;           // está por encima: no le afecta
    const dx = b.center.x - p.x, dz = b.center.z - p.z, rr = b.radius + reach;
    if (dx * dx + dz * dz > rr * rr) continue;            // está lejos en horizontal
    _near.push(staticColliders[i]);
  }
  nearColliders = _near;
}

// Primera superficie fija justo debajo de (x, fromY, z): su altura y su inclinación
function surfaceBelow(x, fromY, z) {
  const gNormal = v3(0, 1, 0);
  const gy = groundAt(x, z, gNormal);
  downRay.set(v3(x, fromY, z), DOWN);
  downRay.far = Math.max(0.01, fromY - gy);
  const hit = nearColliders.length ? downRay.intersectObjects(nearColliders, false)[0] : null;
  if (!hit) return { y: gy, normal: gNormal };
  const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : v3(0, 1, 0);
  if (normal.y < 0) normal.negate();
  return { y: hit.point.y, normal };
}

// Suelo bajo toda la base del regalo (centro + 6 puntos del borde): así
// ninguna esquina se hunde en el tejado, el banco o el borde de un montículo
const FOOT = Array.from({ length: 6 }, (_, i) => [Math.cos(i / 6 * TAU), Math.sin(i / 6 * TAU)]);
function footprintFloor(g) {
  const p = g.root.position;
  // el rayo sale desde donde estaba antes (más alto): así no se "salta" un tejado o el banco
  const from = Math.max(p.y, g.prev ? g.prev.y : p.y) + g.h * 0.9;
  const center = surfaceBelow(p.x, from, p.z);
  // muy por encima de lo que tiene debajo (cayendo por el aire): basta con el rayo central
  if (g.prev && !g.settled && p.y - center.y > 0.6) return { y: center.y, centerY: center.y, normal: center.normal, overhang: null };
  const rr = g.radius * 0.65;
  const samples = FOOT.map(([cx, cz]) => ({ cx, cz, y: surfaceBelow(p.x + cx * rr, from, p.z + cz * rr).y }));
  const y = Math.max(center.y, ...samples.map((s) => s.y));
  // ¿cuelga de un borde? (el centro no apoya y lo que sujeta está todo a un lado)
  let overhang = null;
  if (center.y < y - 0.05) {
    let ax = 0, az = 0, n = 0;
    for (const s of samples) if (s.y > y - 0.04) { ax += s.cx; az += s.cz; n++; }
    ax /= n; az /= n;
    const len = Math.hypot(ax, az);
    if (len > 0.3) overhang = v3(-ax / len, 0, -az / len);   // dirección hacia la que vuelca
  }
  return { y, centerY: center.y, normal: center.normal, overhang };
}

// Choque lateral: un rayo horizontal en la dirección del movimiento, a dos
// alturas; si hay una pared, la chimenea, una pata del banco… el regalo se para ahí
const sideRay = new THREE.Raycaster();
function blockHorizontal(g, prev) {
  const p = g.root.position;
  const mx = p.x - prev.x, mz = p.z - prev.z;
  const len = Math.hypot(mx, mz);
  if (len < 1e-5) return;
  const dir = v3(mx / len, 0, mz / len);
  let best = null;
  const reach = g.radius / 0.85;            // media diagonal completa: ninguna esquina entra en la pared
  for (const hFrac of [0.25, 0.75]) {
    sideRay.set(v3(prev.x, prev.y + g.h * hFrac, prev.z), dir);
    sideRay.far = len + reach;
    for (const hit of sideRay.intersectObjects(nearColliders, false)) {
      const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : dir.clone().negate();
      if (Math.abs(n.y) > 0.7) continue;   // suelos y tejados los gestiona footprintFloor
      if (!best || hit.distance < best.d) best = { d: hit.distance, n };
      break;
    }
  }
  if (!best) return;
  const allowed = Math.max(0, best.d - reach);
  p.x = prev.x + dir.x * allowed;
  p.z = prev.z + dir.z * allowed;
  // quita la velocidad que va contra la pared (con un pequeño rebote)
  const nh = v3(best.n.x, 0, best.n.z).normalize();
  const vn = g.vel.x * nh.x + g.vel.z * nh.z;
  if (vn < 0) { g.vel.x -= nh.x * vn * 1.3; g.vel.z -= nh.z * vn * 1.3; }
}

// Si alguna esquina ha quedado pegada a una pared (p. ej. al caer en vertical
// junto a ella), se le aparta lo justo. Rayos cortos en 8 direcciones.
const PUSH_DIRS = Array.from({ length: 8 }, (_, i) => v3(Math.cos(i / 8 * TAU), 0, Math.sin(i / 8 * TAU)));
function pushOutOfWalls(g) {
  const p = g.root.position;
  const reach = g.radius / 0.85;
  for (const hFrac of [0.2, 0.7]) {
    for (const dir of PUSH_DIRS) {
      sideRay.set(v3(p.x, p.y + g.h * hFrac, p.z), dir);
      sideRay.far = reach;
      const hit = sideRay.intersectObjects(nearColliders, false)[0];
      if (!hit || !hit.face) continue;
      const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      if (Math.abs(n.y) > 0.7) continue;
      p.x -= dir.x * (reach - hit.distance);
      p.z -= dir.z * (reach - hit.distance);
    }
  }
}

// Techo: si sube (rebote, saco…) no atraviesa el alero ni el banco por debajo
const UP = new THREE.Vector3(0, 1, 0);
function blockCeiling(g, prevY, dt) {
  if (g.vel.y <= 0) return;
  const p = g.root.position;
  sideRay.set(v3(p.x, prevY + g.h * 0.5, p.z), UP);
  sideRay.far = g.h * 0.5 + g.vel.y * dt + 0.02;
  const hit = sideRay.intersectObjects(nearColliders, false)[0];
  if (hit) { p.y = Math.min(p.y, hit.point.y - g.h - 0.01); g.vel.y = -0.2; }
}

function dropGift(x, z, floorY, vel) {
  if (fallingGifts.length >= 16) removeGift(fallingGifts[0]);
  const s = rand(0.22, 0.36);
  const ribbon = pick([ribbonGold(), MAT.red, MAT.cream, MAT.green]);
  const g = makeGift(scene, s * rand(0.9, 1.3), s, s * rand(0.9, 1.2), pick(MAT.papers), ribbon, [x, vel ? floorY + 0.3 : 7, z]);
  g.root.rotation.set(rand(-0.5, 0.5), rand(0, TAU), rand(-0.5, 0.5));
  g.vel = vel || v3(0, 0, 0);
  g.spin = v3(rand(-3, 3), rand(-3, 3), rand(-3, 3));
  // huella circular para chocar con otros regalos (incluye la tapa, algo más ancha)
  g.radius = Math.hypot(g.w, g.d) * 0.5 * 1.07 * 0.85;
  g.floor = 0;
  g.floorAt = null;   // posición (x, z) donde se calculó el suelo fijo
  g.settled = false;
  g.word = pick(GIFT_WORDS);
  g.born = performance.now();
  g.root.userData.gift = g;
  makeReact(g.root, 'fallingGift', 'Un regalo caído del cielo');
  g.root.traverse((o) => { if (o.isMesh) rayTargets.push(o); });
  fallingGifts.push(g);
}

function removeGift(g) {
  scene.remove(g.root);
  const meshes = new Set();
  g.root.traverse((o) => { if (o.isMesh) meshes.add(o); });
  rayTargets = rayTargets.filter((o) => !meshes.has(o));
  const i = fallingGifts.indexOf(g);
  if (i >= 0) fallingGifts.splice(i, 1);
  if (hovered === g.root) setHovered(null);
  // los regalos que estaban apoyados encima vuelven a caer
  fallingGifts.forEach((o) => { if (o.settled) o.settled = false; });
}

const giftTop = (g) => g.root.position.y + g.h * g.root.scale.y;

// Suelo real bajo un regalo: la escena fija o la tapa de otro regalo
function supportFor(g) {
  const p = g.root.position;
  if (!g.floorAt || Math.hypot(p.x - g.floorAt.x, p.z - g.floorAt.z) > 0.03) {
    const s = footprintFloor(g);
    g.floor = s.y;
    g.centerFloor = s.centerY;
    g.floorNormal = s.normal;
    g.overhang = s.overhang;
    g.floorAt = { x: p.x, z: p.z };
  }
  let floor = g.floor;
  g.onGift = false;
  for (const o of fallingGifts) {
    if (o === g || o.tilted) continue;   // sobre un regalo inclinado no se puede apilar
    const top = giftTop(o);
    // solo cuenta si está debajo (su tapa no supera la mitad de este regalo)
    if (top > p.y + g.h * 0.5) continue;
    const dist = Math.hypot(p.x - o.root.position.x, p.z - o.root.position.z);
    if (dist < (g.radius + o.radius) * 0.75 && top > floor) { floor = top; g.onGift = true; }
  }
  return floor;
}

// Los regalos no se atraviesan de lado: se empujan en el plano XZ
function separateGifts() {
  for (let i = 0; i < fallingGifts.length; i++) {
    const a = fallingGifts[i], pa = a.root.position;
    for (let j = i + 1; j < fallingGifts.length; j++) {
      const b = fallingGifts[j], pb = b.root.position;
      // ¿se solapan en altura?
      if (pa.y >= giftTop(b) - 0.02 || pb.y >= giftTop(a) - 0.02) continue;
      let dx = pa.x - pb.x, dz = pa.z - pb.z;
      let dist = Math.hypot(dx, dz);
      const min = a.radius + b.radius;
      if (dist >= min) continue;
      if (dist < 1e-4) { dx = rand(-1, 1); dz = rand(-1, 1); dist = Math.hypot(dx, dz); }
      const push = (min - dist) / dist;
      // el que está quieto se mueve menos
      const wa = a.settled && !b.settled ? 0.15 : b.settled && !a.settled ? 0.85 : 0.5;
      pa.x += dx * push * wa;       pa.z += dz * push * wa;
      pb.x -= dx * push * (1 - wa); pb.z -= dz * push * (1 - wa);
      // si un regalo quieto se desplaza, comprueba de nuevo si sigue apoyado
      if (a.settled && wa > 0.2) a.settled = false;
      if (b.settled && wa < 0.8) b.settled = false;
      // rebote suave entre los dos
      const nx = dx / dist, nz = dz / dist;
      const rel = (a.vel.x - b.vel.x) * nx + (a.vel.z - b.vel.z) * nz;
      if (rel < 0) {
        a.vel.x -= rel * nx * 0.6; a.vel.z -= rel * nz * 0.6;
        b.vel.x += rel * nx * 0.6; b.vel.z += rel * nz * 0.6;
      }
    }
  }
}

// El ciervo, el zorro, el conejo y los juguetes que andan no atraviesan los regalos: los empujan
const _animalPos = new THREE.Vector3();
function pushGiftsByAnimals() {
  if (!fallingGifts.length) return;
  const movers = [[R.deer && R.deer.root, 0.42], [R.fox && R.fox.root, 0.3], [R.rabbit && R.rabbit.root, 0.2]];
  if (R.toyLife && R.toyLife.alive) R.toyLife.list.forEach((t) => { if (t.kind === "car" || t.kind === "robot") movers.push([t.obj, 0.16]); });
  for (const [obj, r] of movers) {
    if (!obj || !obj.visible) continue;
    obj.getWorldPosition(_animalPos);
    for (const g of fallingGifts) {
      const p = g.root.position;
      if (p.y > _animalPos.y + 1.2) continue;
      const dx = p.x - _animalPos.x, dz = p.z - _animalPos.z;
      const d = Math.hypot(dx, dz), min = r + g.radius;
      if (d >= min || d < 1e-4) continue;
      const k = (min - d) / d;
      p.x += dx * k; p.z += dz * k;
      g.vel.x += dx / d * 0.6; g.vel.z += dz / d * 0.6;
      if (g.settled) { g.settled = false; g.vel.y = 0.8; g.spin.set(rand(-2, 2), rand(-2, 2), rand(-2, 2)); }
    }
  }
}

function updateGifts(dt) {
  const now = performance.now();
  physFrame++;
  dt = Math.min(dt, 1 / 30); // evita que atraviesen cosas si un fotograma tarda mucho
  for (let i = fallingGifts.length - 1; i >= 0; i--) {
    const g = fallingGifts[i];
    const age = (now - g.born) / 1000;
    if (age > 12) {
      const k = Math.max(0.001, 1 - (age - 12) * 2);
      g.root.scale.setScalar(k);
      if (k <= 0.001) { removeGift(g); continue; }
    }
  }

  separateGifts();
  pushGiftsByAnimals();
  // si al separarlos uno se ha metido en una pared, se le frena ahí
  for (const g of fallingGifts) if (g.last) { selectNear(g); blockHorizontal(g, g.last); }

  // de abajo arriba, para que cada regalo vea ya colocado al que tiene debajo
  const order = fallingGifts.slice().sort((a, b) => a.root.position.y - b.root.position.y);
  for (const g of order) {
    const p = g.root.position;
    g.prev = p.clone();
    if (g.settled) {
      // cada medio segundo comprueba que sigue apoyado (p. ej. si un animal se movió)
      if (now - g.checkedAt < 500) continue;
      g.checkedAt = now;
      g.floorAt = null;
      selectNear(g);
      if (supportFor(g) >= p.y + (g.sunk || 0) - 0.01 && !(g.overhang && !g.onGift)) continue;
      p.y += g.sunk || 0;
      g.sunk = 0;
      g.settled = false;
    }

    // subpasos: nunca avanza más de 6 cm de golpe, así no atraviesa tablas ni tejas
    const steps = Math.min(3, Math.max(1, Math.ceil(g.vel.length() * dt / 0.1)));
    const sdt = dt / steps;
    let floor = 0;
    for (let k = 0; k < steps; k++) {
      g.prev.copy(p);
      selectNear(g);
      g.vel.y -= 9.8 * sdt;
      p.addScaledVector(g.vel, sdt);
      blockHorizontal(g, g.prev);
      blockCeiling(g, g.prev.y, sdt);
      floor = supportFor(g);
      if (p.y <= floor) break;
    }
    pushOutOfWalls(g);
    g.root.rotation.x += g.spin.x * dt;
    g.root.rotation.y += g.spin.y * dt;
    g.root.rotation.z += g.spin.z * dt;

    if (p.y <= floor) {
      const impact = Math.abs(g.vel.y);
      p.y = floor;
      g.vel.y = impact * 0.35;
      g.vel.x *= 0.6;
      g.vel.z *= 0.6;
      g.spin.multiplyScalar(0.5);
      if (impact > 1) {
        puff(p.clone(), impact > 4 ? 9 : 5, 0.1 + impact * 0.015);
        // en la nieve blanda (el suelo, no un objeto) se hunde un poquito
        if (!g.onGift && Math.abs(floor - groundAt(p.x, p.z)) < 0.02) g.sink = Math.min(0.05, impact * 0.006);
      }
      const n = g.floorNormal;
      g.slideTime = (g.slideTime || 0) + dt;
      if (!g.onGift && g.overhang && g.slideTime < 3) {
        // medio regalo en el aire: vuelca y cae por el borde (alero, banco, tejado…)
        g.vel.x += g.overhang.x * 1.5;
        g.vel.z += g.overhang.z * 1.5;
        g.vel.y = Math.min(g.vel.y, 0.3);
        g.spin.x += g.overhang.z * 4;
        g.spin.z -= g.overhang.x * 4;
      } else if (!g.onGift && n && n.y < 0.9 && g.slideTime < 1.5) {
        // superficie inclinada (p. ej. el tejado): resbala cuesta abajo
        g.vel.x += n.x * 9.8 * dt * 2;
        g.vel.z += n.z * 9.8 * dt * 2;
        g.vel.y = Math.min(g.vel.y, 0.5);
      } else if (impact < 0.8 || g.slideTime >= 1.5) {
        g.slideTime = 0;
        g.vel.set(0, 0, 0);
        g.spin.set(0, 0, 0);
        g.settled = true;
        g.checkedAt = now;
        // en una pendiente uniforme se inclina como ella; en una cumbre (el centro es lo más alto) queda recto
        if (!g.onGift && n && n.y < 0.97 && n.y > 0.6 && g.floor - g.centerFloor > 0.03) {
          // apoyado por el centro, siguiendo la pendiente (sin hundirse)
          const yaw = new THREE.Quaternion().setFromAxisAngle(v3(0, 1, 0), g.root.rotation.y);
          g.root.quaternion.setFromUnitVectors(v3(0, 1, 0), n).multiply(yaw);
          p.y = g.centerFloor;
          g.tilted = true;
        } else {
          g.tilted = false;
          tweenTo(g.root.rotation, 'x', 0, 300);
          tweenTo(g.root.rotation, 'z', 0, 300);
          if (g.sink) { p.y -= g.sink; g.sunk = g.sink; g.sink = 0; }
        }
      }
    }
  }
  for (const g of fallingGifts) g.last = g.root.position.clone();
}

function spillFromSack() {
  const top = worldOf(R.sack.inner, v3(0, 0.95, 0));
  for (let i = 0; i < 5; i++) {
    dropGift(top.x, top.z, 0, v3(rand(-1.6, -0.4), rand(3, 4.5), rand(0.2, 1.2)));
    fallingGifts[fallingGifts.length - 1].root.position.y = top.y;
  }
  sparks(top, 24, 2);
}

/* =========================================================
   12 · CAPA HTML: titular, palabras, sello, botón y marca
   (estos sí usan mouseenter / mouseleave del DOM)
   ========================================================= */
let letters = [];
const badgeState = { angle: 0, speed: 0.25, targetSpeed: 0.25 };
const ctaState = { x: 0, y: 0, scale: 1, targetScale: 1, cx: 0, cy: 0 };

function toPosterCoords(clientX, clientY) {
  const rect = poster.getBoundingClientRect();
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
}

function centerOf(el) {
  const r = el.getBoundingClientRect();
  return toPosterCoords(r.left + r.width / 2, r.top + r.height / 2);
}

function splitHeadline() {
  let index = 0;
  headline.querySelectorAll('.line').forEach((line) => {
    const text = line.textContent;
    line.textContent = '';
    [...text].forEach((char) => {
      const outer = document.createElement('span');
      outer.setAttribute('aria-hidden', 'true');
      if (char === ' ') {
        outer.className = 'ch space';
      } else {
        outer.className = 'ch';
        const inner = document.createElement('span');
        inner.className = 'ch-in';
        inner.textContent = char;
        inner.style.animationDelay = `${0.6 + index * 0.05}s`;
        outer.appendChild(inner);
        // neón: cada letra parpadea con su propio ritmo; dos letras están "estropeadas"
        outer.style.setProperty('--fd', `${rand(7, 15).toFixed(2)}s`);
        outer.style.setProperty('--fdelay', `${(-rand(0, 15)).toFixed(2)}s`);
        letters.push({ el: outer, cx: 0, cy: 0, x: 0, y: 0, r: 0, hot: false });
        index++;
      }
      line.appendChild(outer);
    });
  });
}

function measureLayout() {
  letters.forEach((l) => {
    const c = centerOf(l.el);
    l.cx = c.x - l.x;
    l.cy = c.y - l.y;
  });
  if (!cta) return;
  const c = centerOf(cta);
  ctaState.cx = c.x - ctaState.x;
  ctaState.cy = c.y - ctaState.y;
}

function updateLetters() {
  const RADIUS = 150;
  letters.forEach((l) => {
    let tx = 0, ty = 0, tr = 0, hot = false;
    if (mouse.inside) {
      const dx = l.cx - mouse.x, dy = l.cy - mouse.y;
      const d = Math.hypot(dx, dy);
      if (d < RADIUS && d > 0.01) {
        const f = 1 - d / RADIUS;
        tx = (dx / d) * f * 26;
        ty = (dy / d) * f * 26;
        tr = Math.sign(dx) * f * 14;
        hot = f > 0.45;
      }
    }
    l.x = lerp(l.x, tx, 0.14);
    l.y = lerp(l.y, ty, 0.14);
    l.r = lerp(l.r, tr, 0.14);
    l.el.style.transform = `translate(${l.x.toFixed(2)}px, ${l.y.toFixed(2)}px) rotate(${l.r.toFixed(2)}deg)`;
    if (hot !== l.hot) {
      l.hot = hot;
      l.el.style.color = hot ? '#ffffff' : '';
    }
  });
}

const SHAKE = [
  { transform: 'rotate(0)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(4deg)' },
  { transform: 'rotate(-3deg)' }, { transform: 'rotate(2deg)' }, { transform: 'rotate(0)' },
];

const WORD_FX = {
  shake(word) {
    word.style.color = COLORS.red;
    word.style.backgroundColor = COLORS.cream;
    word.style.boxShadow = `0 0 0 4px ${COLORS.cream}`;
    word.animate(SHAKE, { duration: 500 });
    sparks(worldOf(R.jackGift.root, v3(0, 0.5, 0)), 10, 1.2);
  },
  smile(word) {
    word.style.transform = 'translateY(-6px) rotate(-6deg) scale(1.18)';
    word.style.color = '#ffd27a';
    word.style.letterSpacing = '.06em';
    hearts(worldOf(R.window.teddy, v3(0, 0.3, 0.2)), 3);
  },
  flip(word) {
    word.animate([{ transform: 'perspective(300px) rotateX(0)' }, { transform: 'perspective(300px) rotateX(360deg)' }], { duration: 700, easing: 'ease-out' });
    word.style.color = COLORS.gold;
  },
  hug(word) {
    word.style.backgroundColor = COLORS.red;
    word.style.color = COLORS.cream;
    word.style.boxShadow = `0 0 0 6px ${COLORS.red}, 0 8px 18px rgba(0,0,0,.35)`;
    word.style.transform = 'scale(1.06)';
  },
};

function handleWordEnter(event) {
  WORD_FX[event.currentTarget.dataset.fx](event.currentTarget);
  setCursorScale(1.5);
}
function handleWordLeave(event) {
  const w = event.currentTarget;
  w.style.color = '';
  w.style.backgroundColor = '';
  w.style.boxShadow = '';
  w.style.transform = '';
  w.style.letterSpacing = '';
  setCursorScale(1);
}

function flipDate(event) {
  event.currentTarget.style.transform = 'rotateX(360deg) scale(1.15)';
  event.currentTarget.style.color = COLORS.green;
  setCursorScale(1.5);
}
function restDate(event) {
  event.currentTarget.style.transform = '';
  event.currentTarget.style.color = '';
  setCursorScale(1);
}

const domAnims = {};
function rockLogo(event) {
  domAnims.logo = event.currentTarget.animate([{ transform: 'rotate(-5deg) scale(1.06)' }, { transform: 'rotate(5deg) scale(1.06)' }], { duration: 700, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
  setCursorScale(1.5);
}
function restLogo() {
  if (domAnims.logo) domAnims.logo.cancel();
  setCursorScale(1);
}

// Sello "10€ = 1 regalo": cada clic es una donación simbólica →
// cae un regalo del cielo en la escena 3D y sube el contador
let donatedGifts = 0;
function donateGift(event) {
  if (event) event.stopPropagation();
  dropGift(rand(-3, 3), rand(-1, 2), 0);
  donatedGifts++;
  const count = $('#badgeCount');
  count.textContent = `🎁 ${donatedGifts} ${donatedGifts === 1 ? 'regalo donado' : 'regalos donados'}`;
  count.classList.add('is-visible');
  badgeCore.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(.82)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
    { duration: 450, easing: 'ease-out' }
  );
}

function stampSeal(event) {
  event.currentTarget.style.transform = 'scale(.84) rotate(-14deg)';
  event.currentTarget.style.filter = 'drop-shadow(0 1px 1px rgba(40,30,50,.4))';
  setCursorScale(1.5);
}
function liftSeal(event) {
  event.currentTarget.style.transform = '';
  event.currentTarget.style.filter = '';
  setCursorScale(1);
}

function activateBadge() {
  badgeState.targetSpeed = 4;
  badge.style.transform = 'scale(1.12) rotate(-6deg)';
  badgeCore.style.background = 'radial-gradient(circle at 35% 30%, #ffe08a, #f2c35b 55%, #b8861c)';
  badgeCore.style.color = COLORS.ink;
  setCursorScale(1.6);
}
function deactivateBadge() {
  badgeState.targetSpeed = 0.25;
  badge.style.transform = '';
  badgeCore.style.background = '';
  badgeCore.style.color = '';
  setCursorScale(1);
}
function updateBadge() {
  badgeState.speed = lerp(badgeState.speed, badgeState.targetSpeed, 0.05);
  badgeState.angle = (badgeState.angle + badgeState.speed) % 360;
  badgeRing.style.transform = `rotate(${badgeState.angle.toFixed(2)}deg)`;
}

function activateCta() {
  if (!cta.dataset.original) cta.dataset.original = cta.textContent.trim();
  cta.textContent = cta.dataset.hover;
  cta.style.background = 'linear-gradient(180deg, #3f7d55, #24503a)';
  ctaState.targetScale = 1.1;
  setCursorScale(1.6);
}
function deactivateCta() {
  cta.textContent = cta.dataset.original;
  cta.style.background = '';
  ctaState.targetScale = 1;
  setCursorScale(1);
}
function updateCta() {
  if (!cta) return;
  let tx = 0, ty = 0;
  if (mouse.inside) {
    const dx = mouse.x - ctaState.cx, dy = mouse.y - ctaState.cy;
    if (Math.hypot(dx, dy) < 140) { tx = dx * 0.3; ty = dy * 0.3; }
  }
  ctaState.x = lerp(ctaState.x, tx, 0.15);
  ctaState.y = lerp(ctaState.y, ty, 0.15);
  ctaState.scale = lerp(ctaState.scale, ctaState.targetScale, 0.2);
  cta.style.transform = `translate(${ctaState.x.toFixed(1)}px, ${ctaState.y.toFixed(1)}px) scale(${ctaState.scale.toFixed(3)})`;
}

function setCursorScale(s) { cursor.targetScale = s; }
function updateCursor(time) {
  cursor.x = lerp(cursor.x, mouse.x, 0.35);
  cursor.y = lerp(cursor.y, mouse.y, 0.35);
  cursor.scale = lerp(cursor.scale, cursor.targetScale, 0.2);
  cursorEl.style.transform = `translate(${(cursor.x - 17).toFixed(1)}px, ${(cursor.y - 17).toFixed(1)}px) rotate(${((time * 50) % 360).toFixed(1)}deg) scale(${cursor.scale.toFixed(3)})`;
  tooltip.style.left = `${cursor.x}px`;
  tooltip.style.top = `${cursor.y - 18}px`;
}

/* =========================================================
   13 · EVENTOS DEL CARTEL
   ========================================================= */
function fitPoster() {
  const margin = 24;
  scale = Math.min((window.innerWidth - margin) / W, (window.innerHeight - margin) / H, 1);
  poster.style.transform = `scale(${scale})`;
  posterWrap.style.width = `${W * scale}px`;
  posterWrap.style.height = `${H * scale}px`;
  measureLayout();
}

function handlePosterMove(event) {
  const p = toPosterCoords(event.clientX, event.clientY);
  mouse.vx = p.x - mouse.x;
  mouse.vy = p.y - mouse.y;
  mouse.x = p.x;
  mouse.y = p.y;
  mouse.nx = (p.x / W) * 2 - 1;
  mouse.ny = (p.y / H) * 2 - 1;
  mouse.moved = true;
  if (!mouse.inside) {
    mouse.inside = true;
    cursor.x = p.x;
    cursor.y = p.y;
    cursorEl.style.opacity = '1';
  }
}

function handlePosterLeave() {
  mouse.inside = false;
  mouse.vx = mouse.vy = mouse.nx = mouse.ny = 0;
  cursorEl.style.opacity = '0';
  setHovered(null);
}

function handlePosterClick(event) {
  if (event.target.closest('.cta')) {
    if (cursorPoint) sparks(cursorPoint, 40, 3);
    return;
  }
  if (hovered && hovered.userData.react === 'sack') { spillFromSack(); return; }
  if (cursorHit) {
    const p = cursorHit.point;
    dropGift(p.x, p.z, p.y);
  }
}

/* =========================================================
   NAVIDAD: luces de colores, juguetes, nieve que cae del tejado,
   pájaros que abren las alas y Papá Noel cruzando el cielo
   ========================================================= */

// Luces navideñas clásicas: rojo, verde, dorado y azul
const XMAS_LIGHTS = [0xff1f2e, 0x14d24a, 0xffb21a, 0x2e6bff];

// materiales de plástico/pintura para juguetes (uno por color)
const plasticCache = new Map();
// los colores se dan en sRGB (como en un programa de dibujo) y se pasan a lineal para que no salgan lavados
const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
function plastic(color, rough = 0.38, metal = 0) {
  const k = `${color}|${rough}|${metal}`;
  if (!plasticCache.has(k)) plasticCache.set(k, std({ color: lin(color), roughness: rough, metalness: metal }));
  return plasticCache.get(k);
}
function toyLoftMat() {
  return MAT.toyLoft || (MAT.toyLoft = std({ vertexColors: true, roughness: 0.35 }));
}

// Lazo de cinta: dos bucles, nudo y dos colas
function ribbonBow(parent, p, mat, s = 1, r) {
  const g = group(parent, p, r);
  if (!GEO.loop) GEO.loop = new THREE.TorusGeometry(1, 0.25, 8, 20);
  mesh(GEO.loop, mat, g, { p: [-0.034 * s, 0.006 * s, 0], r: [0, 0.25, 0.35], s: [0.036 * s, 0.026 * s, 0.03 * s], cast: false });
  mesh(GEO.loop, mat, g, { p: [0.034 * s, 0.006 * s, 0], r: [0, -0.25, -0.35], s: [0.036 * s, 0.026 * s, 0.03 * s], cast: false });
  mesh(GEO.sphere, mat, g, { s: [0.016 * s, 0.014 * s, 0.012 * s], cast: false });
  mesh(GEO.box, mat, g, { p: [-0.016 * s, -0.03 * s, 0], r: [0, 0, -0.45], s: [0.014 * s, 0.055 * s, 0.003 * s], cast: false });
  mesh(GEO.box, mat, g, { p: [0.016 * s, -0.03 * s, 0], r: [0, 0, 0.45], s: [0.014 * s, 0.055 * s, 0.003 * s], cast: false });
  return g;
}
const RIB = () => ({
  red: plastic(0xd0202e, 0.3), gold: ribbonGold(), blue: plastic(0x2f6bd8, 0.3), green: plastic(0x1f8a43, 0.3), pink: plastic(0xff5fa8, 0.3),
});

// altura del suelo donde se apoya un juguete (suelo + montículo de nieve del árbol)
function toyFloor(x, z) {
  let y = groundAt(x, z);
  const dx = (x + 2.15) / 1.05, dz = (z - 1.0) / 0.9;   // montículo bajo la maceta del árbol
  const k = 1 - dx * dx - dz * dz;
  if (k > 0) y = Math.max(y, -0.615 + 0.75 * Math.sqrt(k));
  return y;
}
function placeToy(obj, x, z, yaw, label) {
  obj.position.set(x, toyFloor(x, z) - 0.005, z);
  obj.rotation.y = yaw;
  obj.userData.y0 = obj.position.y;
  makeReact(obj, 'toy', label);
  return obj;
}

// ---------- Osito de peluche con pajarita azul ----------
function makeTeddy(parent) {
  const g = group(parent);
  const B = [168, 108, 60], L = [226, 190, 146];
  const body = group(g);
  furPart(body, [
    { x: 0, y: 0.015, h: 0.01, w: 0.01 }, { x: 0, y: 0.06, h: 0.1, b: 0.11, w: 0.105 },
    { x: 0, y: 0.15, h: 0.095, b: 0.1, w: 0.095 }, { x: 0.005, y: 0.23, h: 0.066, b: 0.066, w: 0.07 }, { x: 0.005, y: 0.26, h: 0.01, w: 0.01 },
  ], { seg: 18, fur: [0.012, 6, 0.2], color: (s, ang) => mixC(B, L, smooth01(2.3, 2.9, ang) * smooth01(0.1, 0.3, s)) });
  // piernas estiradas hacia delante con almohadillas
  [-1, 1].forEach((sd) => {
    furPart(body, [
      { x: -0.02, y: 0.05, z: sd * 0.06, h: 0.045, w: 0.05 }, { x: 0.08, y: 0.045, z: sd * 0.07, h: 0.044, w: 0.048 },
      { x: 0.15, y: 0.045, z: sd * 0.075, h: 0.046, w: 0.05 }, { x: 0.17, y: 0.045, z: sd * 0.075, h: 0.004, w: 0.004 },
    ], { seg: 14, fur: [0.01, 5, 0.2], color: (s) => mixC(B, L, smooth01(0.85, 0.97, s)) });
    // brazos
    furPart(body, [
      { x: 0.0, y: 0.2, z: sd * 0.085, h: 0.035, w: 0.035 }, { x: 0.05, y: 0.14, z: sd * 0.11, h: 0.032, w: 0.032 },
      { x: 0.09, y: 0.1, z: sd * 0.11, h: 0.033, w: 0.033 }, { x: 0.105, y: 0.095, z: sd * 0.11, h: 0.004, w: 0.004 },
    ], { seg: 12, fur: [0.01, 5, 0.2], color: (s) => mixC(B, L, smooth01(0.8, 0.95, s)) });
  });
  const head = group(g, [0.01, 0.33, 0]);
  furPart(head, [
    { x: -0.085, y: 0, h: 0.01, w: 0.01 }, { x: -0.065, y: 0, h: 0.07, w: 0.08 },
    { x: 0.0, y: 0, h: 0.085, b: 0.08, w: 0.088 }, { x: 0.06, y: -0.005, h: 0.062, b: 0.066, w: 0.07 }, { x: 0.085, y: -0.01, h: 0.01, w: 0.01 },
  ], { seg: 18, fur: [0.011, 6, 0.2], color: () => B });
  furPart(head, [
    { x: 0.04, y: -0.025, h: 0.004, w: 0.004 }, { x: 0.06, y: -0.025, h: 0.035, w: 0.042 },
    { x: 0.1, y: -0.03, h: 0.028, w: 0.034 }, { x: 0.115, y: -0.03, h: 0.004, w: 0.004 },
  ], { seg: 14, fur: [0.006, 3, 0.1], color: () => L });
  mesh(GEO.sphere, plastic(0x1a1210, 0.25), head, { p: [0.112, -0.015, 0], s: [0.016, 0.013, 0.022] });
  [-1, 1].forEach((sd) => {
    mesh(GEO.sphere, plastic(0x0d0a08, 0.12), head, { p: [0.072, 0.028, sd * 0.04], s: 0.012, cast: false });
    const ear = group(head, [-0.01, 0.075, sd * 0.065], [sd * 0.4, 0, 0]);
    furPart(ear, [
      { x: 0, y: -0.01, h: 0.008, w: 0.03 }, { x: 0, y: 0.015, h: 0.012, w: 0.034 }, { x: 0, y: 0.035, h: 0.01, w: 0.026 }, { x: 0, y: 0.045, h: 0.002, w: 0.004 },
    ], { seg: 12, fur: [0.008, 4, 0.1], color: (s, ang) => mixC(B, L, smooth01(2.2, 2.8, ang)) });
  });
  ribbonBow(g, [0.075, 0.26, 0], RIB().blue, 1.1, [0, Math.PI / 2, 0]);   // pajarita
  return g;
}

// ---------- Muñeca de vestido rosa ----------
function makeDoll(parent) {
  const g = group(parent);
  const skin = plastic(0xf6d3bf, 0.6), dress = plastic(0xf5a3c7, 0.75), hair = plastic(0xf07fb2, 0.85), white = plastic(0xfbf7f2, 0.6);
  [-1, 1].forEach((s) => {
    mesh(GEO.cyl, white, g, { p: [s * 0.025, 0.05, 0], s: [0.014, 0.09, 0.014] });
    mesh(GEO.sphere, plastic(0xd9467e, 0.35), g, { p: [s * 0.025, 0.01, 0.01], s: [0.018, 0.012, 0.027] });
  });
  // perfil de abajo arriba (así las caras miran hacia fuera)
  const skirt = new THREE.LatheGeometry([[0.001, 0.078], [0.098, 0.078], [0.102, 0.083], [0.085, 0.1], [0.05, 0.17], [0.042, 0.205], [0.001, 0.205]].map(([r, y]) => new THREE.Vector2(r, y)), 32);
  mesh(skirt, dress, g);
  mesh(GEO.cyl, white, g, { p: [0, 0.205, 0], s: [0.046, 0.012, 0.046] });
  [-1, 1].forEach((s) => {
    const a = group(g, [s * 0.05, 0.195, 0], [0, 0, s * 0.35]);
    mesh(GEO.cyl, dress, a, { p: [0, -0.025, 0], s: [0.016, 0.05, 0.016] });
    mesh(GEO.cyl, skin, a, { p: [0, -0.07, 0], s: [0.011, 0.045, 0.011] });
    mesh(GEO.sphere, skin, a, { p: [0, -0.095, 0], s: 0.013 });
  });
  const head = group(g, [0, 0.27, 0]);
  mesh(GEO.sphere, skin, head, { s: [0.058, 0.062, 0.056] });
  const cap = new THREE.SphereGeometry(1, 28, 14, 0, TAU, 0, Math.PI * 0.55);
  mesh(cap, hair, head, { p: [0, 0.004, -0.006], r: [-0.45, 0, 0], s: 0.064 });
  mesh(GEO.sphere, hair, head, { p: [0, -0.02, -0.03], s: [0.062, 0.06, 0.04] });
  [-1, 1].forEach((s) => {
    mesh(GEO.sphere, hair, head, { p: [s * 0.07, -0.01, -0.01], s: [0.028, 0.045, 0.03] });   // coletas
    ribbonBow(head, [s * 0.058, 0.03, 0.0], RIB().red, 0.55, [0, s * 1.2, 0]);
    mesh(GEO.sphere, plastic(0x1b1311, 0.15), head, { p: [s * 0.021, 0.004, 0.051], s: [0.008, 0.01, 0.005], cast: false });
    mesh(GEO.sphere, plastic(0xf39aa6, 0.7), head, { p: [s * 0.032, -0.016, 0.046], s: [0.011, 0.007, 0.004], cast: false });
  });
  mesh(GEO.sphere, plastic(0xd2404e, 0.4), head, { p: [0, -0.028, 0.053], s: [0.009, 0.004, 0.004], cast: false });
  return g;
}

// ---------- Robot de hojalata ----------
function makeRobot(parent) {
  const g = group(parent);
  const metal = plastic(0xc4c9d2, 0.32, 0.75), dark = plastic(0x3a3f48, 0.5), red = plastic(0xd63a3a, 0.3), yel = plastic(0xf2c230, 0.3);
  const glow = std({ color: lin(0x58c8ff), emissive: lin(0x58c8ff), emissiveIntensity: 1.6, roughness: 0.2 });
  g.userData.legs = [-1, 1].map((s) => {
    const leg = group(g, [s * 0.04, 0.11, 0]);
    mesh(GEO.box, metal, leg, { p: [0, -0.05, 0], s: [0.045, 0.09, 0.05] });
    mesh(GEO.box, dark, leg, { p: [0, -0.098, 0.01], s: [0.06, 0.024, 0.075] });
    return leg;
  });
  g.userData.arms = [];
  mesh(GEO.box, metal, g, { p: [0, 0.18, 0], s: [0.17, 0.15, 0.12] });
  mesh(GEO.box, dark, g, { p: [0, 0.18, 0.061], s: [0.11, 0.09, 0.004] });
  [[-0.03, 0.2, red], [0, 0.2, yel], [0.03, 0.2, red], [-0.02, 0.16, yel], [0.02, 0.16, glow]].forEach(([x, y, m]) => mesh(GEO.sphereLo, m, g, { p: [x, y, 0.066], s: 0.011, cast: false }));
  const head = group(g, [0, 0.31, 0]);
  mesh(GEO.box, metal, head, { s: [0.12, 0.1, 0.1] });
  [-1, 1].forEach((s) => {
    mesh(GEO.cyl, dark, head, { p: [s * 0.03, 0.012, 0.05], r: [Math.PI / 2, 0, 0], s: [0.019, 0.01, 0.019] });
    mesh(GEO.sphereLo, glow, head, { p: [s * 0.03, 0.012, 0.056], s: [0.012, 0.012, 0.005], cast: false });
    mesh(GEO.cyl, red, head, { p: [s * 0.065, 0, 0], r: [0, 0, Math.PI / 2], s: [0.02, 0.014, 0.02] });
  });
  for (let i = 0; i < 4; i++) mesh(GEO.box, dark, head, { p: [-0.024 + i * 0.016, -0.026, 0.051], s: [0.008, 0.016, 0.003], cast: false });
  mesh(GEO.cyl, dark, head, { p: [0, 0.075, 0], s: [0.004, 0.05, 0.004] });
  mesh(GEO.sphereLo, red, head, { p: [0, 0.105, 0], s: 0.013 });
  [-1, 1].forEach((s) => {
    const a = group(g, [s * 0.1, 0.235, 0], [0, 0, s * 0.25]);
    g.userData.arms.push(a);
    mesh(GEO.sphereLo, red, a, { s: 0.022 });
    mesh(GEO.cyl, metal, a, { p: [0, -0.05, 0], s: [0.016, 0.09, 0.016] });
    [-1, 1].forEach((c) => mesh(GEO.box, dark, a, { p: [0, -0.1, c * 0.01], r: [c * 0.35, 0, 0], s: [0.012, 0.03, 0.006] }));
  });
  ribbonBow(head, [0, 0.055, 0], RIB().red, 0.8, [0.2, 0, 0]);
  return g;
}

// ---------- Avión de juguete (hélice que gira) ----------
function makePlane(parent) {
  const g = group(parent);
  const body = group(g, [0, 0.078, 0]);
  mesh(loftGeometry([
    { x: -0.2, y: 0.01, h: 0.006, w: 0.006 }, { x: -0.17, y: 0.008, h: 0.022, w: 0.022 }, { x: -0.05, y: 0, h: 0.044, w: 0.044 },
    { x: 0.1, y: 0, h: 0.05, w: 0.05 }, { x: 0.18, y: 0, h: 0.04, w: 0.04 }, { x: 0.2, y: 0, h: 0.006, w: 0.006 },
  ], { seg: 18, color: (s, ang) => (ang > 2.1 ? [250, 250, 250] : Math.abs(s - 0.55) < 0.04 ? [240, 60, 60] : [96, 176, 232]) }), toyLoftMat(), body);
  const white = plastic(0xf8f8f8, 0.35), yel = plastic(0xf4c430, 0.35), red = plastic(0xe0383c, 0.35);
  mesh(GEO.box, white, body, { p: [0.03, -0.012, 0], s: [0.1, 0.012, 0.44] });
  [-1, 1].forEach((s) => mesh(GEO.box, red, body, { p: [0.03, -0.0115, s * 0.2], s: [0.102, 0.013, 0.04] }));
  mesh(GEO.box, white, body, { p: [-0.17, 0.012, 0], s: [0.05, 0.008, 0.15] });
  mesh(GEO.box, yel, body, { p: [-0.17, 0.045, 0], r: [0, 0, 0.3], s: [0.06, 0.06, 0.008] });
  mesh(GEO.sphere, std({ color: lin(0x9fd4ff), roughness: 0.05, metalness: 0.3 }), body, { p: [0.06, 0.038, 0], s: [0.04, 0.026, 0.03] });
  const prop = group(body, [0.205, 0, 0]);
  mesh(GEO.cone, yel, prop, { r: [0, 0, -Math.PI / 2], s: [0.02, 0.03, 0.02] });
  mesh(GEO.box, red, prop, { p: [-0.004, 0, 0], s: [0.004, 0.15, 0.018] });
  [-1, 1].forEach((s) => {
    mesh(GEO.cyl, white, body, { p: [0.07, -0.035, s * 0.05], r: [s * 0.2, 0, 0], s: [0.005, 0.04, 0.005] });
    mesh(GEO.cyl, plastic(0x202020, 0.6), body, { p: [0.07, -0.055, s * 0.055], r: [Math.PI / 2, 0, 0], s: [0.022, 0.014, 0.022] });
  });
  ribbonBow(body, [0.0, 0.046, 0], RIB().gold, 0.8, [0, Math.PI / 2, 0]);
  g.userData.spinners = [{ obj: prop, axis: 'x', speed: 6 }];
  R.spinners.push(...g.userData.spinners);
  return g;
}

// rueda de juguete (eje Z)
function toyWheel(parent, p, r, rim) {
  const w = group(parent, p);
  mesh(GEO.cyl, plastic(0x1c1c1e, 0.7), w, { r: [Math.PI / 2, 0, 0], s: [r, r * 0.7, r] });
  [-1, 1].forEach((s) => mesh(GEO.cyl, rim, w, { p: [0, 0, s * r * 0.36], r: [Math.PI / 2, 0, 0], s: [r * 0.55, r * 0.02, r * 0.55], cast: false }));
  return w;
}

// ---------- Camión con la caja envuelta como un regalo ----------
function makeTruck(parent) {
  const g = group(parent);
  const green = plastic(0x2fa84f, 0.35), yel = plastic(0xf6c531, 0.35), glass = std({ color: lin(0x9fd4ff), roughness: 0.05, metalness: 0.3 });
  mesh(GEO.box, plastic(0x3a3a3e, 0.6), g, { p: [0, 0.05, 0], s: [0.34, 0.025, 0.12] });
  mesh(GEO.box, green, g, { p: [0.12, 0.11, 0], s: [0.1, 0.1, 0.13] });
  mesh(GEO.box, green, g, { p: [0.17, 0.08, 0], s: [0.05, 0.05, 0.128] });
  mesh(GEO.box, glass, g, { p: [0.15, 0.125, 0], s: [0.042, 0.05, 0.132], cast: false });
  [-1, 1].forEach((s) => mesh(GEO.sphereLo, plastic(0xfff1b0, 0.2), g, { p: [0.196, 0.085, s * 0.045], s: 0.012, cast: false }));
  mesh(GEO.box, yel, g, { p: [-0.06, 0.13, 0], s: [0.22, 0.13, 0.14] });
  const rb = RIB().red;
  mesh(GEO.box, rb, g, { p: [-0.06, 0.13, 0], s: [0.03, 0.132, 0.142] });
  mesh(GEO.box, rb, g, { p: [-0.06, 0.13, 0], s: [0.222, 0.132, 0.03] });
  ribbonBow(g, [-0.06, 0.205, 0], rb, 1.1, [0, 0.4, 0]);
  g.userData.wheels = [[0.12, 1], [0.12, -1], [-0.1, 1], [-0.1, -1]].map(([x, s]) => toyWheel(g, [x, 0.036, s * 0.065], 0.036, yel));
  return g;
}

// ---------- Helicóptero (rotor que gira) ----------
function makeHelicopter(parent) {
  const g = group(parent);
  const body = group(g, [0, 0.1, 0]);
  mesh(loftGeometry([
    { x: -0.1, y: 0.01, h: 0.01, w: 0.01 }, { x: -0.08, y: 0.005, h: 0.045, b: 0.04, w: 0.045 }, { x: 0.0, y: 0, h: 0.062, b: 0.058, w: 0.058 },
    { x: 0.07, y: -0.005, h: 0.048, b: 0.05, w: 0.048 }, { x: 0.1, y: -0.01, h: 0.01, w: 0.01 },
  ], { seg: 18, color: (s, ang) => (ang > 1.9 ? [250, 206, 60] : [242, 128, 36]) }), toyLoftMat(), body);
  mesh(GEO.sphere, std({ color: lin(0x9fd4ff), roughness: 0.05, metalness: 0.3 }), body, { p: [0.055, 0.012, 0], s: [0.045, 0.04, 0.046] });
  const orange = plastic(0xf2802a, 0.35), dark = plastic(0x2a2a2e, 0.5);
  mesh(GEO.cyl, orange, body, { p: [-0.17, 0.02, 0], r: [0, 0, Math.PI / 2 - 0.08], s: [0.013, 0.16, 0.013] });
  mesh(GEO.box, orange, body, { p: [-0.25, 0.045, 0], r: [0, 0, 0.3], s: [0.04, 0.05, 0.006] });
  const tailRotor = group(body, [-0.25, 0.04, 0.01]);
  mesh(GEO.box, dark, tailRotor, { s: [0.06, 0.008, 0.002] });
  mesh(GEO.cyl, dark, body, { p: [0, 0.068, 0], s: [0.008, 0.02, 0.008] });
  const rotor = group(body, [0, 0.08, 0]);
  mesh(GEO.box, dark, rotor, { s: [0.34, 0.004, 0.022] });
  mesh(GEO.box, dark, rotor, { s: [0.022, 0.004, 0.34] });
  mesh(GEO.sphereLo, plastic(0xe0383c, 0.35), rotor, { p: [0, 0.006, 0], s: 0.012 });
  [-1, 1].forEach((s) => {
    mesh(GEO.cyl, dark, body, { p: [0, -0.085, s * 0.045], r: [0, 0, Math.PI / 2], s: [0.006, 0.2, 0.006] });
    [-0.05, 0.05].forEach((x) => mesh(GEO.cyl, dark, body, { p: [x, -0.07, s * 0.04], r: [s * 0.25, 0, 0], s: [0.004, 0.035, 0.004] }));
  });
  ribbonBow(body, [-0.04, 0.05, 0], RIB().green, 0.75, [0, Math.PI / 2, 0]);
  g.userData.spinners = [{ obj: rotor, axis: 'y', speed: 4 }, { obj: tailRotor, axis: 'z', speed: 9 }];
  R.spinners.push(...g.userData.spinners);
  return g;
}

// ---------- Coche rojo con lazo en el techo ----------
function makeCar(parent) {
  const g = group(parent);
  const red = plastic(0xd8202c, 0.25, 0.1), glass = std({ color: lin(0x9fd4ff), roughness: 0.05, metalness: 0.3 });
  mesh(GEO.box, red, g, { p: [0, 0.06, 0], s: [0.27, 0.06, 0.135] });
  mesh(GEO.box, red, g, { p: [-0.015, 0.115, 0], s: [0.14, 0.055, 0.12] });
  mesh(GEO.box, glass, g, { p: [-0.015, 0.117, 0], s: [0.12, 0.04, 0.124], cast: false });
  mesh(GEO.box, glass, g, { p: [-0.015, 0.117, 0], s: [0.144, 0.04, 0.1], cast: false });
  [-1, 1].forEach((s) => {
    mesh(GEO.sphereLo, plastic(0xfff3b8, 0.2), g, { p: [0.136, 0.065, s * 0.045], s: 0.012, cast: false });
    mesh(GEO.sphereLo, plastic(0xff4040, 0.3), g, { p: [-0.136, 0.065, s * 0.05], s: 0.01, cast: false });
  });
  mesh(GEO.box, plastic(0xb8bcc4, 0.3, 0.7), g, { p: [0.14, 0.04, 0], s: [0.01, 0.015, 0.14] });
  g.userData.wheels = [[0.085, 1], [0.085, -1], [-0.085, 1], [-0.085, -1]].map(([x, s]) => toyWheel(g, [x, 0.034, s * 0.066], 0.034, plastic(0xf6c531, 0.3)));
  ribbonBow(g, [-0.015, 0.148, 0], RIB().gold, 1, [0, 0.3, 0]);
  return g;
}

// ---------- Patín rosa ----------
function makeSkate(parent) {
  const g = group(parent);
  const pink = plastic(0xf37fc0, 0.45), purple = plastic(0x8a4fd8, 0.45), white = plastic(0xfafafa, 0.5);
  mesh(GEO.box, white, g, { p: [0, 0.052, 0], s: [0.19, 0.018, 0.07] });
  mesh(loftGeometry([
    { x: -0.09, y: 0.085, h: 0.03, w: 0.03 }, { x: -0.06, y: 0.09, h: 0.04, w: 0.037 }, { x: 0.02, y: 0.085, h: 0.032, w: 0.036 },
    { x: 0.08, y: 0.08, h: 0.024, w: 0.032 }, { x: 0.096, y: 0.078, h: 0.004, w: 0.004 },
  ], { seg: 16, color: (s, ang) => (Math.abs(ang - 1.57) < 0.25 ? [138, 79, 216] : [243, 127, 192]) }), toyLoftMat(), g);
  mesh(GEO.cyl, pink, g, { p: [-0.05, 0.16, 0], s: [0.042, 0.13, 0.04] });
  mesh(GEO.torus || (GEO.torus = new THREE.TorusGeometry(1, 0.2, 8, 32)), purple, g, { p: [-0.05, 0.225, 0], r: [Math.PI / 2, 0, 0], s: [0.043, 0.041, 0.05] });
  for (let i = 0; i < 4; i++) mesh(GEO.box, white, g, { p: [-0.005 + i * 0.022, 0.118 - i * 0.008, 0], r: [0, 0, -0.4], s: [0.004, 0.004, 0.072], cast: false });
  ribbonBow(g, [-0.01, 0.14, 0.04], RIB().pink, 0.7);
  mesh(GEO.sphereLo, plastic(0xe0383c, 0.4), g, { p: [0.1, 0.035, 0], s: [0.016, 0.02, 0.02] });
  [[-0.06, 1], [-0.06, -1], [0.06, 1], [0.06, -1]].forEach(([x, s]) => {
    const w = group(g, [x, 0.024, s * 0.03]);
    mesh(GEO.cyl, plastic(0xf6c531, 0.3), w, { r: [Math.PI / 2, 0, 0], s: [0.024, 0.018, 0.024] });
  });
  return g;
}

// ---------- Calcetín navideño y bastones de caramelo en el árbol ----------
function candyCaneTexture() {
  return canvasTexture(64, 256, (ctx, w, h) => {
    ctx.fillStyle = '#fbf7f2';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d6202e';
    for (let y = -h; y < h * 2; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y); ctx.lineTo(w, y + 30); ctx.lineTo(w, y + 46); ctx.lineTo(0, y + 16);
      ctx.fill();
    }
  });
}
function makeCandyCane(parent, p, r, s = 1) {
  const curve = new THREE.CatmullRomCurve3([[0, -0.12], [0, 0.04], [0.012, 0.075], [0.04, 0.088], [0.066, 0.075], [0.075, 0.05]].map(([x, y]) => new THREE.Vector3(x * s, y * s, 0)));
  const mat = MAT.candy || (MAT.candy = std({ map: candyCaneTexture(), roughness: 0.25 }));
  return mesh(new THREE.TubeGeometry(curve, 40, 0.009 * s, 8, false), mat, parent, { p, r, cast: false });
}
function makeStocking(parent, p, r) {
  const g = group(parent, p, r);
  const RED = [200, 30, 42];
  furPart(g, [
    { x: 0, y: 0.0, h: 0.04, w: 0.03 }, { x: 0, y: -0.1, h: 0.045, w: 0.032 }, { x: 0.01, y: -0.17, h: 0.045, w: 0.032 },
    { x: 0.05, y: -0.205, h: 0.035, w: 0.03 }, { x: 0.1, y: -0.21, h: 0.03, w: 0.028 }, { x: 0.12, y: -0.205, h: 0.004, w: 0.004 },
  ], { seg: 14, fur: [0.004, 3, 0.1], color: (s) => (Math.abs(s - 0.35) < 0.05 ? [242, 236, 226] : RED) });
  furPart(g, [
    { x: 0, y: -0.005, h: 0.004, w: 0.004 }, { x: 0, y: 0.0, h: 0.052, w: 0.04 }, { x: 0, y: 0.05, h: 0.054, w: 0.042 }, { x: 0, y: 0.055, h: 0.004, w: 0.004 },
  ], { seg: 14, fur: [0.012, 5, 0.2], color: () => [246, 242, 236] });
  makeCandyCane(g, [0.01, 0.07, 0.0], [0, 0, -0.2], 0.9);
  ribbonBow(g, [0, 0.03, 0.045], RIB().gold, 0.6);
  return g;
}
// cuelga algo justo delante de la superficie del árbol, buscando la copa con un rayo
function hangOnTree(make, angle, y) {
  const tree = R.tree.tree;
  scene.updateMatrixWorld(true);
  const c = worldOf(tree, v3(0, y, 0));
  const dir = v3(Math.cos(angle), 0, Math.sin(angle));
  const rc = new THREE.Raycaster(c.clone().addScaledVector(dir, 3), dir.clone().negate());
  const meshes = [];
  tree.traverse((o) => { if (o.isMesh && !o.userData.noCollide) meshes.push(o); });
  const hit = rc.intersectObjects(meshes, false)[0];
  const at = hit ? hit.point.addScaledVector(dir, 0.03) : c.addScaledVector(dir, 0.6);
  const local = tree.worldToLocal(at);
  const obj = make(tree, [local.x, local.y, local.z], [0, -angle + Math.PI / 2, 0]);
  return obj;
}

function buildToys() {
  R.spinners = [];
  const toys = group(scene);
  // regalos envueltos con lazos alrededor del árbol
  const R_ = RIB();
  [
    [-2.6, 1.72, 0.34, 0.3, 0.3, 0, R_.gold], [-1.62, 1.72, 0.3, 0.26, 0.28, 2, R_.green], [-1.45, 1.2, 0.26, 0.22, 0.24, 3, R_.red],
    [-2.88, 1.32, 0.32, 0.28, 0.3, 1, R_.gold], [-2.0, 2.45, 0.2, 0.18, 0.2, 4, R_.blue], [-1.25, 0.72, 0.22, 0.32, 0.22, 1, R_.gold],
  ].forEach(([x, z, w, h, d, paper, rib], i) => {
    const gft = makeGift(toys, w, h, d, MAT.papers[paper], rib, [x, toyFloor(x, z) - 0.005, z]);
    gft.root.rotation.y = rand(-0.5, 0.5);
    gft.root.userData.y0 = gft.root.position.y;
    gft.root.userData.gift = { lid: gft.lid };
    makeReact(gft.root, 'toyGift', 'Un regalo envuelto');
    if (i === 0) {   // uno pequeño encima del grande
      const top = makeGift(gft.root, 0.16, 0.14, 0.16, MAT.papers[1], R_.red, [0.02, h, 0.02]);
      top.root.rotation.y = 0.6;
    }
  });
  setupToyLife({
    teddy: placeToy(makeTeddy(toys), -2.22, 1.98, -Math.PI / 2 + 0.25, 'Un osito de peluche'),
    doll: placeToy(makeDoll(toys), -1.85, 2.2, -0.35, 'Una muñeca'),
    robot: placeToy(makeRobot(toys), -1.32, 1.62, -0.45, 'Un robot de hojalata'),
    plane: placeToy(makePlane(toys), -2.62, 2.32, -0.5, 'Un avión de juguete'),
    truck: placeToy(makeTruck(toys), -1.55, 2.5, 0.35, 'Un camión de juguete'),
    heli: placeToy(makeHelicopter(toys), -1.05, 1.15, -0.8, 'Un helicóptero'),
    car: placeToy(makeCar(toys), -2.72, 2.68, 0.25, 'Un coche de juguete'),
    skate: placeToy(makeSkate(toys), -1.05, 2.05, -0.9, 'Un patín'),
  });
  R.toyLife.wakeAt = performance.now() + 3500;
  // en el árbol: calcetín y bastones de caramelo
  hangOnTree((p, pos, r) => makeStocking(p, pos, r), Math.PI / 2 - 0.15, 0.55);
  [[Math.PI / 2 + 0.55, 0.95], [Math.PI / 2 - 0.7, 1.25], [Math.PI / 2 + 0.25, 1.55]].forEach(([a, y]) => {
    hangOnTree((p, pos, r) => makeCandyCane(p, pos, [0, r[1], 0], 1.1), a, y);
  });
}

function updateToys(dt) {
  R.spinners.forEach((s) => {
    s.boost = Math.max(0, (s.boost || 0) - dt * 0.6);
    s.obj.rotation[s.axis] += (s.speed * (0.15 + s.boost * 4)) * dt;
  });
}

/* ---------- Nieve del tejado: resbala, cae y se queda en el suelo ---------- */
const snowPiles = [];
function addColliders(obj) {
  obj.traverse((o) => { if (o.isMesh) { rayTargets.push(o); staticColliders.push(o); } });
}
function removeColliders(obj) {
  const set = new Set();
  obj.traverse((o) => { if (o.isMesh) set.add(o); });
  rayTargets = rayTargets.filter((o) => !set.has(o));
  for (let i = staticColliders.length - 1; i >= 0; i--) if (set.has(staticColliders[i])) staticColliders.splice(i, 1);
  colliderBounds.length = 0;
  boundsFrame = -1;
}
function snowPile(pos, size = 1) {
  const pile = group(scene, [pos.x, pos.y - 0.02, pos.z], [0, rand(0, TAU), 0]);
  mesh(GEO.sphere, MAT.snow, pile, { p: [0, -0.03, 0], s: [0.42 * size, 0.22 * size, 0.34 * size] });
  for (let i = 0; i < 6; i++) {
    const a = rand(0, TAU), r = rand(0.15, 0.35) * size;
    mesh(GEO.sphere, MAT.snow, pile, { p: [Math.cos(a) * r, rand(0.0, 0.05) * size, Math.sin(a) * r], r: [rand(0, 1), rand(0, 3), rand(0, 1)], s: [rand(0.08, 0.16) * size, rand(0.05, 0.09) * size, rand(0.07, 0.13) * size] });
  }
  // bloques rotos de la placa
  for (let i = 0; i < 4; i++) {
    const a = rand(0, TAU), r = rand(0.05, 0.25) * size;
    mesh(GEO.box, MAT.snow, pile, { p: [Math.cos(a) * r, 0.06 * size, Math.sin(a) * r], r: [rand(-0.6, 0.6), rand(0, 3), rand(-0.6, 0.6)], s: [rand(0.08, 0.14) * size, rand(0.05, 0.08) * size, rand(0.07, 0.12) * size] });
  }
  pile.scale.set(1.35, 0.35, 1.35);                       // aplastamiento del impacto
  scaleTo(pile, 1, 500, { ease: ease.outBack });
  makeReact(pile, 'snowPile', 'Un montón de nieve');
  scene.updateMatrixWorld(true);
  addColliders(pile);
  snowPiles.push(pile);
  if (snowPiles.length > 5) {                              // los más viejos se funden poco a poco
    const old = snowPiles.shift();
    scaleTo(old, [1.1, 0.001, 1.1], 3000, { done: () => { removeColliders(old); scene.remove(old); if (hovered === old) setHovered(null); } });
  }
}

function slideRoofSnow() {
  const c = R.roofChunk;
  if (c.sliding) return;
  c.sliding = true;
  const g = 9.8, sl = c.slope;
  const a = g * Math.sin(sl) * 0.42;                 // resbala acelerando (con algo de rozamiento)
  const d1 = c.slideDist;                            // hasta el borde del alero
  const T1 = Math.sqrt((2 * d1) / a);
  const v0 = a * T1;
  const vz = v0 * Math.cos(sl), vy = -v0 * Math.sin(sl);
  const z1 = d1 * Math.cos(sl), y1 = -d1 * Math.sin(sl);
  // dónde cae: se calcula la caída y se comprueba qué hay debajo (suelo, banco, regalos…)
  nearColliders = staticColliders;
  let drop = c.base.y - 0.15, land = null, T2 = 0, landFloor = 0;
  for (let k = 0; k < 3; k++) {
    T2 = (vy + Math.sqrt(vy * vy + 2 * g * drop)) / g;
    land = R.shed.localToWorld(c.base.clone().add(v3(c.offX, 0, z1 + vz * T2)));
    landFloor = surfaceBelow(land.x, c.base.y + y1 - 0.1, land.z).y;
    drop = Math.max(0.2, c.base.y + y1 - landFloor - 0.12);
  }
  const T = T1 + T2;
  let lastTrail = 0, lastSlide = 0;
  run(T * 1000, (e, p) => {
    const t = p * T, inn = c.inner;
    if (t < T1) {
      const d = 0.5 * a * t * t;
      inn.position.set(c.base.x, c.base.y - d * Math.sin(sl), c.base.z + d * Math.cos(sl));
      if (t - lastSlide > 0.06) { lastSlide = t; snowFall(worldOf(inn, v3(rand(-0.4, 0.4), 0, -0.3)), 2, 0.1); }
    } else {
      const tt = t - T1;
      inn.position.set(c.base.x, c.base.y + y1 + vy * tt - 0.5 * g * tt * tt, c.base.z + z1 + vz * tt);
      inn.rotation.x = tt * 2.6;                     // vuelca mientras cae
      if (t - lastTrail > 0.03) { lastTrail = t; snowFall(worldOf(inn), 4, 0.25); }
    }
  }, { ease: ease.linear, done: () => {
    c.inner.updateWorldMatrix(true, false);
    const hit = worldOf(c.inner);
    c.inner.visible = false;
    const floor = landFloor;
    snowPile(v3(hit.x, floor, hit.z), 1.3);
    puff(v3(hit.x, floor + 0.05, hit.z), 36, 0.45);
    snowFall(v3(hit.x, floor + 0.35, hit.z), 30, 0.5);
    // la nieve vuelve a cuajar poco a poco en el tejado
    later('chunkBack', () => {
      c.inner.position.copy(c.base);
      c.inner.rotation.set(0, 0, 0);
      c.inner.scale.setScalar(0.001);
      c.inner.visible = true;
      scaleTo(c.inner, 1, 5000, { done: () => { c.sliding = false; } });
    }, 2500);
  } });
}

/* ---------- Pájaros: alas abiertas al volar ---------- */
const BIRD_LIST = [];
function updateBirdWings() {
  const now = performance.now();
  for (const b of BIRD_LIST) {
    if (b.wings.some((w) => Math.abs(w.rotation.x) > 0.08)) b.spreadUntil = now + 280;
    const open = now < (b.spreadUntil || 0);
    if (open !== b.open) {
      b.open = open;
      b.wings.forEach((w) => { w.userData.folded.visible = !open; w.userData.spread.visible = open; });
    }
  }
}

/* ---------- Papá Noel con el trineo y los renos ---------- */
function buildSanta() {
  const root = group(scene, [1000, 6, -24]);
  root.userData.noCollide = true;
  root.visible = false;
  const rig = group(root);
  rig.scale.setScalar(1.25);
  const gold = std({ color: lin(0xd9a441), roughness: 0.25, metalness: 0.9 });
  const lacquer = std({ color: lin(0x8e1424), roughness: 0.3, metalness: 0.15 });
  const velvet = std({ color: lin(0x5e0f1c), roughness: 0.95 });

  // --- trineo: costado curvo extruido, molduras y patines dorados con voluta
  const sl = group(rig, [0, 0.12, 0]);
  const sh = new THREE.Shape();
  sh.moveTo(-0.62, 0.64);
  sh.bezierCurveTo(-0.78, 0.5, -0.74, 0.2, -0.52, 0.12);
  sh.lineTo(0.38, 0.12);
  sh.bezierCurveTo(0.62, 0.14, 0.74, 0.32, 0.72, 0.5);
  sh.bezierCurveTo(0.71, 0.68, 0.52, 0.68, 0.5, 0.55);
  sh.bezierCurveTo(0.48, 0.44, 0.4, 0.36, 0.28, 0.36);
  sh.lineTo(-0.3, 0.38);
  sh.bezierCurveTo(-0.42, 0.4, -0.46, 0.58, -0.62, 0.64);
  const sideGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 3, curveSegments: 24 });
  sideGeo.translate(0, 0, -0.3);
  mesh(sideGeo, lacquer, sl);
  const edge = sh.getPoints(40);
  [-1, 1].forEach((sd) => {
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edge.map((q) => v3(q.x, q.y, sd * 0.325)), true), 160, 0.014, 6, true), gold, sl);
    // voluta decorativa en el costado
    const spiral = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * TAU * 1.6, r = 0.11 * (1 - t * 0.8); spiral.push(v3(-0.05 + Math.cos(a) * r * 1.6, 0.25 + Math.sin(a) * r, sd * 0.33)); }
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spiral), 80, 0.009, 5), gold, sl);
    // patín
    const run_ = [[-0.72, -0.1], [-0.6, -0.12], [0.45, -0.12], [0.78, -0.06], [0.9, 0.12], [0.84, 0.3], [0.72, 0.32], [0.68, 0.22], [0.75, 0.18]];
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(run_.map(([x, y]) => v3(x, y, sd * 0.28))), 80, 0.02, 8), gold, sl);
    [-0.45, 0.0, 0.38].forEach((x) => mesh(GEO.cyl, gold, sl, { p: [x, 0.0, sd * 0.28], s: [0.012, 0.24, 0.012] }));
  });
  mesh(GEO.box, velvet, sl, { p: [-0.02, 0.395, 0], s: [0.56, 0.05, 0.58] });
  mesh(GEO.box, velvet, sl, { p: [-0.5, 0.52, 0], r: [0, 0, 0.35], s: [0.06, 0.22, 0.56] });
  // farolillo encendido en la proa
  const lantern = group(sl, [0.64, 0.66, 0.28]);
  mesh(GEO.cyl, gold, lantern, { p: [0, 0.08, 0], s: [0.008, 0.16, 0.008] });
  const lamp = group(lantern, [0, 0.2, 0]);
  mesh(GEO.box, std({ color: lin(0xffd27a), emissive: lin(0xffb84a), emissiveIntensity: 2.2, roughness: 0.2 }), lamp, { s: [0.06, 0.08, 0.06] });
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => mesh(GEO.cyl, gold, lamp, { p: [a * 0.032, 0, b * 0.032], s: [0.005, 0.09, 0.005] }));
  mesh(GEO.cone, gold, lamp, { p: [0, 0.065, 0], s: [0.05, 0.05, 0.05] });
  glowSprite(lamp, 0xffc46a, 0.7, [0, 0, 0], 0.9);
  // carga de regalos y un saco
  const R_ = RIB();
  [[-0.38, 0.42, 0.14, 0.2, R_.gold, 0], [-0.4, 0.42, -0.14, 0.18, R_.red, 2], [-0.45, 0.62, 0.0, 0.16, R_.green, 3], [-0.28, 0.42, 0.0, 0.14, R_.blue, 4]].forEach(([x, y, z, s, rib, p]) => {
    makeGift(sl, s, s * 0.9, s, MAT.papers[p], rib, [x, y, z]).root.rotation.y = rand(-0.5, 0.5);
  });
  const sack = new THREE.LatheGeometry([[0.001, 0], [0.12, 0.02], [0.15, 0.12], [0.12, 0.24], [0.04, 0.28], [0.06, 0.32], [0.001, 0.32]].map(([r, y]) => new THREE.Vector2(r, y)), 20);
  mesh(sack, MAT.burlap, sl, { p: [-0.48, 0.42, -0.14], r: [0.2, 0, 0.3] });

  // --- Papá Noel sentado
  const santa = group(sl, [-0.1, 0.42, 0]);
  const RED = [178, 22, 40], WHITE = [246, 242, 236], BLACK = [30, 26, 24], GOLD = [232, 182, 70];
  furPart(santa, [
    { x: 0, y: 0.0, h: 0.01, w: 0.01 }, { x: 0, y: 0.04, h: 0.17, b: 0.2, w: 0.19 }, { x: 0, y: 0.18, h: 0.16, b: 0.22, w: 0.19 },
    { x: -0.01, y: 0.33, h: 0.13, b: 0.15, w: 0.16 }, { x: -0.01, y: 0.43, h: 0.08, b: 0.08, w: 0.1 }, { x: -0.01, y: 0.47, h: 0.01, w: 0.01 },
  ], {
    seg: 22,
    color: (s, ang) => {
      if (s < 0.1) return WHITE;                                   // ribete del abrigo
      if (s > 0.33 && s < 0.42) return ang > 2.85 ? GOLD : BLACK;  // cinturón y hebilla
      return ang > 2.88 ? WHITE : RED;
    },
  });
  // brazo derecho (el que se ve) en su propio hombro, para poder saludar
  const waveArm = group(santa, [-0.02, 0.38, -0.17]);
  furPart(waveArm, [
    { x: 0, y: 0, z: 0, h: 0.056, w: 0.056 }, { x: 0.14, y: -0.08, z: 0, h: 0.05, w: 0.05 },
    { x: 0.27, y: -0.13, z: 0.03, h: 0.046, w: 0.046 }, { x: 0.31, y: -0.14, z: 0.04, h: 0.006, w: 0.006 },
  ], { seg: 12, color: (s) => (s > 0.8 ? [246, 242, 236] : [178, 22, 40]) });
  mesh(GEO.sphere, plastic(0x24402c, 0.8), waveArm, { p: [0.32, -0.145, 0.04], s: [0.045, 0.04, 0.04] });
  mesh(GEO.sphere, plastic(0x24402c, 0.8), waveArm, { p: [0.33, -0.11, 0.06], s: [0.016, 0.03, 0.016] });   // pulgar
  // ribete de piel blanca en el bajo del abrigo y gafas doradas
  mesh(GEO.torus || (GEO.torus = new THREE.TorusGeometry(1, 0.2, 8, 32)), plastic(0xf6f4f0, 0.95), santa, { p: [0, 0.045, 0], r: [Math.PI / 2, 0, 0], s: [0.2, 0.19, 0.18] });
  [-1, 1].forEach((sd) => {
    furPart(santa, [
      { x: 0, y: 0.06, z: sd * 0.08, h: 0.07, w: 0.075 }, { x: 0.2, y: 0.05, z: sd * 0.085, h: 0.06, w: 0.065 }, { x: 0.25, y: 0.05, z: sd * 0.085, h: 0.006, w: 0.006 },
    ], { seg: 14, color: () => RED });
    furPart(santa, [
      { x: 0.22, y: 0.07, z: sd * 0.085, h: 0.062, w: 0.062 }, { x: 0.23, y: 0.02, z: sd * 0.085, h: 0.064, w: 0.064 },
      { x: 0.24, y: -0.12, z: sd * 0.085, h: 0.05, w: 0.055 }, { x: 0.25, y: -0.2, z: sd * 0.085, h: 0.05, w: 0.05 }, { x: 0.25, y: -0.22, z: sd * 0.085, h: 0.006, w: 0.006 },
    ], { seg: 14, color: (s) => (s < 0.18 ? WHITE : BLACK) });
    if (sd < 0) return;   // el otro brazo es el que saluda
    furPart(santa, [
      { x: -0.02, y: 0.38, z: sd * 0.17, h: 0.056, w: 0.056 }, { x: 0.12, y: 0.3, z: sd * 0.17, h: 0.05, w: 0.05 },
      { x: 0.25, y: 0.25, z: sd * 0.14, h: 0.046, w: 0.046 }, { x: 0.29, y: 0.24, z: sd * 0.13, h: 0.006, w: 0.006 },
    ], { seg: 12, color: (s) => (s > 0.8 ? WHITE : RED) });
    mesh(GEO.sphere, plastic(0x24402c, 0.8), santa, { p: [0.3, 0.235, sd * 0.13], s: [0.045, 0.04, 0.04] });
  });
  const head = group(santa, [0.02, 0.56, 0]);
  const skin = plastic(0xf1c3a5, 0.6), beardM = plastic(0xf6f4f0, 0.95);
  mesh(GEO.sphere, skin, head, { s: [0.09, 0.095, 0.09] });
  mesh(GEO.sphere, plastic(0xe8968a, 0.5), head, { p: [0.09, -0.005, 0], s: 0.022 });
  [-1, 1].forEach((sd) => {
    mesh(GEO.sphere, plastic(0x1a1210, 0.2), head, { p: [0.078, 0.028, sd * 0.032], s: 0.009, cast: false });
    mesh(GEO.box, beardM, head, { p: [0.08, 0.048, sd * 0.032], r: [0, 0, -0.15], s: [0.012, 0.01, 0.035], cast: false });
    mesh(GEO.sphere, plastic(0xf0a6a0, 0.6), head, { p: [0.07, -0.01, sd * 0.055], s: [0.02, 0.016, 0.02], cast: false });
    mesh(GEO.sphere, beardM, head, { p: [0.088, -0.03, sd * 0.03], r: [sd * 0.5, 0, 0.2], s: [0.022, 0.017, 0.042] });   // bigote
    mesh(GEO.sphere, beardM, head, { p: [-0.05, -0.02, sd * 0.06], s: [0.035, 0.045, 0.028] });                         // pelo blanco
    mesh(GEO.torus || (GEO.torus = new THREE.TorusGeometry(1, 0.2, 8, 32)), plastic(0xd9a441, 0.25, 0.9), head, { p: [0.086, 0.028, sd * 0.033], r: [0, Math.PI / 2, 0], s: [0.019, 0.019, 0.012], cast: false });  // gafas
  });
  mesh(GEO.cyl, plastic(0xd9a441, 0.25, 0.9), head, { p: [0.09, 0.032, 0], r: [Math.PI / 2, 0, 0], s: [0.003, 0.03, 0.003], cast: false });
  FUR_ON = true;
  furPart(head, [
    { x: 0.06, y: -0.035, h: 0.012, b: 0.012, w: 0.06 }, { x: 0.075, y: -0.07, h: 0.035, b: 0.03, w: 0.075 },
    { x: 0.075, y: -0.14, h: 0.04, b: 0.035, w: 0.07 }, { x: 0.065, y: -0.2, h: 0.025, b: 0.02, w: 0.045 }, { x: 0.055, y: -0.235, h: 0.004, w: 0.004 },
  ], { seg: 16, fur: [0.012, 5, 0.6], color: () => WHITE });
  furPart(head, [
    { x: 0.0, y: 0.045, h: 0.092, w: 0.095 }, { x: -0.02, y: 0.12, h: 0.072, w: 0.072 }, { x: -0.07, y: 0.2, h: 0.044, w: 0.044 },
    { x: -0.14, y: 0.23, h: 0.025, w: 0.025 }, { x: -0.2, y: 0.2, h: 0.012, w: 0.012 }, { x: -0.215, y: 0.185, h: 0.003, w: 0.003 },
  ], { seg: 16, color: () => RED });
  mesh(GEO.torus || (GEO.torus = new THREE.TorusGeometry(1, 0.2, 8, 32)), beardM, head, { p: [0, 0.05, 0], r: [Math.PI / 2, 0, 0], s: [0.098, 0.098, 0.12] });
  mesh(GEO.sphere, beardM, head, { p: [-0.215, 0.175, 0], s: 0.034 });
  const arm = santa;   // referencia para las riendas
  const handL = v3(0.3, 0.235, 0.13), handR = v3(0.3, 0.235, -0.13);

  // --- seis renos (sin capas de pelo: están lejos), más robustos, con arneses, mantas y cascabeles;
  // el primero de la izquierda lleva la nariz roja que brilla
  const harness = std({ color: lin(0x8a1020), roughness: 0.55 });
  const blanket = std({ color: lin(0x13703a), roughness: 0.8, side: THREE.DoubleSide });
  const bellMat = std({ color: lin(0xf2c04a), roughness: 0.2, metalness: 0.9 });
  const deer = [];
  [[1.45, 0.36], [1.45, -0.36], [2.55, 0.36], [2.55, -0.36], [3.65, 0.36], [3.65, -0.36]].forEach(([x, z], i) => {
    const d = makeDeerModel(rig, { p: [x, -0.05, z], pal: REINDEER_PAL, fur: false });
    d.root.scale.setScalar(0.74);
    d.body.scale.set(1, 1.06, 1.22);                          // más robusto que un ciervo
    d.baseY = -0.05 + Math.floor(i / 2) * 0.06;
    d.gt = Math.floor(i / 2) * 0.9 + (i % 2) * 0.3;
    const cg = group(d.neck, [0.0, 0.0, 0], [0, 0, -0.69]);
    mesh(GEO.torus, harness, cg, { r: [Math.PI / 2, 0, 0], s: [0.15, 0.125, 0.2] });
    for (let b = -3; b <= 3; b++) {
      const a = b * 0.3;
      mesh(GEO.sphereLo, bellMat, cg, { p: [Math.cos(a) * 0.165, -0.03, Math.sin(a) * 0.14], s: 0.024 });
    }
    mesh(GEO.torus, harness, d.body, { p: [0.22, 0.99, 0], r: [0, Math.PI / 2, 0], s: [0.195, 0.25, 0.25] });
    // manta verde con ribete dorado sobre el lomo
    if (!GEO.saddle) GEO.saddle = new THREE.CylinderGeometry(1, 1, 1, 22, 1, true, -0.25 * Math.PI, 1.5 * Math.PI);
    mesh(GEO.saddle, blanket, d.body, { p: [-0.06, 1.0, 0], r: [0, 0, Math.PI / 2], s: [0.222, 0.32, 0.222] });
    [-1, 1].forEach((x) => mesh(GEO.saddle, bellMat, d.body, { p: [-0.06 + x * 0.16, 1.0, 0], r: [0, 0, Math.PI / 2], s: [0.226, 0.018, 0.226] }));
    [-1, 1].forEach((sd) => mesh(GEO.sphereLo, bellMat, d.body, { p: [-0.06, 0.86, sd * 0.16], s: 0.022 }));
    mesh(GEO.sphereLo, bellMat, d.body, { p: [0.22, 1.26, 0], s: 0.025 });
    deer.push(d);
  });
  // nariz roja del reno guía
  const lead = deer[5];
  const nose = mesh(GEO.sphere, std({ color: lin(0xff2020), emissive: lin(0xff1010), emissiveIntensity: 2.2, roughness: 0.25 }), lead.head, { p: [0.276, -0.098, 0], s: 0.024, cast: false });
  const noseGlow = glowSprite(lead.head, 0xff3030, 0.45, [0.29, -0.098, 0], 0.95);
  // tiros y riendas (se actualizan en cada fotograma)
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(12 * 2 * 3), 3));
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: 0x3a1410 }));
  lines.frustumCulled = false;
  lines.userData.noRay = true;
  rig.add(lines);

  // sin niebla: vuela muy al fondo y se tiene que ver nítido entre las estrellas
  const noFog = new Map();
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      const m = o.material;
      if (!noFog.has(m.uuid)) { const c = m.clone(); c.fog = false; if (m.onBeforeCompile) { c.onBeforeCompile = m.onBeforeCompile; c.customProgramCacheKey = m.customProgramCacheKey; } noFog.set(m.uuid, c); }
      o.material = noFog.get(m.uuid);
    }
  });

  R.santa = { root, rig, sl, santa, head, deer, lines, handL, handR, arm, waveArm, lantern: lamp, nose, noseGlow, active: false, t: 0, dur: 28, waveUntil: 0 };
  makeReact(root, 'santa', '¡Papá Noel!');
}

// galope en el aire, como en los cuadros: estirado (manos hacia delante, patas traseras
// hacia atrás) y recogido (manos dobladas bajo el pecho, patas bajo la tripa)
const FLY_POSE = {
  front: { ext: [0.75, 1.05, 1.15, 1.3], gat: [0.2, 1.25, -0.45, -0.15] },
  hind: { ext: [-0.75, -1.25, -1.4, -1.25], gat: [0.65, -0.35, 0.35, 0.65] },
};
function poseFlyingReindeer(d, ph) {
  d.legs.forEach((leg, k) => {
    const P = k < 2 ? FLY_POSE.front : FLY_POSE.hind;
    const sft = 0.5 - 0.5 * Math.cos(ph + (k % 2) * 0.35 + (k < 2 ? 0 : 0.5));
    let prev = 0;
    leg.joints.forEach((j, i) => {
      const abs = lerp(P.ext[i], P.gat[i], sft);
      j.rotation.z = abs - prev;
      prev = abs;
    });
  });
  const st = Math.cos(ph);
  d.body.rotation.z = 0.06 * st;                     // morro arriba al estirarse
  d.neck.rotation.z = -0.28 + 0.07 * Math.sin(ph);   // cuello tendido hacia delante
  d.head.rotation.z = 0.22 - 0.05 * Math.sin(ph);
  d.tail.rotation.z = 0.5;
  d.ears.forEach((e) => { e.rotation.z = 0.6; });
}

function poseSanta(e, time, dt) {
  const S = R.santa;
  S.root.position.set(lerp(24, -24, e), lerp(6.0, 6.8, e) + Math.sin(e * Math.PI) * 0.6, -36);
  S.root.rotation.set(0, Math.PI, Math.sin(time * 1.3) * 0.03);
  S.sl.position.y = 0.12 + Math.sin(time * 2.4 - 1) * 0.035;
  S.head.rotation.z = Math.sin(time * 1.7) * 0.06;
  S.deer.forEach((d, i) => {
    d.gt += dt * 6.2;
    poseFlyingReindeer(d, d.gt);
    d.root.position.y = d.baseY + Math.sin(d.gt) * 0.06 + Math.sin(time * 1.3 + i) * 0.03;
  });
  // nariz de Rudolph: late suave
  const pulse = 0.75 + 0.25 * Math.sin(time * 5);
  S.noseGlow.scale.setScalar(0.38 + pulse * 0.22);
  S.nose.material.emissiveIntensity = 1.6 + pulse;
  // saluda cada pocos segundos (y cuando le pasas el cursor por encima)
  const now = performance.now();
  if (now > S.waveUntil + 5000 + (S.waveGap || 0)) { S.waveUntil = now + 2600; S.waveGap = rand(0, 4000); }
  S.waveW = lerp(S.waveW || 0, now < S.waveUntil ? 1 : 0, 0.08);
  const w = S.waveW;
  S.waveArm.rotation.set(-0.3 * w, 0, w * (0.95 + 0.3 * Math.sin(time * 11)));
  // tiros: del trineo a los renos de atrás y de estos a los de delante; riendas a las manos
  S.rig.updateMatrixWorld(true);
  const P = S.lines.geometry.attributes.position;
  const toRig = (obj, v) => S.rig.worldToLocal(worldOf(obj, v));
  const seg = [];
  const harnessPt = v3(0.22, 0.98, 0), backPt = v3(0.4, 1.02, 0), mouth = v3(0.12, -0.04, 0);
  [0, 1].forEach((k) => {
    const sd = k ? -1 : 1;
    const row = [S.deer[k], S.deer[k + 2], S.deer[k + 4]];
    seg.push(toRig(S.sl, v3(0.72, 0.42, sd * 0.28)), toRig(row[0].body, harnessPt));
    seg.push(toRig(row[0].body, backPt), toRig(row[1].body, harnessPt));
    seg.push(toRig(row[1].body, backPt), toRig(row[2].body, harnessPt));
    seg.push(toRig(S.santa, v3(0.3, 0.235, sd * 0.02 + 0.12)), toRig(row[0].head, mouth));
    seg.push(toRig(row[0].head, mouth), toRig(row[1].head, mouth));
    seg.push(toRig(row[1].head, mouth), toRig(row[2].head, mouth));
  });
  seg.forEach((v, i) => P.setXYZ(i, v.x, v.y, v.z));
  P.needsUpdate = true;
}

function flySanta() {
  const S = R.santa;
  S.active = true;
  S.t = 0;
  S.root.visible = true;
}

function updateSanta(dt, time) {
  const S = R.santa;
  if (!S.active) return;
  S.t += dt;
  const e = S.t / S.dur;
  if (e >= 1) {
    S.active = false;
    S.root.visible = false;
    S.root.position.x = 1000;
    later('santa', flySanta, rand(40000, 55000));
    return;
  }
  poseSanta(e, time, dt);
  // estela de polvo dorado y destellos de los cascabeles
  if (Math.random() < 0.7) {
    const p = worldOf(S.sl, v3(rand(-0.7, 0.7), -0.1, rand(-0.3, 0.3)));
    emit(TEX.star4, p, { vel: v3(rand(-0.2, 0.2), rand(-0.4, -0.1), 0), gravity: 0.15, size: rand(0.12, 0.26), decay: rand(0.5, 0.8), additive: true, color: pick([0xffd27a, 0xffffff, 0xffe7a8]), spin: rand(-3, 3) });
  }
  if (Math.random() < 0.25) {
    const d = pick(S.deer);
    emit(TEX.star4, worldOf(d.body, v3(rand(-0.4, 0.4), 0.5, 0)), { vel: v3(0, -0.2, 0), gravity: 0.1, size: rand(0.1, 0.18), decay: 0.9, additive: true, color: 0xffe7a8 });
  }
}

/* ---------- Auroras boreales ----------
   Cortinas de luz muy al fondo: verde intenso abajo que pasa a rosa/magenta arriba,
   con rayos verticales que se desplazan y pliegues que ondulan despacio. */
const AURORA_VS = `
uniform float uTime, uSeed, uLean, uArc;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 p = position;
  float x = uv.x;
  p.y += sin(x * 3.14159) * uArc;                 // la cortina se arquea por el cielo
  p.z += sin(x * 7.0 + uTime * 0.22 + uSeed) * 3.0 + sin(x * 17.0 - uTime * 0.37 + uSeed * 2.0) * 1.2;
  p.y += sin(x * 5.0 + uTime * 0.18 + uSeed) * 1.5;
  p.x += uv.y * uLean;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const AURORA_FS = `
uniform float uTime, uSeed, uAmp;
uniform vec3 cLow, cMid, cHigh;
varying vec2 vUv;
float h1(float n) { return fract(sin(n) * 43758.5453); }
float vn(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i + uSeed * 13.0), h1(i + 1.0 + uSeed * 13.0), f); }
void main() {
  float x = vUv.x, y = vUv.y;
  float rays = vn(x * 90.0 + uTime * 0.45) * 0.55 + vn(x * 230.0 - uTime * 0.8) * 0.3 + vn(x * 24.0 + uTime * 0.12) * 0.5;
  float folds = 0.5 + 0.5 * sin(x * 9.0 + uTime * 0.28 + uSeed * 3.0);
  float base = smoothstep(0.0, 0.07, y) * pow(1.0 - y, 1.5);
  base += smoothstep(0.0, 0.03, y) * smoothstep(0.14, 0.03, y) * 0.7;       // borde inferior más brillante
  float edge = smoothstep(0.0, 0.14, x) * smoothstep(1.0, 0.86, x);
  float pulse = 0.78 + 0.22 * sin(uTime * 0.55 + x * 6.0 + uSeed);
  vec3 col = mix(cLow, cMid, smoothstep(0.05, 0.4, y));
  col = mix(col, cHigh, smoothstep(0.35, 0.85, y));
  // tope de intensidad: aunque se solapen cortinas, nunca llega a deslumbrar (ni a disparar el brillo)
  gl_FragColor = vec4(col, clamp(rays * folds * base * edge * pulse * uAmp * 0.8, 0.0, 0.5));
}`;
function buildAurora() {
  R.aurora = [];
  const make = (o) => {
    const geo = new THREE.PlaneGeometry(o.w, o.h, 220, 1);
    geo.translate(0, o.h / 2, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uSeed: { value: o.seed }, uAmp: { value: o.amp }, uLean: { value: o.lean }, uArc: { value: o.arc || 0 },
        cLow: { value: new THREE.Color(...o.low) }, cMid: { value: new THREE.Color(...o.mid) }, cHigh: { value: new THREE.Color(...o.high) },
      },
      vertexShader: AURORA_VS, fragmentShader: AURORA_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(o.x, o.y, o.z);
    m.rotation.y = o.ry || 0;
    m.userData.noRay = true;
    m.userData.noCollide = true;
    m.frustumCulled = false;
    scene.add(m);
    R.aurora.push(mat);
  };
  // como en la foto: banda verde intensa junto al horizonte, cortinas magenta con
  // rayos verticales en el centro y un gran arco verde que cruza la parte alta del cielo
  make({ x: 0, y: 2.5, z: -60, w: 120, h: 13, seed: 2.2, amp: 1.0, lean: 2, low: [0.75, 1.0, 0.25], mid: [0.35, 1.0, 0.25], high: [0.25, 0.85, 0.35] });
  make({ x: 3, y: 4.5, z: -58, w: 72, h: 26, seed: 5.3, amp: 0.95, lean: -3, low: [1.0, 0.75, 0.35], mid: [1.0, 0.2, 0.8], high: [0.7, 0.1, 0.85] });
  make({ x: -22, y: 3.5, z: -62, ry: 0.25, w: 50, h: 22, seed: 8.1, amp: 0.8, lean: 3, low: [0.45, 1.0, 0.3], mid: [0.95, 0.25, 0.8], high: [0.6, 0.15, 0.8] });
  make({ x: -6, y: 12, z: -66, w: 130, h: 16, seed: 1.7, amp: 0.85, lean: 6, arc: 7, low: [0.4, 1.0, 0.35], mid: [0.3, 0.95, 0.45], high: [0.55, 0.9, 0.6] });
  make({ x: 20, y: 5, z: -60, ry: -0.3, w: 46, h: 18, seed: 3.9, amp: 0.75, lean: 2, low: [0.5, 1.0, 0.25], mid: [0.35, 0.95, 0.3], high: [0.85, 0.25, 0.8] });
}
// ---------- Montañas al fondo ----------
// Dos cordilleras en silueta (sin niebla, para que se recorten oscuras contra la aurora),
// con las cumbres un poco nevadas y un leve reflejo verde de la aurora arriba.
function mountainRange(o) {
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  const N = 220;
  const ridge = (x) => {
    let h = 0, amp = 1, f = o.freq;
    for (let k = 0; k < 4; k++) {
      h += (1 - Math.abs(noiseT(x * f + o.seed * 7, o.seed, o.seed, 1000, 1000) * 2 - 1)) * amp;
      amp *= 0.5; f *= 2.1;
    }
    return o.base + h / 1.9 * o.height;
  };
  for (let i = 0; i <= N; i++) {
    const x = o.x0 + (i / N) * (o.x1 - o.x0);
    const top = ridge(x);
    pos.push(x, -4, 0, x, top, 0);
    c.setRGB(...o.bottom).convertSRGBToLinear();
    col.push(c.r, c.g, c.b);
    const snowy = clamp((top - o.snowLine) / 3, 0, 1);
    c.setRGB(...mixC(o.top, o.snow, snowy * 0.8).map((v) => v)).convertSRGBToLinear();
    col.push(c.r, c.g, c.b);
    if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col.map((v) => v), 3));
  geo.setIndex(idx);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide }));
  m.position.set(0, 0, o.z);
  m.userData.noRay = true;
  m.userData.noCollide = true;
  m.userData.ridge = ridge;
  scene.add(m);
  return m;
}
/* ---------- Pueblecito en la montaña ----------
   Casitas diminutas con las ventanas encendidas en la ladera de la cordillera cercana,
   un campanario y las farolas del camino. Está muy lejos: todo es "pintado" (materiales
   sin luz y sin niebla), así que no ilumina ni cambia nada de la escena principal. */
function buildVillage(range) {
  const ridge = range.userData.ridge, z = range.position.z + 0.3;
  const wall = new THREE.MeshBasicMaterial({ color: lin(0x1c2236), fog: false });
  const roof = new THREE.MeshBasicMaterial({ color: lin(0x7d8ca8), fog: false });
  const winPos = [], lampPos = [];
  if (!GEO.pyr4) GEO.pyr4 = new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4);
  const g = group(scene);
  const house = (x, y, w, h, tower) => {
    const d = w * 0.8;
    mesh(GEO.box, wall, g, { p: [x, y + h / 2, z], s: [w, h, d], cast: false, receive: false });
    mesh(GEO.pyr4, roof, g, { p: [x, y + h + (tower ? w * 0.9 : w * 0.28), z], s: [w * 0.75, tower ? w * 1.8 : w * 0.56, d * 0.75], cast: false, receive: false });
    const n = tower ? 1 : 1 + Math.floor(Math.random() * 3);
    for (let k = 0; k < n; k++) {
      const wx = x + (n === 1 ? 0 : (k / (n - 1) - 0.5) * w * 0.6);
      winPos.push(wx, y + h * (tower ? 0.75 : rand(0.35, 0.6)), z + d / 2 + 0.02);
    }
  };
  // dos pueblos a los lados (el centro queda tapado por la casa)
  [[-9.5, -3.8, 8], [14, 19, 6]].forEach(([x0, x1, n]) => {
    const xs = [];
    for (let i = 0; i < n; i++) xs.push(lerp(x0, x1, (i + rand(0.1, 0.9)) / n));
    // el pueblo se asienta en la ladera, por debajo de la cresta
    const baseY = Math.min(...xs.map((x) => ridge(x))) - 0.5;
    xs.forEach((x, i) => {
      const y = Math.max(0.6, Math.min(ridge(x) - 0.45, baseY - rand(0, 0.9) + Math.sin(i * 1.7) * 0.3));
      house(x, y, rand(0.45, 0.7), rand(0.3, 0.45), false);
    });
    const tx = lerp(x0, x1, 0.5);
    house(tx, Math.max(0.6, baseY - 0.4), 0.32, 0.9, true);          // campanario
    // camino con farolas que baja haciendo eses
    for (let t = 0; t <= 1; t += 0.09) {
      lampPos.push(lerp(x0, x1, t), Math.max(0.3, baseY - 1.2 - t * 1.6 + Math.sin(t * 9) * 0.25), z + 0.5);
    }
  });
  const pts = (arr, color, size) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    const p = new THREE.Points(geo, new THREE.PointsMaterial({ map: TEX.glow, color, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, sizeAttenuation: true }));
    p.userData.noRay = true;
    scene.add(p);
    return p;
  };
  R.village = { windows: pts(winPos, 0xffb04a, 0.8), lamps: pts(lampPos, 0xffd890, 0.55) };
  g.traverse((o) => { o.userData.noRay = true; o.userData.noCollide = true; });
}
function updateVillage(time) {
  if (!R.village) return;
  R.village.windows.material.opacity = 0.85 + Math.sin(time * 1.3) * 0.06 + Math.sin(time * 7.7) * 0.04;
}

function buildMountains() {
  const n = (r, g, b) => [r / 255, g / 255, b / 255];
  mountainRange({ z: -54, x0: -70, x1: 70, base: 2, height: 11, freq: 0.045, seed: 3, snowLine: 9,
    bottom: n(18, 22, 40), top: n(46, 58, 84), snow: n(128, 150, 170) });
  const near = mountainRange({ z: -46, x0: -60, x1: 60, base: 0.5, height: 7, freq: 0.07, seed: 11, snowLine: 6,
    bottom: n(10, 12, 22), top: n(26, 32, 50), snow: n(86, 104, 124) });
  buildVillage(near);
}

function updateAurora(time) {
  R.aurora.forEach((m) => { m.uniforms.uTime.value = time; });
}

/* ---------- Conejo: patas que se estiran al saltar ---------- */
function updateRabbitLegs(dt) {
  const r = R.rabbit;
  const y = r.root.position.y;
  const vy = (y - (r.prevY ?? y)) / Math.max(dt, 1e-3);
  r.prevY = y;
  const ext = clamp(y / 0.1, 0, 1);
  const up = vy > 0.05;
  const k = 0.35;
  r.hind.forEach((l) => {
    // impulso: la pata trasera se estira hacia atrás; al caer se recoge bajo el cuerpo
    l.hip.rotation.z = lerp(l.hip.rotation.z, -ext * (up ? 1.0 : 0.45), k);
    l.hock.rotation.z = lerp(l.hock.rotation.z, -ext * (up ? 1.7 : 0.7), k);
  });
  // manos: recogidas al subir, estiradas hacia delante para aterrizar
  r.front.forEach((f) => { f.rotation.z = lerp(f.rotation.z, ext * (up ? -0.35 : 0.95), k); });
  r.body.rotation.z = lerp(r.body.rotation.z, ext * (up ? 0.28 : -0.18), k);
}

/* ---------- Juguetes con vida propia (como en Toy Story) ----------
   Mientras nadie mira, los juguetes se mueven solos. Cuando el cursor se acerca
   ("¡que viene Andy!") se quedan quietos al momento: lo que vuela cae al suelo,
   la muñeca se desploma y el osito se ladea. Al alejarse, vuelven a la vida. */
const TOY_CENTER = v3(-1.95, 0, 2.0);
function setupToyLife(t) {
  const L = { alive: false, lastNear: -1e9, list: [] };
  const add = (kind, obj, extra = {}) => {
    obj.rotation.order = 'YXZ';      // giro, después inclinación propia (alabeo, caída…)
    if (extra.sound) obj.userData.sound = extra.sound;
    const e = { kind, obj, home: obj.position.clone(), t: rand(0, TAU), blend: 1, ...extra };
    L.list.push(e);
    return e;
  };
  add('car', t.car, { path: [-1.9, 2.95, 0.95, 0.38], a: 0, speed: 0.85, sound: 'coche' });
  add('car', t.truck, { path: [-1.9, 2.95, 0.95, 0.38], a: Math.PI, speed: 0.85, sound: 'coche' });
  add('plane', t.plane);
  add('heli', t.heli, { sound: 'elicoptero' });
  add('robot', t.robot, { sound: 'robot' });
  add('doll', t.doll);
  add('teddy', t.teddy);
  add('skate', t.skate);
  R.toyLife = L;
}

function wakeToys() {
  const L = R.toyLife;
  L.alive = true;
  // los juguetes "arrancan": motor del coche, helicóptero de fondo y pasos del robot
  playSound('coche', { volume: 0.4, ambient: true });
  playSound('elicoptero', { volume: 0.22, loop: true, ambient: true });
  later('robotSound', () => { if (R.toyLife.alive) playSound('robot', { volume: 0.3, ambient: true }); }, 1400);
  L.list.forEach((e) => {
    const o = e.obj;
    e.from = o.position.clone();
    e.fromYaw = o.rotation.y;
    e.blend = 0;
    e.falling = false;
    if (e.kind === 'car') {
      const [cx, cz, rx, rz] = e.path;
      e.a = Math.atan2((o.position.z - cz) / rz, (o.position.x - cx) / rx);
    }
    if (e.kind === 'doll') {                    // se levanta antes de echar a andar
      tweenTo(o.rotation, 'x', 0, 700, { ease: ease.outBack });
      e.blend = -0.9;
    }
    if (e.kind === 'teddy') tweenTo(o.rotation, 'z', 0, 600, { ease: ease.outBack });
    if (e.kind === 'plane' || e.kind === 'heli') { tweenTo(o.rotation, 'x', 0, 400); tweenTo(o.rotation, 'z', 0, 400); }
  });
}

function freezeToys() {
  const L = R.toyLife;
  L.alive = false;
  stopAmbientSounds(90);                         // silencio de golpe: ¡que viene Andy!
  clearTimeout(timers.robotSound);
  L.list.forEach((e) => {
    const o = e.obj;
    if (e.kind === 'plane' || e.kind === 'heli') { e.falling = true; e.vy = 0; }
    if (e.kind === 'doll') {
      // ¡se desploma de espaldas!
      tweenTo(o.rotation, 'x', -1.45, 380, { ease: (p) => p * p, done: () => wobble(o.rotation, 'x', 0.08, 450, 2) });
    }
    if (e.kind === 'teddy') tweenTo(o.rotation, 'z', 0.38, 320, { ease: (p) => p * p });
    if (e.kind === 'robot') {                   // rígido como una estatua
      o.userData.legs.forEach((l) => tweenTo(l.rotation, 'x', l.rotation.x * 0.3, 150));
    }
  });
}

function updateToyLife(dt, time) {
  const L = R.toyLife;
  if (!L) return;
  const now = performance.now();
  const near = mouse.inside && cursorPoint && Math.hypot(cursorPoint.x - TOY_CENTER.x, cursorPoint.z - TOY_CENTER.z) < 2.3 && cursorPoint.y < 3;
  if (near) {
    L.lastNear = now;
    if (L.alive) freezeToys();
  } else if (!L.alive && !captureMode && now - L.lastNear > 1800 && now > L.wakeAt) {
    wakeToys();
  }

  L.list.forEach((e) => {
    const o = e.obj;
    if (!L.alive) {
      // los que estaban en el aire caen con gravedad y rebotan un poco
      if (e.falling) {
        e.vy -= 9.8 * dt;
        o.position.y += e.vy * dt;
        const floor = toyFloor(o.position.x, o.position.z);
        if (o.position.y <= floor) {
          o.position.y = floor;
          if (Math.abs(e.vy) > 0.8) {
            e.vy = -e.vy * 0.28;
            if (e.kind === 'plane') tweenTo(o.rotation, 'x', 0.28, 250);   // aterriza torcido
            puff(o.position.clone(), 6, 0.08);
          } else {
            e.falling = false;
          }
        }
      }
      return;
    }
    e.blend = Math.min(1, e.blend + dt * 1.1);
    const b = ease.inOutSine(clamp(e.blend, 0, 1));
    let target = null, yaw = o.rotation.y;
    if (e.kind === 'car') {
      const [cx, cz, rx, rz] = e.path;
      e.a += (e.speed * dt) / ((rx + rz) / 2) * clamp(e.blend + 0.5, 0, 1);
      target = v3(cx + Math.cos(e.a) * rx, 0, cz + Math.sin(e.a) * rz);
      target.y = toyFloor(target.x, target.z);
      const tx = -Math.sin(e.a) * rx, tz = Math.cos(e.a) * rz;
      yaw = Math.atan2(-tz, tx);
      (o.userData.wheels || []).forEach((w) => { w.rotation.z -= (e.speed * dt) / 0.035; });
    } else if (e.kind === 'plane') {
      e.t += dt * 0.9;
      const r = 0.72, cx = -1.6, cz = 2.25;
      target = v3(cx + Math.cos(e.t) * r, 1.45 + Math.sin(e.t * 2) * 0.08, cz + Math.sin(e.t) * r);
      yaw = Math.atan2(-Math.cos(e.t), -Math.sin(e.t));
      o.rotation.x = lerp(o.rotation.x, -0.4 * b, 0.1);           // alabeo en el giro
      (o.userData.spinners || []).forEach((s) => { s.boost = 1; });
    } else if (e.kind === 'heli') {
      e.t += dt * 0.7;
      target = v3(-1.15 + Math.sin(e.t) * 0.38, 0.75 + Math.sin(e.t * 1.7) * 0.08, 1.35 + Math.sin(e.t * 2) * 0.22);
      const dx = Math.cos(e.t) * 0.38, dz = Math.cos(e.t * 2) * 0.44;
      yaw = Math.atan2(-dz, dx);
      o.rotation.z = lerp(o.rotation.z, -0.18 * b, 0.1);          // morro hacia abajo al avanzar
      (o.userData.spinners || []).forEach((s) => { s.boost = 1; });
    } else if (e.kind === 'robot') {
      e.t += dt;
      const x = e.home.x + Math.sin(e.t * 0.45) * 0.34;
      const dir = Math.cos(e.t * 0.45);
      target = v3(x, toyFloor(x, e.home.z), e.home.z);
      yaw = dir >= 0 ? Math.PI / 2 : -Math.PI / 2;
      const step = Math.sin(e.t * 6) * 0.55 * Math.min(1, Math.abs(dir) * 3);
      o.userData.legs[0].rotation.x = step;
      o.userData.legs[1].rotation.x = -step;
      o.userData.arms[0].rotation.x = -step * 0.8;
      o.userData.arms[1].rotation.x = step * 0.8;
      target.y += Math.abs(Math.sin(e.t * 6)) * 0.012;
    } else if (e.kind === 'doll') {
      e.t += dt * 0.7;
      const x = e.home.x + Math.cos(e.t) * 0.14, z = e.home.z + Math.sin(e.t) * 0.09;
      target = v3(x, toyFloor(x, z), z);
      yaw = Math.atan2(-Math.sin(e.t) * 0.14, Math.cos(e.t) * 0.09);
      if (e.blend > 0.2) o.rotation.z = Math.sin(time * 9) * 0.1;  // anda balanceándose
    } else if (e.kind === 'teddy') {
      o.rotation.z = Math.sin(time * 1.6) * 0.07;
      return;
    } else if (e.kind === 'skate') {
      e.t += dt;
      const x = e.home.x + Math.sin(e.t * 0.9) * 0.3;
      target = v3(x, toyFloor(x, e.home.z), e.home.z);
      yaw = Math.cos(e.t * 0.9) >= 0 ? 0 : Math.PI;
    }
    if (!target) return;
    if (e.blend < 1) {
      o.position.lerpVectors(e.from, target, Math.max(0, b));
      o.rotation.y = angleLerp(e.fromYaw, yaw, Math.max(0, b));
    } else {
      o.position.copy(target);
      o.rotation.y = angleLerp(o.rotation.y, yaw, 0.12);
    }
  });
}

/* ---------- Nieve que se va acumulando sobre las ramas ----------
   Un mismo valor (0 → 0,65 en unos dos minutos y medio) blanquea poco a poco las
   ramas de los pinos y del árbol: primero lo que mira hacia arriba, de forma irregular. */
const SNOW_COVER = { value: 0 };
function addSnowCover(mat, strength = 1) {
  if (!mat) return;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSnow = SNOW_COVER;
    sh.uniforms.uSnowK = { value: strength };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSnowN;\nvarying vec3 vSnowP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vSnowN = normalize(mat3(modelMatrix) * objectNormal);\n  vSnowP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSnow;\nuniform float uSnowK;\nvarying vec3 vSnowN;\nvarying vec3 vSnowP;')
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec3 q = vSnowP;
    float nz = 0.5 + 0.22 * sin(q.x * 7.0 + sin(q.z * 5.3) * 2.0) + 0.2 * sin(q.z * 6.1 + sin(q.y * 8.7 + q.x * 3.0) * 2.0)
             + 0.08 * sin(q.y * 23.0 + q.x * 17.0);                     // manchas suaves e irregulares
    float s = uSnow * uSnowK;
    float a = 1.05 - s * 0.7;
    float cover = smoothstep(a, a + 0.15, max(vSnowN.y, 0.0) * 0.6 + nz * 0.6);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.89, 0.95), cover * min(1.0, s * 1.8) * 0.92);
  }`);
  };
  mat.customProgramCacheKey = () => 'snowCover';
  mat.needsUpdate = true;
}
function updateSnowCover(dt) {
  SNOW_COVER.value = Math.min(0.65, SNOW_COVER.value + dt / 220);
}

/* ---------- Sonido (archivos MP3 de la carpeta sonido/) ----------
   El navegador no deja reproducir nada hasta que la persona hace clic o pulsa una
   tecla: el primer clic en el cartel activa el sonido, y el botón lo activa o silencia. */
const SOUND = { on: false, muted: false, clips: {} };
const SOUND_FILES = ['ciervo', 'coche', 'elicoptero', 'mordecai', 'robot'];
function setupSound() {
  SOUND_FILES.forEach((n) => {
    const a = new Audio(`sonido/${n}.mp3`);
    a.preload = 'auto';
    SOUND.clips[n] = a;
  });
  // sin botón: el sonido se activa solo con el primer clic o la primera tecla
  const set = (on) => { SOUND.on = on; };
  const first = () => {
    window.removeEventListener('pointerdown', first);
    window.removeEventListener('keydown', first);
    if (!SOUND.muted && !SOUND.on) set(true);
  };
  window.addEventListener('pointerdown', first);
  window.addEventListener('keydown', first);
}
// o.ambient: sonido de fondo de los juguetes (se corta en seco cuando "llega Andy")
function playSound(name, o = {}) {
  const a = SOUND.clips[name];
  if (!SOUND.on || !a) return;
  clearInterval(a._fade);
  a._ambient = !!o.ambient;
  a.loop = !!o.loop;
  a.volume = o.volume ?? 0.8;
  try { a.currentTime = 0; } catch (err) { /* aún cargando */ }
  a.play().catch(() => {});
}
function stopSound(name, ms = 250) {
  const a = SOUND.clips[name];
  if (!a || a.paused) return;
  clearInterval(a._fade);
  const v0 = a.volume, steps = 8;
  let i = 0;
  a._fade = setInterval(() => {
    i++;
    a.volume = Math.max(0, v0 * (1 - i / steps));
    if (i >= steps) { clearInterval(a._fade); a.pause(); a.loop = false; }
  }, ms / steps);
}
function stopAmbientSounds(ms) {
  Object.entries(SOUND.clips).forEach(([n, a]) => { if (a._ambient) stopSound(n, ms); });
}

/* ---------- Decoración navideña de la casa ----------
   Como en una chimenea de Navidad: guirnalda de pino frondosa con lazos rojos y bolas
   brillantes en el alero, guirnaldas con luces por los bordes del tejado y una corona
   grande con lazo en la pared lateral. */

// Guirnalda de pino: un núcleo fino y muchas ramitas de agujas alrededor (como el borde de los pinos)
function garlandGeometry(curve, len) {
  const pos = [], uv = [], col = [], idx = [];
  const c = new THREE.Color();
  const steps = Math.ceil(len / 0.035);
  const T = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = curve.getPointAt(t);
    curve.getTangentAt(t, T);
    side.crossVectors(T, up).normalize();
    for (let k = 0; k < 5; k++) {
      const a = rand(0, TAU);
      d.copy(side).multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a)).addScaledVector(T, rand(-0.4, 0.4)).normalize();
      const L = rand(0.09, 0.15), W = L * rand(0.5, 0.7);
      const base = p.clone().addScaledVector(d, -0.015);
      const tip = p.clone().addScaledVector(d, L);
      const w = T.clone().multiplyScalar(W / 2);
      const v0 = pos.length / 3;
      [[base, -1, 0, 0], [base, 1, 1, 0], [tip, -1, 0, 1], [tip, 1, 1, 1]].forEach(([q, sd, u, vv]) => {
        pos.push(q.x + w.x * sd, q.y + w.y * sd, q.z + w.z * sd);
        uv.push(u, vv);
        c.setRGB(1, 1, 1).multiplyScalar(0.5 + vv * 0.3);
        col.push(c.r, c.g, c.b);
      });
      idx.push(v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
function makeGarland(parent, points) {
  const curve = new THREE.CatmullRomCurve3(points);
  const len = curve.getLength();
  const core = mesh(new THREE.TubeGeometry(curve, Math.ceil(len * 30), 0.03, 6), plastic(0x14301f, 0.9), parent, { cast: false });
  const fluff = mesh(garlandGeometry(curve, len), MAT.pineCards, parent, { cast: false });
  core.userData.noCollide = true;
  fluff.userData.noCollide = true;
  return curve;
}
// bola de Navidad brillante con su caperuza dorada y un hilo
function bauble(parent, p, color, r, hang = 0.06) {
  const g = group(parent, p);
  mesh(GEO.cyl, plastic(0xcfc9b8, 0.5), g, { p: [0, -hang / 2, 0], s: [0.002, hang, 0.002], cast: false });
  mesh(GEO.sphere, plastic(color, 0.16, 0.35), g, { p: [0, -hang - r, 0], s: r });
  mesh(GEO.cyl, ribbonGold(), g, { p: [0, -hang + r * 0.05, 0], s: [r * 0.3, r * 0.25, r * 0.3], cast: false });
  g.userData.noCollide = true;
  return g;
}
// hilera de bombillas a lo largo de una curva (se suman a las luces del alero: titilan y se persiguen)
function bulbString(parent, curve, n, offset = 0) {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const p = curve.getPointAt(t);
    const pivot = group(parent, [p.x, p.y - 0.04, p.z]);
    const color = XMAS_LIGHTS[(i + offset) % XMAS_LIGHTS.length];
    const mat = new THREE.MeshStandardMaterial({ color: lin(color), emissive: lin(color), emissiveIntensity: 1.2, roughness: 0.3 });
    mesh(GEO.cyl, MAT.darkMetal, pivot, { p: [0, -0.02, 0], s: [0.013, 0.025, 0.013], cast: false });
    const bulb = mesh(GEO.sphere, mat, pivot, { p: [0, -0.055, 0], s: [0.026, 0.038, 0.026], cast: false });
    const glow = glowSprite(pivot, color, 0.26, [0, -0.055, 0], 0.8);
    pivot.userData.noCollide = true;
    R.eaveLights.push({ pivot, bulb, glow, mat, phase: rand(0, TAU), index: R.eaveLights.length });
  }
}

function decorateShed(shed, m) {
  const { Wd, PEAK, OV, slope, halfDepth, eaveY } = m;
  const xL = -Wd / 2 - OV, xR = Wd / 2 + OV;
  const R_ = RIB();
  // 1) guirnalda en ondas a lo largo del alero delantero, con lazos rojos y bolas colgando
  const swags = 5, pts = [];
  for (let i = 0; i <= swags * 8; i++) {
    const t = i / (swags * 8);
    const sag = Math.sin(t * swags * Math.PI) ** 2 * 0.16;
    pts.push(v3(xL + 0.08 + t * (xR - xL - 0.16), eaveY - 0.02 - sag, halfDepth + 0.08));
  }
  makeGarland(shed, pts);
  const colors = [0xd21f2f, 0xe8b23a, 0x1f8f45, 0x2f5fd0, 0xd8d8e0];
  for (let i = 0; i <= swags; i++) {
    const x = xL + 0.08 + (i / swags) * (xR - xL - 0.16);
    ribbonBow(shed, [x, eaveY + 0.0, halfDepth + 0.14], R_.red, 2.2);
    if (i < swags) {
      const xm = x + (xR - xL - 0.16) / swags / 2;
      bauble(shed, [xm, eaveY - 0.19, halfDepth + 0.12], colors[i % colors.length], 0.055, 0.05);
      bauble(shed, [xm - 0.14, eaveY - 0.15, halfDepth + 0.12], colors[(i + 2) % colors.length], 0.04, 0.04);
      bauble(shed, [xm + 0.14, eaveY - 0.15, halfDepth + 0.12], colors[(i + 3) % colors.length], 0.04, 0.04);
    }
  }
  // 2) guirnaldas con luces por los bordes del tejado (los dos lados de la casa)
  [xL - 0.04, xR + 0.04].forEach((x, side) => {
    [1, -1].forEach((zs) => {
      const rake = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10, z = zs * halfDepth * (1 - t);
        rake.push(v3(x, PEAK - Math.abs(z) * Math.tan(slope) + 0.02, z));
      }
      const curve = makeGarland(shed, rake);
      bulbString(shed, curve, 9, side * 2 + (zs > 0 ? 0 : 1));
    });
    ribbonBow(shed, [x - (side ? -0.03 : 0.03), PEAK + 0.06, 0], R_.red, 2.6, [0, side ? Math.PI / 2 : -Math.PI / 2, 0]);
  });
  // 3) corona grande con bolas y lazo rojo en la pared lateral (la que queda en sombra)
  const wreath = group(shed, [-Wd / 2 - 0.09, 2.62, 0], [0, -Math.PI / 2, 0]);
  const ring = new THREE.CatmullRomCurve3(Array.from({ length: 24 }, (_, i) => v3(Math.cos(i / 24 * TAU) * 0.3, Math.sin(i / 24 * TAU) * 0.3, 0)), true);
  mesh(new THREE.TubeGeometry(ring, 60, 0.07, 8, true), plastic(0x14301f, 0.9), wreath, { cast: false });
  mesh(garlandGeometry(ring, ring.getLength()), MAT.pineCards, wreath, { cast: false });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + 0.2, r = 0.3 + (i % 2 ? 0.05 : -0.04);
    mesh(GEO.sphere, plastic(colors[i % 3 === 0 ? 0 : i % 3 === 1 ? 1 : 0], 0.16, 0.35), wreath, { p: [Math.cos(a) * r, Math.sin(a) * r, 0.07], s: i % 2 ? 0.045 : 0.035 });
  }
  ribbonBow(wreath, [0, -0.3, 0.1], R_.red, 4.5);
  wreath.traverse((o) => { o.userData.noCollide = true; });
}

/* ---------- Luciérnagas en el bosque del fondo ----------
   Muchos puntitos de luz verde amarilla que revolotean entre los pinos de atrás y se
   encienden y apagan a destellos, cada una a su ritmo. Todo en una sola malla de puntos:
   el movimiento y el parpadeo se calculan en la tarjeta gráfica. */
const FIREFLY_VS = `
uniform float uTime, uScale;
attribute vec4 seed;            // fase, velocidad, radio de vuelo, tamaño
varying float vBlink;
void main() {
  float t = uTime * seed.y;
  vec3 p = position;
  p.x += sin(t * 0.37 + seed.x) * seed.z + sin(t * 0.91 + seed.x * 3.0) * 0.15;
  p.y += sin(t * 0.53 + seed.x * 1.7) * 0.35;
  p.z += cos(t * 0.31 + seed.x * 2.3) * seed.z;
  // destellos: largos ratos casi apagada y un brillo que sube y baja
  float f = sin(uTime * (0.6 + seed.y * 0.5) + seed.x * 7.0);
  vBlink = 0.18 + pow(max(f, 0.0), 2.0) * 0.82;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = seed.w * uScale * (0.6 + vBlink * 0.6) / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FIREFLY_FS = `
varying float vBlink;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float halo = pow(1.0 - d, 2.6);
  float core = smoothstep(0.18, 0.0, d);
  vec3 col = vec3(0.62, 1.0, 0.22) * halo * 1.7 + vec3(1.0, 1.0, 0.75) * core * 1.4;
  gl_FragColor = vec4(col * vBlink, 1.0);
}`;
function buildFireflies() {
  const N = 300;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N * 4);
  const back = R.pines.map((pn) => pn.root.position);
  for (let i = 0; i < N; i++) {
    // la mayoría alrededor de los pinos de atrás; el resto, sueltas por el claro del fondo
    let x, z;
    if (Math.random() < 0.6) {
      // por fuera de la copa de cada pino (dentro del follaje no se verían)
      const c = pick(back);
      const a = rand(0, TAU), r = rand(1.9, 3.4);
      x = c.x + Math.cos(a) * r; z = c.z + Math.sin(a) * r;
    } else {
      // en el claro que hay delante del bosque del fondo
      x = rand(-12, 11); z = rand(-8.5, -4.8);
    }
    pos.set([x, rand(0.2, 2.8), z], i * 3);
    seed.set([rand(0, TAU), rand(0.6, 1.4), rand(0.2, 0.7), rand(0.9, 1.6)], i * 4);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 480 * renderer.getPixelRatio() } },
    vertexShader: FIREFLY_VS, fragmentShader: FIREFLY_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.userData.noRay = true;
  pts.userData.noCollide = true;
  scene.add(pts);
  R.fireflies = pts;
}
function updateFireflies(time) {
  if (!R.fireflies) return;
  const u = R.fireflies.material.uniforms;
  u.uTime.value = time;
  u.uScale.value = 480 * renderer.getPixelRatio();
}

/* ---------- Huellas en la nieve ----------
   Cada animal deja su rastro: pezuñas partidas del ciervo, almohadillas del zorro, las
   huellas largas y cortas del conejo y los tridentes de los pájaros. Son marcas de nieve
   pisada (azuladas) que poco a poco se van cubriendo de nieve nueva y desaparecen.
   Una malla instanciada por tipo de huella: cuestan lo mismo dibujar 1 que 300. */
const PRINT_VS = `
attribute float aBirth;
uniform float uTime, uLife;
varying vec2 vUv;
varying float vFade;
void main() {
  vUv = uv;
  float age = uTime - aBirth;
  vFade = smoothstep(0.0, 0.3, age) * (1.0 - smoothstep(uLife * 0.55, uLife, age));
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const PRINT_FS = `
uniform sampler2D map;
varying vec2 vUv;
varying float vFade;
void main() {
  float a = texture2D(map, vUv).a * vFade * 0.75;
  if (a < 0.01) discard;
  gl_FragColor = vec4(0.3, 0.37, 0.55, a);
}`;
function printTexture(kind) {
  return canvasTexture(64, 64, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#fff'; ctx.shadowBlur = 3;
    const ell = (x, y, rx, ry, rot = 0) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot, 0, TAU); ctx.fill(); };
    if (kind === 'hoof') {                    // pezuña partida en dos gotas
      ell(25, 30, 8, 20, -0.12); ell(39, 30, 8, 20, 0.12);
      ell(22, 54, 4, 4); ell(42, 54, 4, 4);   // espolones
    } else if (kind === 'paw') {              // almohadilla y cuatro dedos
      ell(32, 42, 12, 10); ell(20, 22, 5, 7, -0.3); ell(28, 14, 5, 7, -0.1); ell(36, 14, 5, 7, 0.1); ell(44, 22, 5, 7, 0.3);
    } else if (kind === 'hare') {             // pata trasera larga
      ell(32, 32, 9, 27); ell(32, 8, 7, 6);
    } else if (kind === 'hareF') {            // mano pequeña y redonda
      ell(32, 32, 10, 12);
    } else {                                  // pájaro: tres dedos delante y uno detrás
      ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.strokeStyle = '#fff';
      [[32, 6], [14, 14], [50, 14], [32, 60]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(32, 38); ctx.lineTo(x, y); ctx.stroke(); });
    }
  });
}
const PRINTS = {};
function buildFootprints() {
  const kinds = { hoof: [0.11, 0.14], paw: [0.08, 0.08], hare: [0.055, 0.13], hareF: [0.045, 0.05], bird: [0.05, 0.055] };
  Object.entries(kinds).forEach(([k, [w, h]]) => {
    const N = 260;
    const geo = new THREE.PlaneGeometry(w, h);
    geo.rotateX(-Math.PI / 2);
    const birth = new THREE.InstancedBufferAttribute(new Float32Array(N).fill(-1e6), 1);
    geo.setAttribute('aBirth', birth);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: printTexture(k) }, uTime: { value: 0 }, uLife: { value: 45 } },
      vertexShader: PRINT_VS, fragmentShader: PRINT_FS, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    const im = new THREE.InstancedMesh(geo, mat, N);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < N; i++) im.setMatrixAt(i, zero);
    im.frustumCulled = false;
    im.userData.noRay = true;
    im.userData.noCollide = true;
    im.renderOrder = 1;
    scene.add(im);
    PRINTS[k] = { im, birth, next: 0, N };
  });
  // quién deja huellas, cada cuánto (zancada) y con qué separación entre pies
  const T = (obj, kind, stride, side, o = {}) => ({ obj, kind, stride, side, last: null, foot: 1, ...o });
  R.trackers = [
    T(R.deer.root, 'hoof', 0.3, 0.075),
    T(R.fox.root, 'paw', 0.17, 0.03),
    T(R.rabbit.root, 'hare', 0.32, 0.045, { hop: true }),
    T(R.sparrow.root, 'bird', 0.09, 0.022, { hop: true }),
    T(R.robin.root, 'bird', 0.09, 0.022, { hop: true }),
  ];
}
const _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _sc = new THREE.Vector3(1, 1, 1), _tp = new THREE.Vector3();
function stampPrint(kind, x, z, yaw, now) {
  const P = PRINTS[kind];
  if (!P) return;
  _q.setFromAxisAngle(UP_AXIS, yaw);
  _tp.set(x, toyFloor(x, z) + 0.004, z);
  _m4.compose(_tp, _q, _sc);
  P.im.setMatrixAt(P.next, _m4);
  P.birth.array[P.next] = now;
  P.birth.needsUpdate = true;
  P.im.instanceMatrix.needsUpdate = true;
  P.next = (P.next + 1) % P.N;
}
const UP_AXIS = new THREE.Vector3(0, 1, 0);
let printClock = 0;
function updateFootprints(dt) {
  if (!R.trackers) return;
  printClock += dt;
  Object.values(PRINTS).forEach((P) => { P.im.material.uniforms.uTime.value = printClock; });
  for (const t of R.trackers) {
    if (!t.obj || !t.obj.visible) continue;
    t.obj.getWorldPosition(_animalPos);
    const gy = toyFloor(_animalPos.x, _animalPos.z);
    // altura sobre la nieve; "base" es la altura a la que suele estar posado (se adapta sola)
    const air = _animalPos.y - gy;
    t.base = t.base === undefined ? air : Math.min(t.base + dt * 0.02, air);
    // en el aire (salto) no pisa; tampoco fuera del suelo nevado (banco, tejado…)
    if (air - t.base > (t.hop ? 0.03 : 0.25) || air > 0.5) { if (!t.hop) t.last = null; continue; }
    if (!t.last) { t.last = _animalPos.clone(); continue; }
    const dx = _animalPos.x - t.last.x, dz = _animalPos.z - t.last.z;
    const d = Math.hypot(dx, dz);
    if (d > 1.5) { t.last.copy(_animalPos); continue; }   // teletransporte (vuelve a empezar)
    if (d < t.stride) continue;
    const yaw = Math.atan2(-dx, -dz);
    const nx = -dz / d, nz = dx / d;                        // perpendicular: izquierda / derecha
    const x = _animalPos.x, z = _animalPos.z;
    if (t.kind === 'hare') {
      // conejo: dos huellas largas delante, lado a lado, y las dos manos detrás en fila
      stampPrint('hare', x + nx * t.side + dx / d * 0.05, z + nz * t.side + dz / d * 0.05, yaw, printClock);
      stampPrint('hare', x - nx * t.side + dx / d * 0.05, z - nz * t.side + dz / d * 0.05, yaw, printClock);
      stampPrint('hareF', x - dx / d * 0.07, z - dz / d * 0.07, yaw, printClock);
      stampPrint('hareF', x - dx / d * 0.13 + nx * 0.01, z - dz / d * 0.13 + nz * 0.01, yaw, printClock);
    } else if (t.kind === 'bird') {
      // los pájaros saltan con las dos patas juntas
      stampPrint('bird', x + nx * t.side, z + nz * t.side, yaw, printClock);
      stampPrint('bird', x - nx * t.side, z - nz * t.side, yaw, printClock);
    } else {
      // ciervo y zorro: un pie y luego el otro
      t.foot = -t.foot;
      stampPrint(t.kind, x + nx * t.side * t.foot, z + nz * t.side * t.foot, yaw, printClock);
    }
    t.last.copy(_animalPos);
  }
}

/* ---------- Nido en el tejado y vuelos del arrendajo ----------
   Un nido de ramitas encajado en la nieve del tejado con tres polluelos que piden comida.
   Al tocar el arrendajo vuela hasta el nido, les da de comer y vuelve. Su altura sale de un
   rayo contra el tejado real (nieve, tejas, placa de nieve, nido…), así que nunca lo atraviesa. */
function buildNest(shed, m) {
  // en la punta de la cumbrera (extremo izquierdo del tejado), lejos de la chimenea
  const nx = -m.Wd / 2 + 0.12, nz = 0, ny = m.PEAK + 0.2;
  const nest = group(shed, [nx, ny, nz], [0, 0.3, 0]);
  // un montón de palos como el de las cigüeñas: base estrecha que se abre hacia arriba,
  // palos cruzados alrededor y ramas largas que sobresalen por todos lados
  const R0 = 0.2, R1 = 0.36, H = 0.24;
  const profile = (t) => lerp(R0, R1, Math.sin(t * Math.PI / 2));          // radio a la altura t (0 abajo, 1 borde)
  const shades = [[], [], []];
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), mid = new THREE.Vector3();
  const quat = new THREE.Quaternion(), m4 = new THREE.Matrix4();
  const stick = (from, to, r) => {
    dir.subVectors(to, from);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(r * 0.7, r, len, 4, 1, true);
    quat.setFromUnitVectors(up, dir.normalize());
    mid.addVectors(from, to).multiplyScalar(0.5);
    g.applyMatrix4(m4.compose(mid, quat, new THREE.Vector3(1, 1, 1)));
    shades[Math.floor(Math.random() * 3)].push(g);
  };
  // capa principal: palos casi tangentes, entrecruzados, por toda la superficie del montón
  for (let i = 0; i < 380; i++) {
    const t = Math.pow(Math.random(), 0.8), a = rand(0, TAU);
    const r = profile(t) * rand(0.9, 1.05), y = t * H;
    const c = v3(Math.cos(a) * r, y, Math.sin(a) * r);
    const tang = v3(-Math.sin(a), rand(-0.5, 0.5), Math.cos(a)).normalize();
    const out = v3(Math.cos(a), 0, Math.sin(a));
    tang.addScaledVector(out, rand(-0.35, 0.35)).normalize();
    const len = rand(0.16, 0.42);
    stick(c.clone().addScaledVector(tang, -len / 2), c.clone().addScaledVector(tang, len / 2), rand(0.005, 0.009));
  }
  // ramas largas que sobresalen hacia fuera y algo hacia abajo (lo que da el aspecto desordenado)
  for (let i = 0; i < 70; i++) {
    const a = rand(0, TAU), t = rand(0.2, 1);
    const r = profile(t) * 0.8, y = t * H;
    const from = v3(Math.cos(a) * r, y, Math.sin(a) * r);
    const len = rand(0.25, 0.55);
    const to = from.clone().add(v3(Math.cos(a + rand(-0.6, 0.6)) * len, rand(-0.18, 0.12), Math.sin(a + rand(-0.6, 0.6)) * len));
    stick(from, to, rand(0.004, 0.007));
  }
  // borde del cuenco: palos finos que rodean la parte de arriba
  for (let i = 0; i < 60; i++) {
    const a = rand(0, TAU), r = rand(0.2, 0.3);
    const c = v3(Math.cos(a) * r, H + rand(-0.01, 0.03), Math.sin(a) * r);
    const tang = v3(-Math.sin(a), rand(-0.15, 0.15), Math.cos(a)).normalize();
    const len = rand(0.15, 0.3);
    stick(c.clone().addScaledVector(tang, -len / 2), c.clone().addScaledVector(tang, len / 2), 0.005);
  }
  [0x8b7b66, 0x5a4836, 0x9e9384].forEach((col, k) => {
    mesh(mergeGeometries(shades[k]), std({ color: lin(col), roughness: 1 }), nest);
  });
  // núcleo macizo (para que no se vea a través) y el cuenco de dentro con plumón y paja
  const core = new THREE.LatheGeometry([[0.001, 0], [R0 * 0.95, 0], [profile(0.5) * 0.9, H * 0.5], [R1 * 0.88, H * 0.92], [0.22, H * 0.96], [0.001, H * 0.8]].map(([r, y]) => new THREE.Vector2(r, y)), 24);
  mesh(core, std({ color: lin(0x3f3226), roughness: 1 }), nest);
  mesh(new THREE.CircleGeometry(0.22, 24), std({ color: lin(0x6e5a3c), roughness: 1 }), nest, { p: [0, H * 0.8 + 0.005, 0], r: [-Math.PI / 2, 0, 0], cast: false });
  // nieve posada en el borde del nido
  [[0.25, 0.4], [-0.2, 2.1], [0.05, 3.9], [0.3, 5.2]].forEach(([dy, a]) => {
    mesh(GEO.sphere, MAT.snow, nest, { p: [Math.cos(a) * 0.29, H + 0.01, Math.sin(a) * 0.29], s: [0.09, 0.025, 0.06], r: [0, -a, 0], cast: false });
  });
  // polluelos: bolitas de plumón gris con el pico amarillo que se abre
  const chicks = [];
  [[-0.07, 0.05, 0.6], [0.08, 0.03, -0.2], [0.0, -0.09, 2.4]].forEach(([x, z, yaw]) => {
    const c = group(nest, [x, H * 0.8 + 0.03, z], [0, yaw, 0]);
    c.scale.setScalar(1.35);
    const fluff = plastic(0x8a8478, 0.95);
    mesh(GEO.sphere, fluff, c, { s: [0.035, 0.03, 0.035] });
    const head = group(c, [0.012, 0.035, 0]);
    mesh(GEO.sphere, fluff, head, { s: 0.024 });
    [1, -1].forEach((sd) => mesh(GEO.sphereLo, MAT.black, head, { p: [0.012, 0.008, sd * 0.016], s: 0.005, cast: false }));
    const upB = group(head, [0.02, 0, 0]), lo = group(head, [0.02, -0.003, 0]);
    mesh(GEO.cone, plastic(0xf2c230, 0.5), upB, { p: [0.012, 0, 0], r: [0, 0, -Math.PI / 2], s: [0.01, 0.025, 0.01], cast: false });
    mesh(GEO.cone, plastic(0xff7a3a, 0.5), lo, { p: [0.011, 0, 0], r: [0, 0, -Math.PI / 2], s: [0.008, 0.022, 0.008], cast: false });
    chicks.push({ root: c, head, up: upB, lo, phase: rand(0, TAU) });
  });
  makeReact(nest, 'nest', 'Un nido con polluelos');
  // dónde se posa el arrendajo al llegar: en la cumbrera, junto al nido
  R.nest = { root: nest, chicks, center: v3(nx, ny, nz), hungry: 0 };
}
function updateNest(time, dt) {
  const N = R.nest;
  if (!N) return;
  N.hungry = Math.max(0, N.hungry - dt * 0.3);
  N.chicks.forEach((c) => {
    // de vez en cuando estiran el cuello y abren el pico; si llega la madre, todos a la vez
    const beg = Math.max(N.hungry, Math.pow(Math.max(0, Math.sin(time * 0.9 + c.phase)), 12));
    c.head.position.y = 0.035 + beg * 0.03;
    c.head.rotation.z = beg * 0.9 + Math.sin(time * 14 + c.phase) * 0.08 * beg;
    c.up.rotation.z = beg * 0.35;
    c.lo.rotation.z = -beg * 0.45;
  });
}
// altura (local de la caseta) del tejado bajo un punto: rayo hacia abajo contra todo lo de la caseta
let shedColliders = null;
const jayRay = new THREE.Raycaster();
jayRay.firstHitOnly = true;
// altura (local de la caseta) de lo que hay bajo un punto: tejado, placa de nieve, nido…
// (sin contar a los pájaros ni a los polluelos, que se mueven)
function roofHeightAt(lx, lz) {
  if (!shedColliders) {
    const skip = [R.jay.root, R.roofBird.root, ...R.nest.chicks.map((c) => c.root)];
    const inSkip = (o) => { for (; o; o = o.parent) if (skip.includes(o)) return true; return false; };
    const inShed = (o) => { for (; o; o = o.parent) if (o === R.shed) return true; return false; };
    shedColliders = rayTargets.filter((o) => inShed(o) && !inSkip(o));
  }
  const top = R.shed.localToWorld(v3(lx, 6, lz));
  jayRay.set(top, DOWN);
  jayRay.far = 7;
  const hit = jayRay.intersectObjects(shedColliders, false)[0];
  return hit ? R.shed.worldToLocal(hit.point.clone()).y : null;
}
// Un pájaro vuela de su sitio al nido, se posa ENCIMA del nido junto a los polluelos,
// les da de comer y vuelve. Nunca baja por debajo de lo que tiene debajo.
function birdVisitNest(bird, spot, homeYaw, key) {
  if (bird.busy || !R.nest) return;
  bird.busy = true;
  if (bird.footOff === undefined) {
    const h = roofHeightAt(bird.base.x, bird.base.z);
    bird.footOff = h === null ? 0.05 : bird.base.y - h;
  }
  const home = bird.base.clone();
  const landY = (v) => { const h = roofHeightAt(v.x, v.z); return h === null ? v.y : h + clamp(bird.footOff, 0, 0.03); };
  const fly = (from, to, ms, faceTo, done) => {
    const yaw0 = bird.root.rotation.y, yaw1 = Math.atan2(-(to.z - from.z), to.x - from.x);
    run(ms, (e, p) => {
      const x = lerp(from.x, to.x, e), z = lerp(from.z, to.z, e);
      const ground = roofHeightAt(x, z);
      const base = lerp(from.y, to.y, e) + Math.sin(p * Math.PI) * 0.5;
      const minY = ground === null ? base : ground + clamp(bird.footOff, 0, 0.03);
      bird.root.position.set(x, Math.max(base, minY), z);
      // mira hacia donde vuela y, al llegar, se gira hacia los polluelos
      const yawEnd = faceTo === undefined ? yaw1 : faceTo;
      bird.root.rotation.y = p < 0.8 ? lerp(yaw0, yaw1, Math.min(1, p * 4)) : lerp(yaw1, yawEnd, (p - 0.8) / 0.2);
      bird.wings.forEach((w, i) => { w.rotation.x = Math.sin(p * 70) * (i ? -1 : 1) * Math.sin(p * Math.PI); });
    }, { done });
  };
  const c = R.nest.center;
  const target = c.clone().add(spot);
  target.y = landY(target);
  const faceNest = Math.atan2(-(c.z - target.z), c.x - target.x);
  fly(home, target, 1100, faceNest, () => {
    bird.wings.forEach((w) => { w.rotation.x = 0; });
    R.nest.hungry = 1;
    later(key + 'Feed', () => {
      wobble(bird.head.rotation, 'z', 0.5, 600, 3);
      hearts(worldOf(R.nest.root, v3(0, 0.35, 0)), 2);
      later(key + 'Back', () => {
        const back = home.clone();
        back.y = landY(back);
        fly(bird.root.position.clone(), back, 1100, homeYaw, () => {
          bird.root.rotation.y = homeYaw;
          bird.wings.forEach((w) => { w.rotation.x = 0; });
          bird.busy = false;
        });
      }, 2200);
    }, 300);
  });
}
// los dos pájaros van al nido: el arrendajo primero y el cardenal detrás
function jayVisitNest() {
  birdVisitNest(R.jay, v3(0.12, 0, 0.14), -0.3, 'jay');
  later('roofBirdGo', () => birdVisitNest(R.roofBird, v3(-0.1, 0, -0.15), 0.4, 'roofBird'), 450);
}

/* ---------- Puerta lateral entreabierta ----------
   Puerta de tablas con ventanita en la pared en sombra: está medio cerrada y por la
   rendija y el cristal sale la luz cálida del interior, que se derrama sobre la nieve. */
// roble claro con vetas y tablas verticales (o liso para el marco)
function oakTexture(plain) {
  const key = plain ? 'oakPlain' : 'oakDoor';
  if (TEX[key]) return TEX[key];
  TEX[key] = canvasTexture(256, 512, (ctx, w, h) => {
    ctx.fillStyle = '#9c6230'; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {          // vetas
      const x = Math.random() * w, len = 60 + Math.random() * 300, y = Math.random() * h;
      ctx.strokeStyle = 'rgba(' + (Math.random() < 0.5 ? '70,38,14' : '196,140,80') + ',' + (0.12 + Math.random() * 0.2) + ')';
      ctx.lineWidth = 0.6 + Math.random() * 1.6;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + rand(-4, 4), y + len * 0.33, x + rand(-4, 4), y + len * 0.66, x + rand(-3, 3), y + len);
      ctx.stroke();
    }
    if (!plain) {
      ctx.fillStyle = 'rgba(40,20,8,.75)';
      for (let k = 1; k < 4; k++) ctx.fillRect(k * w / 4 - 1.5, 0, 3, h);   // juntas entre tablas
      ctx.fillStyle = 'rgba(255,220,170,.12)';
      for (let k = 1; k < 4; k++) ctx.fillRect(k * w / 4 + 1.5, 0, 2, h);
    }
  });
  return TEX[key];
}
// vidriera: blanco lechoso, filete fino, flores de colores en el borde y rombo azul en el centro
function stainedGlassTexture() {
  if (TEX.stained) return TEX.stained;
  TEX.stained = canvasTexture(256, 320, (ctx, w, h) => {
    ctx.fillStyle = '#f4efe2'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#8a8680'; ctx.lineWidth = 2; ctx.strokeRect(28, 28, w - 56, h - 56);
    const cols = ['#e2262a', '#f28a1c', '#f5c518', '#2156c9', '#e2262a', '#f5c518'];
    const petal = (x, y, c, a) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(0, 0, 9, 6, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#3d8a3a'; ctx.fillRect(-1, 6, 2, 10);
      ctx.restore();
    };
    let k = 0;
    for (let x = 22; x < w - 10; x += 30) { petal(x, 16, cols[k++ % 6], rand(-0.5, 0.5)); petal(x + 12, h - 16, cols[k++ % 6], rand(-0.5, 0.5)); }
    for (let y = 50; y < h - 30; y += 30) { petal(14, y, cols[k++ % 6], rand(-0.5, 0.5) + 1.5); petal(w - 14, y + 12, cols[k++ % 6], rand(-0.5, 0.5) + 1.5); }
    // rombo central azul con centro dorado
    ctx.fillStyle = '#1f4fb8';
    ctx.beginPath(); ctx.moveTo(w / 2, h / 2 - 30); ctx.lineTo(w / 2 + 22, h / 2); ctx.lineTo(w / 2, h / 2 + 30); ctx.lineTo(w / 2 - 22, h / 2); ctx.fill();
    ctx.fillStyle = '#f5c518'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 7, 0, TAU); ctx.fill();
  });
  return TEX.stained;
}
// volutas de forja de la reja (blanco sobre transparente; el material la tiñe de negro)
function grilleScrollTexture() {
  if (TEX.scroll) return TEX.scroll;
  TEX.scroll = canvasTexture(256, 320, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    const cx = w / 2, cy = h / 2;
    [-1, 1].forEach((sd) => {
      ctx.beginPath();
      ctx.moveTo(cx, 40);
      ctx.bezierCurveTo(cx + sd * 30, 90, cx + sd * 90, 120, cx + sd * 70, cy);
      ctx.bezierCurveTo(cx + sd * 90, h - 120, cx + sd * 30, h - 90, cx, h - 40);
      ctx.stroke();
      [70, h - 70].forEach((yy, j) => {
        ctx.beginPath();
        for (let t = 0; t <= 1.0001; t += 0.04) {
          const a = t * TAU * 1.3, r = 26 * (1 - t * 0.75);
          const px = cx + sd * (14 + Math.cos(a) * r), py = yy + (j ? -1 : 1) * Math.sin(a) * r * 0.8;
          if (t === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      });
    });
    ctx.beginPath(); ctx.moveTo(cx, cy - 38); ctx.lineTo(cx + 28, cy); ctx.lineTo(cx, cy + 38); ctx.lineTo(cx - 28, cy); ctx.closePath(); ctx.stroke();
  });
  return TEX.scroll;
}
const SHED_DOOR = { z: 0.3, w: 0.8, h: 1.8, open: -0.8 };
function buildShedDoor(shed, Wd) {
  const x = -Wd / 2;
  const { z, w, h } = SHED_DOOR;
  // interior iluminado que se ve por la rendija
  const inside = canvasTexture(128, 256, (ctx, cw, ch) => {
    const g = ctx.createRadialGradient(cw * 0.5, ch * 0.55, 8, cw * 0.5, ch * 0.5, ch * 0.6);
    g.addColorStop(0, '#ffe0a0'); g.addColorStop(0.5, '#f0a04a'); g.addColorStop(1, '#6a3414');
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = 'rgba(70,36,16,.75)';
    ctx.fillRect(0, ch * 0.32, cw, 6); ctx.fillRect(0, ch * 0.62, cw, 6);   // estantes
    ctx.fillRect(cw * 0.18, ch * 0.2, 16, ch * 0.12); ctx.fillRect(cw * 0.62, ch * 0.5, 22, ch * 0.12);
  });
  mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: inside, color: 0xd09060 }), shed, { p: [x + 0.3, h / 2, z], r: [0, Math.PI / 2, 0], s: [w + 0.2, h + 0.1, 1], cast: false });
  // marco de la puerta (roble, como la hoja)
  const trim = std({ map: oakTexture(true), roughness: 0.6 });
  mesh(GEO.box, trim, shed, { p: [x - 0.065, h + 0.05, z], s: [0.04, 0.1, w + 0.2] });
  [-1, 1].forEach((sd) => mesh(GEO.box, trim, shed, { p: [x - 0.065, h / 2, z + sd * (w / 2 + 0.05)], s: [0.04, h + 0.05, 0.1] }));
  mesh(GEO.box, MAT.snow, shed, { p: [x - 0.08, h + 0.11, z], s: [0.07, 0.03, w + 0.22] });
  // hoja de la puerta: gira sobre la bisagra del lado de atrás y se abre hacia fuera.
  // Roble de tablas verticales, vidriera arriba tras una reja negra, clavos y tirador de forja.
  const hinge = group(shed, [x - 0.04, 0, z - w / 2]);
  const door = makeReact(group(hinge), 'shedDoor', 'La puerta de la casa');
  const oak = std({ map: oakTexture(false), roughness: 0.55 });
  const dw = w - 0.02, T = 0.045;
  const wy0 = 0.98, wy1 = 1.66, wz0 = 0.12, wz1 = dw - 0.12;          // hueco de la ventana
  const P = (y0, y1, z0, z1) => mesh(GEO.box, oak, door, { p: [0, (y0 + y1) / 2, (z0 + z1) / 2], s: [T, y1 - y0, z1 - z0] });
  P(0, wy0, 0, dw);            // parte de abajo
  P(wy1, h - 0.02, 0, dw);     // arriba de la ventana
  P(wy0, wy1, 0, wz0);         // a los lados
  P(wy0, wy1, wz1, dw);
  // vidriera: blanca con flores de colores alrededor y un rombo azul en el centro
  const vid = stainedGlassTexture();
  const winGlass = std({ map: vid, roughness: 0.06, metalness: 0.25 });   // cristal: refleja, pero no da luz
  mesh(GEO.box, winGlass, door, { p: [0, (wy0 + wy1) / 2, (wz0 + wz1) / 2], s: [0.01, wy1 - wy0, wz1 - wz0], cast: false });
  // reja de forja delante del cristal: marco, barrotes y volutas
  const iron = plastic(0x151414, 0.45, 0.6);
  const gx = -T / 2 - 0.02, gb = 0.03;
  [[wy0 - gb / 2, wy0 + gb / 2, wz0 - gb, wz1 + gb], [wy1 - gb / 2, wy1 + gb / 2, wz0 - gb, wz1 + gb], [wy0, wy1, wz0 - gb, wz0], [wy0, wy1, wz1, wz1 + gb]]
    .forEach(([y0, y1, z0, z1]) => mesh(GEO.box, iron, door, { p: [gx, (y0 + y1) / 2, (z0 + z1) / 2], s: [0.02, y1 - y0, z1 - z0], cast: false }));
  for (let i = 1; i <= 5; i++) {
    const zz = wz0 + (i / 6) * (wz1 - wz0);
    mesh(GEO.cyl, iron, door, { p: [gx - 0.005, (wy0 + wy1) / 2, zz], s: [0.006, wy1 - wy0, 0.006], cast: false });
  }
  const scroll = new THREE.MeshBasicMaterial({ map: grilleScrollTexture(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, color: 0x050404 });
  mesh(GEO.plane, scroll, door, { p: [gx - 0.012, (wy0 + wy1) / 2, (wz0 + wz1) / 2], r: [0, -Math.PI / 2, 0], s: [wz1 - wz0, wy1 - wy0, 1], cast: false });
  // clavos de forja en dos filas
  const studM = plastic(0x1a1716, 0.35, 0.7);
  [0.13, 0.72].forEach((y) => {
    for (let i = 0; i < 8; i++) {
      const zz = 0.07 + (i / 7) * (dw - 0.14);
      mesh(GEO.sphereLo, studM, door, { p: [-T / 2, y, zz], s: [0.014, 0.016, 0.016], cast: false });
    }
  });
  // tirador de barra y cerradura de caja
  mesh(GEO.cyl, iron, door, { p: [-T / 2 - 0.035, 0.9, dw / 2], r: [Math.PI / 2, 0, 0], s: [0.008, 0.16, 0.008], cast: false });
  [-0.08, 0.08].forEach((dz) => {
    mesh(GEO.sphereLo, iron, door, { p: [-T / 2 - 0.035, 0.9, dw / 2 + dz], s: 0.017, cast: false });
    mesh(GEO.cyl, iron, door, { p: [-T / 2 - 0.017, 0.9, dw / 2 + dz], r: [0, 0, Math.PI / 2], s: [0.006, 0.035, 0.006], cast: false });
  });
  mesh(GEO.box, iron, door, { p: [-T / 2 - 0.012, 0.86, dw - 0.06], s: [0.025, 0.1, 0.06], cast: false });
  mesh(GEO.box, plastic(0x3a3230, 0.3, 0.8), door, { p: [-T / 2 - 0.026, 0.84, dw - 0.06], s: [0.004, 0.025, 0.012], cast: false });
  // bisagras y un poco de nieve en el alféizar de la reja
  [0.25, 1.55].forEach((y) => mesh(GEO.box, iron, door, { p: [-T / 2 - 0.004, y, 0.06], s: [0.01, 0.04, 0.12], cast: false }));
  mesh(GEO.box, MAT.snow, door, { p: [-T / 2 - 0.03, wy0 - 0.005, (wz0 + wz1) / 2], s: [0.05, 0.02, wz1 - wz0 + 0.06], cast: false });
  hinge.rotation.y = SHED_DOOR.open;
  // la luz que se escapa por la rendija y la ventana: luz real + mancha cálida en la nieve
  const light = new THREE.PointLight(0xffa24a, 1.6, 4.5, 2);
  light.position.set(x - 0.35, 1.1, z + 0.05);
  shed.add(light);
  const spill = mesh(GEO.plane, new THREE.MeshBasicMaterial({ map: TEX.glow, color: lin(0xff9a3a), transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 }),
    shed, { p: [x - 0.9, 0.03, z + 0.15], r: [-Math.PI / 2, 0, 0.35], s: [2.0, 1.1, 1], cast: false, receive: false });
  spill.userData.noRay = true;
  spill.userData.noCollide = true;
  const gapGlow = glowSprite(shed, 0xffb060, 1.6, [x - 0.15, 1.0, z + w / 2 - 0.15], 0.5);
  R.shedDoor = { hinge, door, light, spill, gapGlow, winGlass, open: SHED_DOOR.open };
}

/* ---------- Farolillos en el suelo ----------
   Farol de metal negro como los de casa: base escalonada, cristales con cruces en X,
   puertecita con bisagras y pestillo, tejadillo con chimenea, bola y aro para colgarlo.
   Dentro, una vela blanca cuya llama parpadea y deja un charco de luz en la nieve. */
function makeLanternModel(parent) {
  const L = group(parent);
  const iron = MAT.lanternIron || (MAT.lanternIron = std({ color: lin(0x161515), roughness: 0.42, metalness: 0.55 }));
  const glass = MAT.lanternGlass || (MAT.lanternGlass = std({ color: lin(0xffd9a0), emissive: lin(0xff9a3a), emissiveIntensity: 0.35, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false }));
  const box = (p, s, m = iron, r) => mesh(GEO.box, m, L, { p, s, r, cast: false });
  const W = 0.17, H0 = 0.05, H1 = 0.33, hw = W / 2, mid = (H0 + H1) / 2, Hh = H1 - H0;
  // base escalonada
  box([0, 0.012, 0], [W + 0.05, 0.024, W + 0.05]);
  box([0, 0.032, 0], [W + 0.025, 0.018, W + 0.025]);
  box([0, H0 - 0.004, 0], [W + 0.01, 0.01, W + 0.01]);
  // postes de las esquinas
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => box([a * hw, mid, b * hw], [0.014, Hh, 0.014]));
  // cada cara: cristal, marco y cruz en X
  const diag = Math.hypot(W, Hh), ang = Math.atan2(Hh, W);
  [0, 1, 2, 3].forEach((f) => {
    const face = group(L, [0, mid, 0], [0, f * Math.PI / 2, 0]);
    const fb = (p, s, r) => mesh(GEO.box, iron, face, { p, s, r, cast: false });
    mesh(GEO.box, glass, face, { p: [0, 0, hw - 0.004], s: [W - 0.01, Hh - 0.01, 0.003], cast: false });
    fb([0, Hh / 2 - 0.006, hw + 0.002], [W, 0.012, 0.008]);
    fb([0, -Hh / 2 + 0.006, hw + 0.002], [W, 0.012, 0.008]);
    fb([0, 0, hw + 0.003], [0.007, diag - 0.02, 0.005], [0, 0, Math.PI / 2 - ang]);
    fb([0, 0, hw + 0.003], [0.007, diag - 0.02, 0.005], [0, 0, -(Math.PI / 2 - ang)]);
    if (f === 0) {   // puertecita: bisagras y pestillo
      [-0.09, 0.09].forEach((y) => fb([-hw - 0.004, y, hw - 0.01], [0.01, 0.03, 0.02]));
      mesh(GEO.torus || (GEO.torus = new THREE.TorusGeometry(1, 0.2, 8, 32)), iron, face, { p: [hw + 0.012, 0.0, hw - 0.005], r: [0, Math.PI / 2, 0], s: [0.014, 0.014, 0.014], cast: false });
    }
  });
  // tejadillo ancho, ligeramente a cuatro aguas
  box([0, H1 + 0.008, 0], [W + 0.06, 0.016, W + 0.06]);
  if (!GEO.pyr4) GEO.pyr4 = new THREE.ConeGeometry(1, 1, 4, 1).rotateY(Math.PI / 4);
  mesh(GEO.pyr4, iron, L, { p: [0, H1 + 0.032, 0], s: [(W + 0.06) * 0.707, 0.035, (W + 0.06) * 0.707], cast: false });
  // chimenea: cuatro patitas y un tejadito pequeño
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => box([a * 0.032, H1 + 0.068, b * 0.032], [0.008, 0.04, 0.008]));
  box([0, H1 + 0.09, 0], [0.1, 0.01, 0.1]);
  mesh(GEO.pyr4, iron, L, { p: [0, H1 + 0.105, 0], s: [0.07, 0.022, 0.07], cast: false });
  // bola y aro
  mesh(GEO.sphere, iron, L, { p: [0, H1 + 0.135, 0], s: [0.022, 0.024, 0.022], cast: false });
  mesh(GEO.cyl, iron, L, { p: [0, H1 + 0.162, 0], s: [0.008, 0.012, 0.008], cast: false });
  mesh(GEO.torus, iron, L, { p: [0, H1 + 0.205, 0], s: [0.04, 0.04, 0.04], cast: false });
  // vela blanca y llama
  const wax = MAT.candleWax || (MAT.candleWax = std({ color: lin(0xfff6e4), emissive: lin(0xffb060), emissiveIntensity: 0.35, roughness: 0.6 }));
  mesh(GEO.cyl, wax, L, { p: [0, H0 + 0.065, 0], s: [0.034, 0.13, 0.034], cast: false });
  mesh(GEO.cyl, MAT.black, L, { p: [0, H0 + 0.138, 0], s: [0.002, 0.012, 0.002], cast: false });
  return { L, flameY: H0 + 0.158, glowY: H0 + 0.15 };
}
function buildLanterns() {
  R.lanterns = [];
  const flameMat = std({ color: lin(0xfff0b0), emissive: lin(0xffc050), emissiveIntensity: 3.0, roughness: 0.3 });
  const poolMat = new THREE.MeshBasicMaterial({ map: TEX.glow, color: lin(0xff8a2a), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2 });
  const spots = [[0.35, 2.3, true], [-0.95, -3.95, true], [-0.35, 0.85, false], [1.85, 3.4, false], [-2.95, -0.75, false]];
  spots.forEach(([x, z, real], i) => {
    const y = toyFloor(x, z);
    const root = makeReact(group(scene, [x, y, z], [0, rand(-0.6, 0.6) + 0.4, 0]), 'lantern', 'Un farolillo');
    const { L, flameY, glowY } = makeLanternModel(root);
    L.scale.setScalar(1.15);
    const flame = mesh(GEO.cone, flameMat, L, { p: [0, flameY, 0], s: [0.012, 0.035, 0.012], cast: false });
    const glow = glowSprite(L, 0xff9a3a, 1.0, [0, glowY, 0], 0.85);
    const pool = mesh(GEO.plane, poolMat.clone(), root, { p: [0, 0.012, 0], r: [-Math.PI / 2, 0, 0], s: [1.8, 1.8, 1], cast: false, receive: false });
    pool.userData.noRay = true;
    pool.userData.noCollide = true;
    let light = null;
    if (real) {
      light = new THREE.PointLight(0xffa24a, 1.1, 3.2, 2);
      light.position.set(0, 0.2, 0);
      root.add(light);
    }
    R.lanterns.push({ root, flame, glow, pool, light, phase: rand(0, TAU), boost: 0 });
  });
}
function updateLanterns(time, dt) {
  R.lanterns.forEach((l, i) => {
    // parpadeo de vela: suma de ondas irregulares
    const f = 0.86 + Math.sin(time * 9.3 + l.phase) * 0.06 + Math.sin(time * 23.1 + l.phase * 2) * 0.04 + Math.sin(time * 3.7 + i) * 0.04;
    l.boost = Math.max(0, l.boost - dt * 0.8);
    const k = f + l.boost;
    l.flame.scale.set(0.012 * (1 + l.boost * 0.5), 0.035 * (0.9 + (f - 0.86) * 3 + l.boost), 0.012);
    l.glow.material.opacity = clamp(0.7 * k, 0, 1);
    l.glow.scale.setScalar(0.9 * (0.9 + l.boost * 0.6));
    l.pool.material.opacity = 0.8 * k;
    if (l.light) l.light.intensity = 1.1 * k;
  });
  // la luz de la puerta entreabierta también tiembla un poco (como de chimenea)
  const D = R.shedDoor;
  if (D) {
    const f = 0.92 + Math.sin(time * 7.1) * 0.05 + Math.sin(time * 17.3) * 0.03;
    const openK = clamp((-D.hinge.rotation.y) / 0.8, 0.6, 1.6);
    D.light.intensity = 1.6 * f * openK;
    D.spill.material.opacity = 0.6 * f * openK;
    D.gapGlow.material.opacity = 0.45 * f * openK;
  }
}

/* =========================================================
   14 · BUCLE PRINCIPAL
   ========================================================= */
const clock = new THREE.Clock();

function updateCamera(dt) {
  camState.offX = lerp(camState.offX, mouse.inside ? mouse.nx * 0.9 : 0, 0.04);
  camState.offY = lerp(camState.offY, mouse.inside ? -mouse.ny * 0.5 : 0, 0.04);
  const intro = camState.intro;
  camera.position.set(
    CAM_BASE.x + camState.offX,
    CAM_BASE.y + camState.offY + (1 - intro) * 2.2,
    CAM_BASE.z + (1 - intro) * 6
  );
  camera.lookAt(CAM_TARGET);
}

function updateLightsFx(time) {
  // linterna del cursor: sigue el punto 3D bajo el ratón
  const L = lights.cursor;
  if (mouse.inside && cursorPoint) {
    lights.cursorTarget.copy(cursorPoint).add(v3(0, 1.3, 0)).addScaledVector(ray.ray.direction, -1.1);
  }
  L.position.lerp(lights.cursorTarget, 0.15);
  L.intensity = lerp(L.intensity, mouse.inside ? 0.55 : 0, 0.08);   // suave: ilumina sin deslumbrar la nieve

  const now = performance.now();
  const chase = (list, until) => list.forEach((l) => {
    let k = 0.75 + 0.25 * Math.sin(time * 3 + l.phase);
    if (now < until) k = 0.2 + Math.max(0, Math.sin(time * 11 - l.index * 0.9)) * 1.4;
    l.mat.emissiveIntensity = k * 1.3;
    l.glow.material.opacity = clamp(k * 0.8, 0.1, 1);
  });
  chase(R.treeLights, treeChaseUntil);
  chase(R.eaveLights, eaveChaseUntil);

  R.stars[0].material.opacity = 0.75 + Math.sin(time * 1.3) * 0.15 + starBoost * 0.2;
  R.stars[1].material.opacity = 0.55 + Math.sin(time * 2.1 + 1) * 0.35 + starBoost * 0.3;
  R.starGlow.material.opacity = 0.35 + Math.sin(time * 4) * 0.08;
  if (R.starLights) {
    R.starLights[0].material.opacity = 0.65 + 0.35 * Math.sin(time * 3.1);
    R.starLights[1].material.opacity = 0.65 + 0.35 * Math.sin(time * 3.1 + Math.PI);
  }
  R.window.light.intensity += Math.sin(time * 23) * 0.02;
  R.treeGlow.intensity = 1.5 + Math.sin(time * 3.1) * 0.15 + (now < treeChaseUntil ? 0.6 : 0);
  R.eaveGlows.forEach((l, i) => { l.intensity = 0.5 + Math.sin(time * 2.3 + i * 1.7) * 0.12 + (now < eaveChaseUntil ? 0.4 : 0); });
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  mouse.vx *= 0.8;
  mouse.vy *= 0.8;
  adaptQuality(dt);

  updateHover();
  updateAnims(dt);
  updateWind(time, dt);
  updateOrnaments(dt, time);
  updateDeer(dt, time);
  updateFox(dt);
  updateHeads();
  updateBreathing(time);
  updateFlock(time);
  updateBirdWings();
  updateToys(dt);
  updateSanta(dt, time);
  updateAurora(time);
  updateSnowCover(dt);
  updateLanterns(time, dt);
  updateFireflies(time);
  updateFootprints(dt);
  updateNest(time, dt);
  updateVillage(time);
  updateRabbitLegs(dt);
  updateToyLife(dt, time);
  updateGifts(dt);
  updateSnow(dt, time);
  updateParticles(dt);
  updateCamera(dt);
  updateLightsFx(time);
  updateLetters();
  updateBadge();
  updateCta();
  updateCursor(time);

  renderFrame();
  requestAnimationFrame(animate);
}

/* =========================================================
   15 · INICIALIZACIÓN
   ========================================================= */
function init() {
  setupRenderer();
  makeTextures();
  makeGeometries();
  makeMaterials();
  setupLights();

  buildGround();
  buildSky();
  buildForest();
  buildShed();
  buildTree();
  buildDeer();
  buildFox();
  buildRabbit();
  buildGroundBirds();
  buildSack();
  buildGrass();
  buildToys();
  buildSanta();
  buildAurora();
  buildMountains();
  buildLanterns();
  buildFireflies();
  buildFootprints();
  addSnowCover(MAT.pine, 1);
  addSnowCover(MAT.pineCards, 1);
  addSnowCover(MAT.xmasPine, 0.75);
  makeSnowLayer(1600, { x0: -14, x1: 14, y0: 0, y1: 14, z0: -16, z1: 6 }, 0.07, 0.7, 0.85);
  makeSnowLayer(160, { x0: -4, x1: 4, y0: 0, y1: 7, z0: 6, z1: 10.5 }, 0.08, 1.3, 0.6);

  // guarda las posiciones base de los pájaros (ya colocados)
  [R.sparrow, R.robin, R.jay, R.chickadee, R.cardinal, R.roofBird].forEach((b) => { b.base = b.root.position.clone(); });
  setupBVH();
  collectRayTargets();
  optimizeShadows();

  splitHeadline();
  setupSound();
  fitPoster();

  if (captureMode) {
    document.documentElement.classList.add('no-intro');
    camState.intro = 1;
    for (let i = 0; i < 160; i++) { updateWind(i / 60, 1 / 60); updateParticles(1 / 60); updateSnow(1 / 60, i / 60); }
    R.santa.root.visible = true;
    poseSanta(0.62, 1, 0.3);
    SNOW_COVER.value = 0.4;
  } else {
    run(2800, (e) => { camState.intro = e; }, { ease: ease.inOutSine });
    later('deer', deerNextAction, 2500);
    later('fox', foxStart, 5000);
    later('rabbit', rabbitWander, 3500);
    later('groundBirds', groundBirdsLife, 2500);
    later('smallLife', smallCreaturesLife, 3000);
    later('blink', blinkSomeone, 1500);
    later('flock', flyFlock, 7000);
    later('santa', flySanta, 9000);
  }

  window.addEventListener('resize', fitPoster);
  if (document.fonts) document.fonts.ready.then(measureLayout);

  poster.addEventListener('mousemove', handlePosterMove);
  poster.addEventListener('mouseleave', handlePosterLeave);
  poster.addEventListener('click', handlePosterClick);

  $$('.kw[data-fx]').forEach((w) => {
    w.addEventListener('mouseenter', handleWordEnter);
    w.addEventListener('mouseleave', handleWordLeave);
  });
  const dateNum = $('#dateNum');
  dateNum.addEventListener('mouseenter', flipDate);
  dateNum.addEventListener('mouseleave', restDate);
  const logo = $('#logo');
  logo.addEventListener('mouseenter', rockLogo);
  logo.addEventListener('mouseleave', restLogo);
  const seal = $('#seal');
  seal.addEventListener('mouseenter', stampSeal);
  seal.addEventListener('mouseleave', liftSeal);
  badge.addEventListener('mouseenter', activateBadge);
  badge.addEventListener('mouseleave', deactivateBadge);
  badge.addEventListener('click', donateGift);
  badge.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); donateGift(e); }
  });
  if (cta) {
    cta.addEventListener('mouseenter', activateCta);
    cta.addEventListener('mouseleave', deactivateCta);
  }

  $('#loading').style.opacity = '0';
  clock.start();
  requestAnimationFrame(animate);
}

init();
