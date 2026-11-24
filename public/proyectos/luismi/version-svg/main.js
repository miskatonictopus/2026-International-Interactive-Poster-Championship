/* =========================================================
   NINGÚN NIÑO SIN REGALO · Fundación ITACA · 21 de diciembre
   Escena invernal en 3D, con luz y sombras dinámicas.
   Eventos: mouseenter · mouseleave · mousemove (+ click)
   Física de los regalos que caen: Matter.js (lib/matter.min.js)
   ========================================================= */

const W = 848;
const H = 1200;
const PERSPECTIVE = 1400;       // debe coincidir con .stage en CSS
const GROUND_Y = 1012;          // línea de nieve donde se posan los regalos
const MAX_GIFTS = 18;
const GIFT_LIFETIME = 9000;

const COLORS = {
  red: '#c0262f',
  gold: '#f2c35b',
  cream: '#fbf3e6',
  green: '#2c5e3f',
  ink: '#2e2219',
};

const GIFT_STYLES = [
  { c1: '#c0262f', c2: '#a51c24', rb: '#e8b23a', pat: 'pat-stripes' },
  { c1: '#e8b23a', c2: '#d39a1c', rb: '#c0262f', pat: 'pat-dots' },
  { c1: '#f6efe2', c2: '#c0262f', rb: '#2f7048', pat: 'pat-stripes' },
  { c1: '#2f7048', c2: '#3f8a5c', rb: '#f6efe2', pat: 'pat-dots' },
  { c1: '#4f7fc2', c2: '#f6efe2', rb: '#e8b23a', pat: 'pat-dots' },
  { c1: '#c0262f', c2: '#f6efe2', rb: '#f6efe2', pat: 'pat-plain' },
];

const GIFT_WORDS = ['risas', 'ilusión', 'juego', 'abrazos', 'magia', 'sueños', 'alegría', 'calor', 'amigos', 'cuentos', 'futuro'];

/* =========================================================
   Referencias al DOM
   ========================================================= */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const posterWrap  = $('#posterWrap');
const poster      = $('#poster');
const world       = $('#world');
const headline    = $('#headline');
const badge       = $('#badge');
const badgeRing   = $('#badgeRing');
const badgeCore   = $('#badgeCore');
const cta         = $('#cta');
const giftLayer   = $('#gifts');
const cursorEl    = $('#cursor');
const cursorLight = $('#cursorLight');
const wallShadow  = $('#wallShadowFx');
const fxCtx       = $('#fx').getContext('2d');
const snowFarCtx  = $('#snowFar').getContext('2d');
const snowNearCtx = $('#snowNear').getContext('2d');

const pupils = $$('.pupil').map((el) => ({
  el,
  cx: Number(el.getAttribute('cx')),
  cy: Number(el.getAttribute('cy')),
  max: Number(el.dataset.max),
  x: 0,
  y: 0,
}));

const casts = $$('.cast').map((el) => {
  const cx = Number(el.getAttribute('cx'));
  const cy = Number(el.getAttribute('cy'));
  el.style.transformOrigin = `${cx}px ${cy}px`;
  return { el, cx, h: Number(el.dataset.h), off: 0 };
});

/* =========================================================
   Estado global
   ========================================================= */
const mouse = { x: W / 2, y: H / 2, vx: 0, vy: 0, nx: 0, ny: 0, inside: false };
const view = { rx: 0, ry: 0 };
const cursor = { x: W / 2, y: H / 2, scale: 1, targetScale: 1 };
const shadow = { dx: 7, dy: 9 };
const badgeState = { angle: 0, speed: 0.25, targetSpeed: 0.25 };
const ctaState = { x: 0, y: 0, scale: 1, targetScale: 1, cx: 0, cy: 0 };
const fxState = { treeChase: 0, eaveChase: 0, starBoost: 0, smokeTick: 0 };
const wind = { value: 0.3 };    // viento global: > 0 sopla hacia la derecha

let scale = 1;
let letters = [];
let stars = [];
let treeLights = [];
let eaveLights = [];
let gifts = [];
const giftByElement = new Map();
const running = {};             // animaciones WAAPI activas por nombre
const timers = {};              // temporizadores por nombre

/* =========================================================
   Utilidades
   ========================================================= */
const rand = (min, max) => Math.random() * (max - min) + min;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function toPosterCoords(clientX, clientY) {
  const rect = poster.getBoundingClientRect();
  return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale };
}

function centerOf(el) {
  const r = el.getBoundingClientRect();
  return toPosterCoords(r.left + r.width / 2, r.top + r.height / 2);
}

// Lanza una animación WAAPI guardándola por nombre (para poder revertirla)
function play(name, el, keyframes, options) {
  if (running[name]) running[name].cancel();
  running[name] = el.animate(keyframes, options);
  return running[name];
}

function stop(name, reverse = false) {
  const anim = running[name];
  if (!anim) return;
  if (reverse) anim.reverse();
  else anim.cancel();
  if (!reverse) delete running[name];
}

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
   Escalado y planos 3D
   ========================================================= */
function fitPoster() {
  const margin = 24;
  scale = Math.min((window.innerWidth - margin) / W, (window.innerHeight - margin) / H, 1);
  poster.style.transform = `scale(${scale})`;
  posterWrap.style.width = `${W * scale}px`;
  posterWrap.style.height = `${H * scale}px`;
  measureLayout();
}

// Cada plano se aleja/acerca en Z y se compensa su escala
// para que, sin inclinación, todo encaje como un cartel plano.
function setupPlanes() {
  $$('.plane').forEach((plane) => {
    const z = Number(plane.dataset.z);
    const s = (PERSPECTIVE - z) / PERSPECTIVE;
    plane.style.transformOrigin = '50% 45%';
    plane.style.transform = `translateZ(${z}px) scale(${s.toFixed(4)})`;
  });
}

function measureLayout() {
  letters.forEach((l) => {
    const c = centerOf(l.el);
    l.cx = c.x - l.x;
    l.cy = c.y - l.y;
  });
  const c = centerOf(cta);
  ctaState.cx = c.x - ctaState.x;
  ctaState.cy = c.y - ctaState.y;
}

/* =========================================================
   MOUSEMOVE · inclinación 3D del mundo
   ========================================================= */
function updateWorld() {
  const tx = mouse.inside ? mouse.ny * -4 : 0;
  const ty = mouse.inside ? mouse.nx * 6 : 0;
  view.rx = lerp(view.rx, tx, 0.06);
  view.ry = lerp(view.ry, ty, 0.06);
  world.style.transform = `rotateX(${view.rx.toFixed(3)}deg) rotateY(${view.ry.toFixed(3)}deg)`;
}

/* =========================================================
   MOUSEMOVE · el cursor es una fuente de luz
   (ilumina la escena y mueve todas las sombras)
   ========================================================= */
function updateLighting() {
  // sombras sobre la pared: se alejan de la luz
  let tdx = 7, tdy = 9;
  if (mouse.inside) {
    const dx = 600 - mouse.x;
    const dy = 680 - mouse.y;
    const d = Math.hypot(dx, dy) || 1;
    const strength = clamp(2400 / d, 5, 14);
    tdx = (dx / d) * strength;
    tdy = (dy / d) * strength;
  }
  shadow.dx = lerp(shadow.dx, tdx, 0.12);
  shadow.dy = lerp(shadow.dy, tdy, 0.12);
  wallShadow.setAttribute('dx', shadow.dx.toFixed(1));
  wallShadow.setAttribute('dy', shadow.dy.toFixed(1));

  // sombras proyectadas sobre la nieve
  casts.forEach((c) => {
    const target = mouse.inside ? clamp((c.cx - mouse.x) * 0.07 * c.h, -46, 46) : 8 * c.h;
    c.off = lerp(c.off, target, 0.12);
    c.el.style.transform = `translateX(${c.off.toFixed(1)}px) scaleX(${(1 + Math.abs(c.off) / 70).toFixed(3)})`;
  });

  cursorLight.style.setProperty('--lx', `${mouse.x}px`);
  cursorLight.style.setProperty('--ly', `${mouse.y}px`);
}

/* =========================================================
   MOUSEMOVE · titular: letras que se apartan
   ========================================================= */
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
        inner.style.animationDelay = `${0.2 + index * 0.05}s`;
        outer.appendChild(inner);
        letters.push({ el: outer, cx: 0, cy: 0, x: 0, y: 0, r: 0, hot: false });
        index++;
      }
      line.appendChild(outer);
    });
  });
}

function updateLetters() {
  const RADIUS = 150;
  letters.forEach((l) => {
    let tx = 0, ty = 0, tr = 0, hot = false;
    if (mouse.inside) {
      const dx = l.cx - mouse.x;
      const dy = l.cy - mouse.y;
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
      l.el.style.color = hot ? '#ff8a7a' : '';
    }
  });
}

/* =========================================================
   MOUSEMOVE · los ojos siguen al cursor
   ========================================================= */
function updatePupils() {
  pupils.forEach((p) => {
    let tx = 0, ty = 0;
    if (mouse.inside) {
      const dx = mouse.x - p.cx;
      const dy = mouse.y - p.cy;
      const d = Math.hypot(dx, dy) || 1;
      tx = (dx / d) * p.max;
      ty = (dy / d) * p.max;
    }
    p.x = lerp(p.x, tx, 0.2);
    p.y = lerp(p.y, ty, 0.2);
    const lid = performance.now() < (p.blinkUntil || 0) ? 0.1 : 1;   // parpadeo
    p.el.style.transform = `translate(${p.x.toFixed(2)}px, ${p.y.toFixed(2)}px) scale(1, ${lid})`;
  });
}

/* =========================================================
   Estrellas del cielo y estrella fugaz
   ========================================================= */
const SVG_NS = 'http://www.w3.org/2000/svg';

function createStars(count) {
  const group = $('#stars');
  for (let i = 0; i < count; i++) {
    const c = document.createElementNS(SVG_NS, 'circle');
    const x = rand(0, W);
    const y = rand(0, 540) * rand(0.4, 1);
    c.setAttribute('cx', x.toFixed(1));
    c.setAttribute('cy', y.toFixed(1));
    c.setAttribute('r', rand(0.5, 1.7).toFixed(2));
    c.setAttribute('fill', '#fff');
    group.appendChild(c);
    stars.push({ el: c, x, y, phase: rand(0, Math.PI * 2), speed: rand(0.6, 2) });
  }
}

function updateStars(time) {
  fxState.starBoost = lerp(fxState.starBoost, fxState.starBoostTarget || 0, 0.05);
  stars.forEach((s) => {
    let a = 0.35 + 0.35 * Math.sin(time / 600 * s.speed + s.phase) + fxState.starBoost * 0.4;
    if (mouse.inside) a += Math.max(0, 1 - Math.hypot(s.x - mouse.x, s.y - mouse.y) / 140) * 0.7;
    s.el.setAttribute('opacity', clamp(a, 0.05, 1).toFixed(2));
  });
}

function shootStar() {
  const star = $('#shootingStar');
  const x = rand(80, 500);
  const y = rand(40, 200);
  star.animate(
    [
      { transform: `translate(${x}px, ${y}px)`, opacity: 0 },
      { transform: `translate(${x + 60}px, ${y + 19}px)`, opacity: 1, offset: 0.2 },
      { transform: `translate(${x + 260}px, ${y + 82}px)`, opacity: 0 },
    ],
    { duration: 1100, easing: 'ease-out' }
  );
  later('shoot', shootStar, rand(5000, 9000));
}

/* =========================================================
   Luces: árbol y alero
   ========================================================= */
function makeBulb(parent, x, y, color, r = 3.6, hang = 0) {
  const g = document.createElementNS(SVG_NS, 'g');
  g.style.transformOrigin = `${x}px ${y - hang}px`;
  if (hang) {
    const string = document.createElementNS(SVG_NS, 'line');
    string.setAttribute('x1', x);
    string.setAttribute('y1', y - hang);
    string.setAttribute('x2', x);
    string.setAttribute('y2', y - r);
    string.setAttribute('stroke', '#1a1410');
    string.setAttribute('stroke-width', '1.2');
    g.appendChild(string);
  }
  const glow = document.createElementNS(SVG_NS, 'circle');
  glow.setAttribute('cx', x);
  glow.setAttribute('cy', y);
  glow.setAttribute('fill', color);
  glow.style.filter = 'blur(4px)';
  const bulb = document.createElementNS(SVG_NS, 'circle');
  bulb.setAttribute('cx', x);
  bulb.setAttribute('cy', y);
  bulb.setAttribute('r', r);
  bulb.setAttribute('fill', color);
  const shine = document.createElementNS(SVG_NS, 'circle');
  shine.setAttribute('cx', x - r * 0.35);
  shine.setAttribute('cy', y - r * 0.35);
  shine.setAttribute('r', r * 0.35);
  shine.setAttribute('fill', '#fff');
  shine.setAttribute('opacity', '.8');
  g.append(glow, bulb, shine);
  parent.appendChild(g);
  return { g, glow, bulb, x, y, hang, phase: rand(0, Math.PI * 2) };
}

function createTreeLights() {
  const palette = ['#ffd45a', '#ff5a5a', '#7fe0a8', '#ffffff', '#7fb2ff'];
  const group = $('#treeLights');
  let n = 0;
  ['#treeGarland1', '#treeGarland2', '#treeGarland3', '#treeGarland4'].forEach((sel, row) => {
    const path = $(sel);
    const count = row === 3 ? 4 : 6;
    const len = path.getTotalLength();
    for (let i = 0; i < count; i++) {
      const p = path.getPointAtLength((len / (count + 1)) * (i + 1));
      const bulb = makeBulb(group, p.x, p.y, palette[n % palette.length]);
      bulb.index = n++;
      treeLights.push(bulb);
    }
  });
}

function createEaveLights() {
  const group = $('#eaveLights');
  const palette = ['#ffcf6b', '#ff6b5a', '#ffe9b0', '#7fe0a8', '#ffcf6b'];
  const points = [];
  for (let x = 270; x <= 840; x += 40) {
    points.push({ x, y: 508 - (x - 255) * 0.3508 + 10 });
  }
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    d += ` Q${(a.x + b.x) / 2},${(a.y + b.y) / 2 + 9} ${b.x},${b.y}`;
  }
  const wire = document.createElementNS(SVG_NS, 'path');
  wire.setAttribute('d', d);
  wire.setAttribute('fill', 'none');
  wire.setAttribute('stroke', '#1a1410');
  wire.setAttribute('stroke-width', '1.6');
  group.appendChild(wire);
  points.forEach((p, i) => {
    const bulb = makeBulb(group, p.x, p.y + 9, palette[i % palette.length], 3.2, 8);
    bulb.index = i;
    eaveLights.push(bulb);
  });
}

// mousemove: las bombillas cercanas al cursor brillan más.
// Al pasar por el árbol o el alero, se activa un patrón de "persecución".
function updateLights(list, time, chaseUntil) {
  const chasing = time < chaseUntil;
  list.forEach((l) => {
    let light = 0.35 + 0.25 * Math.sin(time / 320 + l.phase);
    if (chasing) light = 0.15 + 0.85 * Math.max(0, Math.sin(time / 90 - l.index * 0.9));
    if (mouse.inside) light += Math.max(0, 1 - Math.hypot(l.x - mouse.x, l.y - mouse.y) / 120) * 0.8;
    light = clamp(light, 0.08, 1);
    l.glow.setAttribute('opacity', light.toFixed(2));
    l.glow.setAttribute('r', (4 + light * 9).toFixed(1));
    l.bulb.setAttribute('opacity', (0.45 + light * 0.55).toFixed(2));
    // las bombillas colgantes se balancean con el viento
    if (l.hang) {
      const a = -wind.value * 16 + Math.sin(time / 420 + l.phase) * 5 * (0.3 + Math.abs(wind.value));
      l.g.style.transform = `rotate(${a.toFixed(1)}deg)`;
    }
  });
}

/* =========================================================
   VIENTO · ráfagas naturales + el ratón también sopla
   ========================================================= */
let hollyUses = [];
let pineSways = [];
let ornaments = [];
const grassTufts = [];

function updateWind(time) {
  const t = time / 1000;
  const gust = 0.5 * Math.sin(t * 0.33) + 0.3 * Math.sin(t * 0.83 + 1.3) + 0.2 * Math.sin(t * 2.1 + 0.4);
  let target = 0.25 + gust * 0.6;
  target += clamp(mouse.vx * 0.05, -1.3, 1.3);         // mover el ratón rápido crea una ráfaga
  wind.value = lerp(wind.value, target, 0.03);

  const strength = Math.abs(wind.value);
  if (strength > 0.6) {
    if (Math.random() < 0.22) emitLeaf();
    if (Math.random() < 0.25) emitStreak();
    if (Math.random() < 0.3) emitRoofSnow();
  } else if (Math.random() < 0.02) {
    emitLeaf();
  }
}

// Todo lo que tiene "ramas" se mece: árbol, pinos, acebo, bolas, casita, corona, hierba
function updateWindEffects(time) {
  const w = wind.value;
  const calm = 0.3 + Math.abs(w);
  const sway = (phase, speed = 1) => Math.sin(time / (420 / speed) + phase);

  // árbol de Navidad: la copa se dobla más que la base
  const a = -w * 3.2 - sway(0) * 0.7 * calm;
  const tan = Math.tan((a * Math.PI) / 180);
  $('#treeSway').style.transform = `skewX(${a.toFixed(2)}deg)`;
  $('#starWind').style.transform = `translateX(${(-292 * tan).toFixed(1)}px)`;
  $('#cardinalWind').style.transform = `translateX(${(-74 * tan).toFixed(1)}px)`;

  pineSways.forEach((p, i) => {
    p.style.transform = `skewX(${(-w * 2.4 - sway(i * 1.7, 0.8) * 0.9 * calm).toFixed(2)}deg)`;
  });

  ornaments.forEach((o, i) => {
    o.style.transform = `rotate(${(-w * 14 + sway(i * 1.1, 1.2) * 6 * calm).toFixed(1)}deg)`;
  });

  hollyUses.forEach((h, i) => {
    h.style.transform = `rotate(${(-w * 4 + sway(i * 2, 1.6) * 2.5 * calm).toFixed(2)}deg)`;
  });

  $('#bhSwing').style.transform = `rotate(${(-w * 7 + sway(0.5, 0.7) * 2.5).toFixed(2)}deg)`;
  $('#wreath').style.transform = `rotate(${(-w * 2 + sway(2, 0.6) * 0.8).toFixed(2)}deg)`;

  updateGrass(time);
}

/* ---------- Hierba seca: el viento la mece y el cursor la aparta ---------- */
function createGrass() {
  const parent = $('#grass');
  const spots = [[22, 1004], [60, 1000], [250, 1006], [336, 1003], [420, 1001], [452, 1004], [640, 1009], [668, 1007], [842, 999]];
  const tones = ['#8a7a52', '#a58f5f', '#6d6a44', '#b9a46e'];
  spots.forEach(([x, y], i) => {
    const g = document.createElementNS(SVG_NS, 'g');
    g.style.transformOrigin = `${x}px ${y}px`;
    const blades = 4 + (i % 3);
    for (let k = 0; k < blades; k++) {
      const x0 = x + rand(-5, 5);
      const dx = rand(-10, 10);
      const h = rand(14, 32);
      const blade = document.createElementNS(SVG_NS, 'path');
      blade.setAttribute('d', `M${x0.toFixed(1)},${y + 3} q${(dx * 0.3).toFixed(1)},${(-h * 0.6).toFixed(1)} ${dx.toFixed(1)},${(-h).toFixed(1)}`);
      blade.setAttribute('stroke', pick(tones));
      blade.setAttribute('stroke-width', rand(1.2, 2.1).toFixed(1));
      blade.setAttribute('stroke-linecap', 'round');
      blade.setAttribute('fill', 'none');
      g.appendChild(blade);
      if (Math.random() < 0.45) {
        const seed = document.createElementNS(SVG_NS, 'ellipse');
        seed.setAttribute('cx', (x0 + dx).toFixed(1));
        seed.setAttribute('cy', (y + 3 - h).toFixed(1));
        seed.setAttribute('rx', '1.6');
        seed.setAttribute('ry', '3.2');
        seed.setAttribute('fill', '#b9a46e');
        g.appendChild(seed);
      }
    }
    parent.appendChild(g);
    grassTufts.push({ g, x, y, bend: 0, phase: rand(0, Math.PI * 2) });
  });
}

function updateGrass(time) {
  grassTufts.forEach((t) => {
    let push = 0;
    if (mouse.inside) {
      const d = Math.hypot(t.x - mouse.x, t.y - 15 - mouse.y);
      if (d < 90) push = Math.sign(t.x - mouse.x || 1) * (1 - d / 90) * 32;
    }
    t.bend = lerp(t.bend, push, 0.15);
    const a = -wind.value * 12 - Math.sin(time / 300 + t.phase) * 3.5 * (0.3 + Math.abs(wind.value)) - t.bend;
    t.g.style.transform = `skewX(${a.toFixed(2)}deg)`;
  });
}

/* =========================================================
   VIDA PROPIA DE LOS ANIMALES (sin que nadie los toque)
   ========================================================= */
const deer = { x: 0, dir: -1, mode: 'idle', target: 0, paused: false, legs: [] };
const fox = { x: 1000, active: false, paused: false, legs: [], tail: null };
const rabbit = { x: 0, paused: false };
const sparrowState = { x: 0, paused: false };
const robinState = { x: 0, paused: false };
const squirrel = { paused: false };

// ---- Ciervo: alterna entre pasear, pastar y mirar alrededor
function deerNextAction() {
  if (deer.paused) { later('deer', deerNextAction, 1500); return; }
  const r = Math.random();
  if (r < 0.45) {
    deer.target = rand(-150, 50);
    deer.dir = Math.sign(deer.target - deer.x) || -1;
    deer.mode = 'walk';
    setDeerGraze(false);
    startDeerLegs();
  } else if (r < 0.8) {
    deer.mode = 'graze';
    setDeerGraze(true);
    later('deer', deerNextAction, rand(2500, 4500));
  } else {
    deer.mode = 'idle';
    setDeerGraze(false);
    $('#deerHead').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(12deg)' }, { transform: 'rotate(-8deg)' }, { transform: 'rotate(0)' }], { duration: 1800, easing: 'ease-in-out' });
    later('deer', deerNextAction, rand(2000, 3500));
  }
}

function setDeerGraze(on) {
  $('#deerNeck').style.transform = on ? 'translate(0, 16px) rotate(-68deg)' : '';
}

function startDeerLegs() {
  stopDeerLegs();
  deer.legs = $$('.deer-leg').map((leg, i) => leg.animate(
    [{ transform: 'rotate(16deg)' }, { transform: 'rotate(-16deg)' }],
    { duration: 520, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out', delay: (i % 2) * 260 }
  ));
}

function stopDeerLegs() {
  deer.legs.forEach((a) => a.cancel());
  deer.legs = [];
}

function updateDeer() {
  if (deer.mode === 'walk' && !deer.paused) {
    deer.x += 0.45 * deer.dir;
    if ((deer.dir > 0 && deer.x >= deer.target) || (deer.dir < 0 && deer.x <= deer.target)) {
      deer.mode = 'idle';
      stopDeerLegs();
      later('deer', deerNextAction, rand(1500, 3000));
    }
  }
  $('#deerWalk').style.transform = `translateX(${deer.x.toFixed(2)}px)`;
  $('#deerFlip').style.transform = deer.dir > 0 ? 'scaleX(-1)' : '';
}

// ---- Zorro: cruza el bosque trotando y desaparece detrás de la caseta
function foxStart() {
  fox.active = true;
  fox.x = 980;
  fox.legs = $$('.fox-leg').map((leg, i) => leg.animate(
    [{ transform: 'rotate(28deg)' }, { transform: 'rotate(-28deg)' }],
    { duration: 240, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out', delay: (i % 2) * 120 }
  ));
  fox.tail = $('#foxTail').animate([{ transform: 'rotate(-6deg)' }, { transform: 'rotate(8deg)' }], { duration: 480, iterations: Infinity, direction: 'alternate' });
}

function foxEnd() {
  fox.active = false;
  fox.legs.forEach((a) => a.cancel());
  if (fox.tail) fox.tail.cancel();
  later('fox', foxStart, rand(14000, 22000));
}

function updateFox() {
  if (!fox.active) return;
  if (!fox.paused) {
    fox.x -= 1.5;
    if (fox.x < -140) foxEnd();
  }
  $('#fox').style.transform = `translate(${fox.x.toFixed(1)}px, 654px) scale(.8)`;
}

// ---- Conejo: da saltitos por la nieve de vez en cuando
function rabbitWander() {
  if (!rabbit.paused) {
    const nx = clamp(rabbit.x + rand(-45, 45), -40, 50);
    const facingRight = nx > rabbit.x;
    rabbit.x = nx;
    $('#rabbitMove').style.transform = `translateX(${nx.toFixed(1)}px) scaleX(${facingRight ? -1 : 1})`;
    $('#rabbitBody').animate([
      { transform: 'translateY(0)' }, { transform: 'translateY(-22px)', offset: 0.25 }, { transform: 'translateY(0)', offset: 0.5 },
      { transform: 'translateY(-16px)', offset: 0.75 }, { transform: 'translateY(0)' },
    ], { duration: 1000, easing: 'ease-in-out' });
    later('rabbitPuffIdle', () => emitPuff(282 + nx, 1062, 6), 950);
  }
  later('rabbit', rabbitWander, rand(4000, 8000));
}

// ---- Gorrión y petirrojo: saltitos y aleteos
function hopBird(el, state, min, max) {
  if (state.paused) return;
  const x0 = state.x;
  const x1 = clamp(x0 + rand(-20, 20), min, max);
  state.x = x1;
  el.style.transform = `translateX(${x1.toFixed(1)}px)`;
  el.animate([
    { transform: `translate(${x0.toFixed(1)}px, 0)` },
    { transform: `translate(${((x0 + x1) / 2).toFixed(1)}px, -9px)` },
    { transform: `translate(${x1.toFixed(1)}px, 0)` },
  ], { duration: 320, easing: 'ease-out' });
}

function groundBirdsLife() {
  if (Math.random() < 0.6) hopBird($('#sparrowMove'), sparrowState, -30, 25);
  else if (!sparrowState.paused) $('#sparrowWing').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-40deg)' }, { transform: 'rotate(0)' }], { duration: 120, iterations: 4 });
  if (Math.random() < 0.6) later('robinHop', () => hopBird($('#robinMove'), robinState, -20, 30), rand(300, 1200));
  later('groundBirds', groundBirdsLife, rand(1800, 3800));
}

// ---- Ardilla, arrendajo, cardenal y carbonero: pequeños gestos
function smallCreaturesLife() {
  const r = Math.random();
  if (r < 0.3 && !squirrel.paused) {
    $('#sqAcorn').animate([{ transform: 'translate(0, 0)' }, { transform: 'translate(-3px, -8px) rotate(-12deg)' }, { transform: 'translate(0, 0)' }], { duration: 300, iterations: 3 });
    for (let i = 0; i < 3; i++) addParticle({ type: 'dot', x: 700, y: 694, vx: rand(-1, 0.4), vy: rand(-1, 0), gravity: 0.2, size: 1.2, decay: 0.03, color: '#7a5030' });
  } else if (r < 0.5 && !(running.jay && running.jay.playState === 'running')) {
    $('#jayCrest').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-28deg)' }, { transform: 'rotate(0)' }], { duration: 700 });
    $('#jayWing').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-30deg)' }, { transform: 'rotate(0)' }], { duration: 150, iterations: 3 });
  } else if (r < 0.75 && !(running.cardinal && running.cardinal.playState === 'running')) {
    $('#cardinal').animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-7px) rotate(-8deg)' }, { transform: 'translateY(0)' }], { duration: 420, easing: 'ease-out' });
  } else {
    $('#chickHead').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-22deg)' }, { transform: 'rotate(16deg)' }, { transform: 'rotate(0)' }], { duration: 900 });
  }
  later('smallLife', smallCreaturesLife, rand(1500, 3200));
}

// ---- Parpadeo: cada animal parpadea a su ritmo
const blinkGroups = new Map();
function setupBlinks() {
  pupils.forEach((p) => {
    p.el.style.transformOrigin = `${p.cx}px ${p.cy}px`;
    p.blinkUntil = 0;
    const owner = p.el.closest('[data-react]') || p.el;
    if (!blinkGroups.has(owner)) blinkGroups.set(owner, []);
    blinkGroups.get(owner).push(p);
  });
}

function blinkSomeone() {
  const owners = [...blinkGroups.keys()];
  const owner = pick(owners);
  const until = performance.now() + 150;
  blinkGroups.get(owner).forEach((p) => { p.blinkUntil = until; });
  if (owner.dataset && owner.dataset.react === 'deer') {
    $('#deerLids').animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }], { duration: 180 });
  }
  later('blink', blinkSomeone, rand(400, 1400));
}

// ---- Bandada de pájaros cruzando el cielo
function flyFlock() {
  const flock = $('#flock');
  flock.innerHTML = '';
  const dir = Math.random() < 0.5 ? 1 : -1;
  const y0 = rand(90, 250);
  for (let i = 0; i < 5; i++) {
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('transform', `translate(${-Math.abs(i - 2) * 18 * dir} ${Math.abs(i - 2) * 10 + rand(-2, 2)})`);
    const bird = document.createElementNS(SVG_NS, 'path');
    bird.setAttribute('d', 'M-8,0 Q-4,-5 0,0 Q4,-5 8,0');
    bird.setAttribute('stroke', '#1b1a2e');
    bird.setAttribute('stroke-width', '1.8');
    bird.setAttribute('fill', 'none');
    bird.setAttribute('stroke-linecap', 'round');
    bird.setAttribute('class', 'flap');
    bird.style.animationDelay = `${-rand(0, 0.3)}s`;
    g.appendChild(bird);
    flock.appendChild(g);
  }
  const trip = flock.animate([
    { transform: `translate(${dir > 0 ? -140 : 990}px, ${y0}px)` },
    { transform: `translate(${dir > 0 ? 990 : -140}px, ${y0 - 50}px)` },
  ], { duration: 17000, easing: 'linear' });
  trip.onfinish = () => { flock.innerHTML = ''; };
  later('flock', flyFlock, rand(24000, 34000));
}

/* =========================================================
   REACCIONES PROPIAS DE CADA ELEMENTO
   mouseenter → enter(el)   ·   mouseleave → leave(el)
   ========================================================= */
const innerOf = (el) => el.querySelector('.inner');
const SHAKE = [
  { transform: 'rotate(0)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(4deg)' },
  { transform: 'rotate(-3deg)' }, { transform: 'rotate(2deg)' }, { transform: 'rotate(0)' },
];

// ---- Luna: brilla más y despierta a las estrellas
function moonShine() {
  $('#moonGlow').style.opacity = '1';
  play('moon', $('#moon'), [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }], { duration: 600, fill: 'forwards', easing: 'ease-out' });
  fxState.starBoostTarget = 1;
  emitBurst(560, 150, 10, 4);
}
function moonRest() {
  $('#moonGlow').style.opacity = '';
  stop('moon', true);
  fxState.starBoostTarget = 0;
}

// ---- Pinos: se sacuden y sueltan su nieve
function pineShake(el) {
  innerOf(el).animate(SHAKE, { duration: 600 });
  emitSnowFall(Number(el.dataset.cx), Number(el.dataset.cy) + 30, 18);
}
function pineRest() {}

// ---- Ciervo: alza la cabeza, parpadea, mueve rabo y orejas
function deerGreet() {
  deer.paused = true;
  stopDeerLegs();
  setDeerGraze(false);
  $('#deerHead').style.transform = 'rotate(-10deg) translateY(-4px)';
  $('#deerEars').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(10deg)' }, { transform: 'rotate(0)' }], { duration: 500, iterations: 2 });
  $('#deerLids').animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }], { duration: 260, delay: 300 });
  $('#deerTail').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-30deg)' }, { transform: 'rotate(10deg)' }, { transform: 'rotate(0)' }], { duration: 500, iterations: 2 });
  emitHearts(222, 560, 4);
}
function deerRest() {
  $('#deerHead').style.transform = '';
  deer.paused = false;
  if (deer.mode === 'walk') startDeerLegs();
}

// ---- Zorro: se para, te mira y mueve la cola
function foxNotice() {
  fox.paused = true;
  fox.legs.forEach((a) => a.pause());
  $('#foxHead').style.transform = 'rotate(-14deg) translateY(-3px)';
  if (fox.tail) fox.tail.updatePlaybackRate(3);
  emitText(fox.x - 20, 604, '¡yip!', '#ffd2a8');
}
function foxGoOn() {
  fox.paused = false;
  fox.legs.forEach((a) => a.play());
  $('#foxHead').style.transform = '';
  if (fox.tail) fox.tail.updatePlaybackRate(1);
}

// ---- Chimenea: tiembla y suelta una gran bocanada de humo
function chimneyPuff() {
  $('#chimney').animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(2px)' }, { transform: 'translateX(0)' }], { duration: 120, iterations: 4 });
  for (let i = 0; i < 10; i++) emitSmoke(641, 232, 2.2, i * 4);
  emitText(660, 210, '¡puf!', '#fbf3e6');
}
function chimneyRest() {}

// ---- Nieve del tejado: una placa resbala y cae
function roofSnowSlide() {
  const slab = $('#roofSlab');
  slab.style.transform = 'translate(-90px, 34px) rotate(-6deg)';
  later('slabFall', () => {
    slab.style.opacity = '0';
    emitSnowFall(400, 410, 30);
  }, 650);
}
function roofSnowRest() {
  const slab = $('#roofSlab');
  later('slabBack', () => {
    slab.style.transform = '';
    later('slabShow', () => { slab.style.opacity = ''; }, 900);
  }, 1200);
}

// ---- Alero: las luces se persiguen y los carámbanos gotean
function eaveSparkle() {
  fxState.eaveChase = performance.now() + 3000;
  $('#icicles').animate([{ transform: 'translateY(0)' }, { transform: 'translateY(2px)' }, { transform: 'translateY(0)' }], { duration: 300, iterations: 3 });
  every('drip', () => {
    const tips = [[290, 520], [346, 508], [424, 474], [507, 456], [654, 392], [743, 372], [822, 330]];
    const t = pick(tips);
    emitDrops(t[0], t[1], 1, '#cfe6fb');
  }, 120);
}
function eaveRest() {
  stopEvery('drip');
}

// ---- Casita: se balancea y se asoma un pajarito
function birdhousePeek() {
  $('#bhPeek').style.transform = 'translate(0, -2px) scale(1)';
  $('#bhSwing').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(10deg)' }, { transform: 'rotate(-5deg)' }, { transform: 'rotate(0)' }], { duration: 1100, easing: 'ease-out' });
  emitText(578, 440, '¡pi-pío!', COLORS.cream);
}
function birdhouseHide() {
  $('#bhPeek').style.transform = '';
}

// ---- Arrendajo: sube el tejado a saltitos y grazna
function jayHop() {
  $('#jayCrest').style.transform = 'rotate(-25deg)';
  play('jay', $('#jay'), [
    { transform: 'translate(0, 0)' },
    { transform: 'translate(18px, -16px)' },
    { transform: 'translate(34px, -12px)' },
    { transform: 'translate(52px, -28px)' },
    { transform: 'translate(68px, -24px)' },
  ], { duration: 900, fill: 'forwards', easing: 'ease-out' });
  $('#jayWing').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-45deg)' }, { transform: 'rotate(0)' }], { duration: 160, iterations: 5 });
  emitText(380, 350, '¡crá, crá!', '#cfe0ff');
}
function jayRest() {
  $('#jayCrest').style.transform = '';
  stop('jay', true);
}

// ---- Ventana: se enciende la lámpara y el osito saluda
function windowLightOn() {
  $('#winGlow').style.opacity = '1';
  $('#winSpill').style.opacity = '1';
  $('#teddy').style.opacity = '1';
  play('teddyWave', $('#teddyArm'), [{ transform: 'rotate(0)' }, { transform: 'rotate(-40deg)' }, { transform: 'rotate(0)' }], { duration: 500, iterations: Infinity });
  emitHearts(752, 545, 3);
}
function windowLightOff() {
  $('#winGlow').style.opacity = '';
  $('#winSpill').style.opacity = '';
  $('#teddy').style.opacity = '';
  stop('teddyWave');
}

// ---- Corona: se balancea y suenan las campanillas
function wreathRing() {
  $('#wreath').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(12deg)' }, { transform: 'rotate(-9deg)' }, { transform: 'rotate(5deg)' }, { transform: 'rotate(0)' }], { duration: 1000, easing: 'ease-out' });
  $$('#bells .bell').forEach((bell, i) => {
    bell.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(28deg)' }, { transform: 'rotate(-24deg)' }, { transform: 'rotate(0)' }], { duration: 380, iterations: 3, delay: i * 120 });
  });
  emitText(500, 660, '¡din don!', COLORS.gold);
  emitNotes(482, 640, 3, COLORS.gold);
}
function wreathRest() {}

// ---- Rastrillo: se tambalea y sus púas vibran
function rakeWobble() {
  $('#rake').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-5deg)' }, { transform: 'rotate(3.5deg)' }, { transform: 'rotate(-2deg)' }, { transform: 'rotate(0)' }], { duration: 1100, easing: 'ease-out' });
  $('#rakeTines').animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(1.12)' }, { transform: 'scaleX(.92)' }, { transform: 'scaleX(1)' }], { duration: 160, iterations: 4 });
  emitSnowFall(402, 560, 8);
}
function rakeRest() {}

// ---- Pala: se levanta y se clava en la nieve
function shovelDig() {
  $('#shovel').animate([
    { transform: 'translateY(0) rotate(0)' },
    { transform: 'translateY(-36px) rotate(-6deg)', offset: 0.45 },
    { transform: 'translateY(8px) rotate(2deg)', offset: 0.7 },
    { transform: 'translateY(0) rotate(0)' },
  ], { duration: 900, easing: 'ease-in-out' });
  later('dig', () => emitPuff(346, 990, 22), 620);
}
function shovelRest() {}

// ---- Maceta boca abajo: se levanta y aparece un ratoncito
function mousePotLift() {
  $('#mousePot').style.transform = 'translate(-8px, -36px) rotate(-16deg)';
  $('#mouse').style.opacity = '1';
  $('#mouse').animate([{ transform: 'scale(.6)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 400, delay: 150 });
  emitText(430, 880, '¡hola!', COLORS.cream);
}
function mousePotDrop() {
  $('#mousePot').style.transform = '';
  $('#mouse').style.opacity = '';
}

// ---- Caja de música: se abre, gira una estrella y suena
function musicBoxOpen(el) {
  openLid(el, 'translate(-2px, -18px) rotate(-30deg)');
  $('#musicStar').style.opacity = '1';
  play('musicSpin', $('#musicStar'), [{ transform: 'scaleX(1)' }, { transform: 'scaleX(-1)' }, { transform: 'scaleX(1)' }], { duration: 900, iterations: Infinity });
  every('music', () => emitNotes(553, 870, 1, COLORS.gold), 280);
}
function musicBoxClose(el) {
  closeLid(el);
  $('#musicStar').style.opacity = '';
  stop('musicSpin');
  stopEvery('music');
}

// ---- Saco de semillas: se inclina, caen semillas y brota una planta
function seedBagSpill() {
  $('#seedBag').style.transform = 'rotate(10deg)';
  $('#sprout').style.transform = 'scale(1)';
  every('seeds', () => emitSeeds(668, 878, 2), 70);
  later('seedsStop', () => stopEvery('seeds'), 700);
}
function seedBagRest() {
  $('#seedBag').style.transform = '';
  $('#sprout').style.transform = 'scale(0)';
  stopEvery('seeds');
}

// ---- Macetas: tintinean una detrás de otra
function potsClink() {
  $$('[data-react="pots"] .pot').forEach((pot, i) => {
    pot.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-8deg)' }, { transform: 'rotate(6deg)' }, { transform: 'rotate(0)' }], { duration: 420, delay: i * 140 });
  });
  emitText(735, 870, '¡clin!', COLORS.cream);
}
function potsRest() {}

// ---- Regadera: se inclina y riega el acebo
function canPour() {
  $('#can').style.transform = 'rotate(24deg)';
  every('pour', () => emitDrops(544, 714, 2, '#8fc3ee'), 60);
}
function canRest() {
  $('#can').style.transform = '';
  stopEvery('pour');
}

// ---- Acebo: las hojas se agitan y caen bayas
function hollyRustle() {
  $('#hollyLeaves').animate([
    { transform: 'rotate(0)' }, { transform: 'rotate(-3deg) scale(1.03)' }, { transform: 'rotate(3deg)' },
    { transform: 'rotate(-2deg)' }, { transform: 'rotate(0)' },
  ], { duration: 700 });
  for (let i = 0; i < 4; i++) {
    addParticle({ type: 'dot', x: rand(530, 590), y: rand(650, 690), vx: rand(-1, 1), vy: rand(-2, 0), gravity: 0.25, size: 3, decay: 0.02, color: '#c0262f' });
  }
}
function hollyRest() {}

// ---- Carbonero: salta a las bayas y picotea
function chickadeePeck() {
  play('chick', $('#chickadee'), [
    { transform: 'translate(0, 0)' },
    { transform: 'translate(-8px, -12px)', offset: 0.4 },
    { transform: 'translate(-14px, 14px)' },
  ], { duration: 500, fill: 'forwards', easing: 'ease-out' });
  $('#chickHead').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-28deg)' }, { transform: 'rotate(0)' }], { duration: 260, iterations: 3, delay: 500 });
  emitText(540, 590, '¡chic-a-dí!', COLORS.cream);
}
function chickadeeRest() {
  stop('chick', true);
}

// ---- Regalo grande: la tapa salta y sale una estrella con muelle
function jackGiftOpen(el) {
  openLid(el, 'translate(14px, -40px) rotate(32deg)');
  play('jack', $('#jack'), [
    { transform: 'scaleY(0)' }, { transform: 'scaleY(1.3)', offset: 0.5 },
    { transform: 'scaleY(.85)', offset: 0.75 }, { transform: 'scaleY(1)' },
  ], { duration: 700, fill: 'forwards', easing: 'ease-out' });
  emitBurst(640, 650, 18);
}
function jackGiftClose(el) {
  closeLid(el);
  stop('jack', true);
}

// ---- Regalo pequeño: la tapa vuela girando y estalla el confeti
function confettiGiftOpen(el) {
  const lid = el.querySelector('.lid');
  play('confLid', lid, [
    { transform: 'translate(0, 0) rotate(0)' },
    { transform: 'translate(10px, -70px) rotate(200deg)', offset: 0.5 },
    { transform: 'translate(16px, -30px) rotate(340deg)' },
  ], { duration: 900, fill: 'forwards', easing: 'ease-out' });
  showWord(el);
  emitConfetti(794, 710, 40);
}
function confettiGiftClose(el) {
  stop('confLid', true);
  hideWord(el);
}

// ---- Ardilla: cambia la bellota por un regalo y mueve la cola
function squirrelShowGift() {
  squirrel.paused = true;
  play('sqTail', $('#sqTail'), [{ transform: 'rotate(0)' }, { transform: 'rotate(-18deg)' }, { transform: 'rotate(-10deg)' }], { duration: 500, fill: 'forwards' });
  $('#sqAcorn').style.opacity = '0';
  $('#sqAcorn').style.transform = 'translateY(8px)';
  $('#sqGift').style.opacity = '1';
  $('#sqGift').style.transform = 'translate(-6px, -28px) rotate(-10deg)';
  emitBurst(700, 680, 12, 5);
}
function squirrelRest() {
  squirrel.paused = false;
  stop('sqTail');
  $('#sqAcorn').style.opacity = '';
  $('#sqAcorn').style.transform = '';
  $('#sqGift').style.opacity = '';
  $('#sqGift').style.transform = '';
}

// ---- Árbol: luces en persecución y bolas que se balancean
function treeCelebrate() {
  fxState.treeChase = performance.now() + 4000;
  $$('#ornaments .orn').forEach((o, i) => {
    o.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(18deg)' }, { transform: 'rotate(-14deg)' }, { transform: 'rotate(0)' }], { duration: 700, delay: i * 70 });
  });
  $('#tree').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.02, .98)' }, { transform: 'scale(1)' }], { duration: 400 });
}
function treeRest() {}

// ---- Estrella del árbol: gira sobre sí misma y lanza rayos
function treeStarSpin() {
  $('#starHalo').style.opacity = '1';
  play('star', $('#treeStar'), [{ transform: 'rotate(0) scale(1)' }, { transform: 'rotate(360deg) scale(1.4)' }], { duration: 900, fill: 'forwards', easing: 'cubic-bezier(.3,1.4,.5,1)' });
  emitBurst(150, 650, 26, 8);
}
function treeStarRest() {
  $('#starHalo').style.opacity = '';
  stop('star', true);
}

// ---- Cardenal: vuela en círculo y vuelve a su rama
function cardinalFly() {
  if (running.cardinal && running.cardinal.playState === 'running') return;
  play('cardinal', $('#cardinal'), [
    { transform: 'translate(0, 0) rotate(0)' },
    { transform: 'translate(-10px, -70px) rotate(-20deg)', offset: 0.2 },
    { transform: 'translate(60px, -150px) rotate(10deg)', offset: 0.45 },
    { transform: 'translate(130px, -90px) rotate(25deg)', offset: 0.65 },
    { transform: 'translate(60px, -20px) rotate(-10deg)', offset: 0.85 },
    { transform: 'translate(0, 0) rotate(0)' },
  ], { duration: 2200, easing: 'ease-in-out' });
  $('#cardinalWing').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-55deg)' }, { transform: 'rotate(0)' }], { duration: 130, iterations: 16 });
  emitNotes(58, 826, 3, COLORS.red);
}
function cardinalRest() {}

// ---- Conejo: salto doble con polvo de nieve
function rabbitHop() {
  rabbit.paused = true;
  $('#rabbitEars').style.transform = 'rotate(-18deg)';
  $('#rabbitBody').animate([
    { transform: 'translateY(0)' },
    { transform: 'translateY(-50px) rotate(-8deg)', offset: 0.4 },
    { transform: 'translateY(0) scale(1.06, .92)', offset: 0.72 },
    { transform: 'translateY(-14px)', offset: 0.86 },
    { transform: 'translateY(0)' },
  ], { duration: 950, easing: 'ease-out' });
  later('rabbitPuff', () => emitPuff(280 + rabbit.x, 1062, 16), 680);
}
function rabbitRest() {
  rabbit.paused = false;
  $('#rabbitEars').style.transform = '';
}

// ---- Gorrión: echa a volar y vuelve cuando te vas
function sparrowFly() {
  sparrowState.paused = true;
  clearTimeout(timers.sparrowBack);
  $('#sparrowWing').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-60deg)' }, { transform: 'rotate(0)' }], { duration: 110, iterations: 10 });
  $('#sparrow').style.transform = 'translate(90px, -340px) rotate(-15deg) scale(.6)';
  $('#sparrow').style.opacity = '0';
  emitPuff(494, 1074, 10);
}
function sparrowReturn() {
  later('sparrowBack', () => {
    $('#sparrow').style.transform = '';
    $('#sparrow').style.opacity = '';
    sparrowState.paused = false;
  }, 900);
}

// ---- Petirrojo: avanza a saltitos y canta
function robinHop() {
  robinState.paused = true;
  play('robin', $('#robin'), [
    { transform: 'translate(0, 0)' },
    { transform: 'translate(-12px, -10px)' },
    { transform: 'translate(-22px, 0)' },
    { transform: 'translate(-34px, -10px)' },
    { transform: 'translate(-44px, 0)' },
  ], { duration: 700, fill: 'forwards' });
  emitText(560, 1018, '¡pío!', COLORS.red);
}
function robinRest() {
  robinState.paused = false;
  stop('robin', true);
}

// ---- Saco: se sacude y asoman los regalos (clic: ¡salen disparados!)
function sackShake(el) {
  innerOf(el).animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(4deg)' }, { transform: 'rotate(-2deg)' }, { transform: 'rotate(0)' }], { duration: 600 });
  $('#sackPeek').style.transform = 'translateY(-18px)';
}
function sackRest() {
  $('#sackPeek').style.transform = '';
}

// ---- utilidades de los regalos SVG
function showWord(el) {
  const word = el.querySelector('.word');
  word.style.opacity = '1';
  word.style.transform = 'translateY(-12px) scale(1.1)';
}
function hideWord(el) {
  const word = el.querySelector('.word');
  word.style.opacity = '';
  word.style.transform = '';
}
function openLid(el, transform) {
  el.querySelector('.lid').style.transform = transform;
  showWord(el);
}
function closeLid(el) {
  el.querySelector('.lid').style.transform = '';
  hideWord(el);
}

const REACTIONS = {
  moon:         { enter: moonShine,         leave: moonRest },
  pine:         { enter: pineShake,         leave: pineRest },
  deer:         { enter: deerGreet,         leave: deerRest },
  fox:          { enter: foxNotice,         leave: foxGoOn },
  chimney:      { enter: chimneyPuff,       leave: chimneyRest },
  roofSnow:     { enter: roofSnowSlide,     leave: roofSnowRest },
  eave:         { enter: eaveSparkle,       leave: eaveRest },
  birdhouse:    { enter: birdhousePeek,     leave: birdhouseHide },
  jay:          { enter: jayHop,            leave: jayRest },
  window:       { enter: windowLightOn,     leave: windowLightOff },
  wreath:       { enter: wreathRing,        leave: wreathRest },
  rake:         { enter: rakeWobble,        leave: rakeRest },
  shovel:       { enter: shovelDig,         leave: shovelRest },
  mousePot:     { enter: mousePotLift,      leave: mousePotDrop },
  musicBox:     { enter: musicBoxOpen,      leave: musicBoxClose },
  seedBag:      { enter: seedBagSpill,      leave: seedBagRest },
  pots:         { enter: potsClink,         leave: potsRest },
  can:          { enter: canPour,           leave: canRest },
  holly:        { enter: hollyRustle,       leave: hollyRest },
  chickadee:    { enter: chickadeePeck,     leave: chickadeeRest },
  jackGift:     { enter: jackGiftOpen,      leave: jackGiftClose },
  confettiGift: { enter: confettiGiftOpen,  leave: confettiGiftClose },
  squirrel:     { enter: squirrelShowGift,  leave: squirrelRest },
  tree:         { enter: treeCelebrate,     leave: treeRest },
  treeStar:     { enter: treeStarSpin,      leave: treeStarRest },
  cardinal:     { enter: cardinalFly,       leave: cardinalRest },
  rabbit:       { enter: rabbitHop,         leave: rabbitRest },
  sparrow:      { enter: sparrowFly,        leave: sparrowReturn },
  robin:        { enter: robinHop,          leave: robinRest },
  sack:         { enter: sackShake,         leave: sackRest },
};

function handleReactEnter(event) {
  const el = event.currentTarget;
  REACTIONS[el.dataset.react].enter(el);
  setCursorScale(1.7);
}

function handleReactLeave(event) {
  const el = event.currentTarget;
  REACTIONS[el.dataset.react].leave(el);
  setCursorScale(1);
}

/* =========================================================
   Palabras clave: cada una con su propio efecto
   ========================================================= */
const WORD_FX = {
  // "regalo": se sacude como un paquete y brilla
  shake(word) {
    word.style.color = COLORS.red;
    word.style.backgroundColor = COLORS.cream;
    word.style.boxShadow = `0 0 0 4px ${COLORS.cream}`;
    word.animate(SHAKE, { duration: 500 });
    const c = centerOf(word);
    emitBurst(c.x, c.y, 12, 5);
  },
  // "sonrisa": se curva hacia arriba como una sonrisa
  smile(word) {
    word.style.transform = 'translateY(-6px) rotate(-6deg) scale(1.18)';
    word.style.color = '#ffd27a';
    word.style.letterSpacing = '.06em';
    const c = centerOf(word);
    emitHearts(c.x, c.y - 10, 3);
  },
  // "21 de diciembre": da la vuelta como una hoja de calendario
  flip(word) {
    word.animate([{ transform: 'perspective(300px) rotateX(0)' }, { transform: 'perspective(300px) rotateX(360deg)' }], { duration: 700, easing: 'ease-out' });
    word.style.color = COLORS.gold;
  },
  // "riesgo de exclusión": queda abrazada por un fondo cálido
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
  const word = event.currentTarget;
  word.style.color = '';
  word.style.backgroundColor = '';
  word.style.boxShadow = '';
  word.style.transform = '';
  word.style.letterSpacing = '';
  setCursorScale(1);
}

/* =========================================================
   Pie: fecha, botón, logo y sello
   ========================================================= */
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

function rockLogo() {
  play('boat', $('#logoBoat'), [{ transform: 'rotate(-8deg)' }, { transform: 'rotate(8deg)' }], { duration: 700, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' });
  play('wave', $('#logoWave'), [{ transform: 'translateX(0)' }, { transform: 'translateX(-10px)' }], { duration: 700, iterations: Infinity, easing: 'linear' });
  setCursorScale(1.5);
}
function restLogo() {
  stop('boat');
  stop('wave');
  setCursorScale(1);
}

function stampSeal(event) {
  const seal = event.currentTarget;
  seal.style.transform = 'scale(.84) rotate(-14deg)';
  seal.style.filter = 'drop-shadow(0 1px 1px rgba(40,30,50,.4))';
  const c = centerOf(seal);
  emitBurst(c.x, c.y, 14, 6);
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
  const c = centerOf(badge);
  emitBurst(c.x, c.y, 14, 7);
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
  cta.style.boxShadow = '0 14px 30px rgba(30, 70, 45, .5), inset 0 2px 0 rgba(255,255,255,.25)';
  ctaState.targetScale = 1.1;
  setCursorScale(1.6);
}
function deactivateCta() {
  cta.textContent = cta.dataset.original;
  cta.style.background = '';
  cta.style.boxShadow = '';
  ctaState.targetScale = 1;
  setCursorScale(1);
}
// mousemove: el botón es magnético
function updateCta() {
  let tx = 0, ty = 0;
  if (mouse.inside) {
    const dx = mouse.x - ctaState.cx;
    const dy = mouse.y - ctaState.cy;
    if (Math.hypot(dx, dy) < 140) {
      tx = dx * 0.3;
      ty = dy * 0.3;
    }
  }
  ctaState.x = lerp(ctaState.x, tx, 0.15);
  ctaState.y = lerp(ctaState.y, ty, 0.15);
  ctaState.scale = lerp(ctaState.scale, ctaState.targetScale, 0.2);
  cta.style.transform = `translate(${ctaState.x.toFixed(1)}px, ${ctaState.y.toFixed(1)}px) scale(${ctaState.scale.toFixed(3)})`;
}

/* =========================================================
   Regalos con física (Matter.js)
   ========================================================= */
const hasPhysics = typeof window.Matter !== 'undefined';
let engine = null;

function createPhysics() {
  if (!hasPhysics) return;
  const { Engine, Bodies, Composite } = Matter;
  engine = Engine.create();
  const solid = { isStatic: true, friction: 0.4 };
  Composite.add(engine.world, [
    Bodies.rectangle(W / 2, GROUND_Y + 50, W * 3, 100, solid),
    Bodies.rectangle(546, 369, 662, 20, { ...solid, angle: -0.3906, friction: 0.05 }),   // tejado
    Bodies.rectangle(600, 756, 440, 16, solid),                                         // banco
    Bodies.rectangle(-50, 0, 100, H * 4, solid),
    Bodies.rectangle(W + 50, 0, 100, H * 4, solid),
  ]);
}

function createGift(x, y, w, h) {
  if (!hasPhysics) return null;
  if (gifts.length >= MAX_GIFTS) removeGift(gifts[0]);

  const style = pick(GIFT_STYLES);
  const el = document.createElement('div');
  el.className = `gift ${style.pat}`;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.setProperty('--c1', style.c1);
  el.style.setProperty('--c2', style.c2);
  el.style.setProperty('--rb', style.rb);
  el.innerHTML = `
    <div class="gift-word">${pick(GIFT_WORDS)}</div>
    <div class="gift-box"></div>
    <div class="gift-lid"><span class="bow"></span></div>`;
  giftLayer.appendChild(el);

  const body = Matter.Bodies.rectangle(x, y, w, h, {
    angle: rand(-0.5, 0.5),
    restitution: 0.3,
    friction: 0.3,
    frictionAir: 0.015,
    chamfer: { radius: 2 },
  });
  Matter.Composite.add(engine.world, body);

  const gift = {
    el, body, w, h,
    lid: el.querySelector('.gift-lid'),
    word: el.querySelector('.gift-word'),
    scale: 0.2,
    targetScale: 1,
    removed: false,
  };
  gift.timer = setTimeout(() => fadeOutGift(gift), GIFT_LIFETIME);

  el.addEventListener('mouseenter', openDomGift);
  el.addEventListener('mouseleave', closeDomGift);

  giftByElement.set(el, gift);
  gifts.push(gift);
  return gift;
}

function fadeOutGift(gift) {
  if (gift.removed) return;
  gift.el.style.opacity = '0';
  setTimeout(() => removeGift(gift), 800);
}

function removeGift(gift) {
  if (gift.removed) return;
  gift.removed = true;
  clearTimeout(gift.timer);
  Matter.Composite.remove(engine.world, gift.body);
  giftByElement.delete(gift.el);
  gift.el.remove();
  gifts = gifts.filter((g) => g !== gift);
}

function dropGiftFromSky(x) {
  createGift(clamp(x, 40, W - 40), -60, Math.round(rand(40, 66)), Math.round(rand(36, 56)));
}

function spillFromSack() {
  for (let i = 0; i < 5; i++) {
    const g = createGift(rand(730, 790), 880, Math.round(rand(34, 52)), Math.round(rand(30, 46)));
    if (g) Matter.Body.setVelocity(g.body, { x: rand(-9, -2), y: rand(-14, -8) });
  }
  emitBurst(764, 900, 24, 8);
}

// mousemove: el cursor empuja los regalos
function pushGifts() {
  if (!hasPhysics || !mouse.inside) return;
  if (Math.hypot(mouse.vx, mouse.vy) < 1.5) return;
  gifts.forEach((g) => {
    const b = g.body;
    const d = Math.hypot(b.position.x - mouse.x, b.position.y - mouse.y);
    const reach = Math.max(g.w, g.h) / 2 + 40;
    if (d < reach) {
      const f = 1 - d / reach;
      Matter.Body.setVelocity(b, {
        x: clamp(b.velocity.x + mouse.vx * 0.45 * f, -20, 20),
        y: clamp(b.velocity.y + mouse.vy * 0.45 * f - 2 * f, -20, 20),
      });
      Matter.Body.setAngularVelocity(b, clamp(b.angularVelocity + mouse.vx * 0.006 * f, -0.4, 0.4));
    }
  });
}

function updateGifts() {
  gifts.forEach((g) => {
    const b = g.body;
    if (b.position.y > H + 200) { fadeOutGift(g); return; }
    g.scale = lerp(g.scale, g.targetScale, 0.2);
    g.el.style.transform =
      `translate(${(b.position.x - g.w / 2).toFixed(1)}px, ${(b.position.y - g.h / 2).toFixed(1)}px) ` +
      `rotate(${b.angle.toFixed(3)}rad) scale(${g.scale.toFixed(3)})`;
  });
}

function openDomGift(event) {
  const gift = giftByElement.get(event.currentTarget);
  if (!gift) return;
  gift.targetScale = 1.15;
  gift.lid.style.transform = `translateY(-${Math.round(gift.h * 0.35)}px) rotate(-18deg)`;
  gift.word.style.opacity = '1';
  gift.word.style.transform = 'translate(-50%, -10px) scale(1)';
  gift.el.style.filter = 'drop-shadow(0 0 14px rgba(255, 210, 120, .95))';
  emitBurst(gift.body.position.x, gift.body.position.y - gift.h / 2, 14);
  setCursorScale(1.7);
  Matter.Body.setVelocity(gift.body, { x: gift.body.velocity.x, y: -3 });
}

function closeDomGift(event) {
  const gift = giftByElement.get(event.currentTarget);
  if (!gift) return;
  gift.targetScale = 1;
  gift.lid.style.transform = '';
  gift.word.style.opacity = '';
  gift.word.style.transform = '';
  gift.el.style.filter = '';
  setCursorScale(1);
}

/* =========================================================
   Nieve a dos profundidades (lejana y cercana)
   ========================================================= */
function createFlakes(count, minR, maxR, minS, maxS) {
  return Array.from({ length: count }, () => ({
    x: rand(0, W), y: rand(0, H),
    r: rand(minR, maxR),
    speed: rand(minS, maxS),
    drift: rand(0, Math.PI * 2),
    ox: 0, oy: 0,
  }));
}

const farFlakes = createFlakes(110, 0.6, 1.8, 0.3, 0.8);
const nearFlakes = createFlakes(28, 2.5, 6, 1.2, 2.4);

function drawSnow(ctx, flakes, repel, alpha) {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
  flakes.forEach((f) => {
    f.y += f.speed;
    f.drift += 0.012;
    f.x += Math.sin(f.drift) * 0.35 + wind.value * f.speed * 1.2;

    if (repel && mouse.inside) {
      const dx = f.x + f.ox - mouse.x;
      const dy = f.y + f.oy - mouse.y;
      const d = Math.hypot(dx, dy);
      if (d < repel && d > 0) {
        const force = (repel - d) / repel;
        f.ox += (dx / d) * force * 4;
        f.oy += (dy / d) * force * 4;
      }
    }
    f.ox *= 0.94;
    f.oy *= 0.94;

    if (f.y > H + 10) { f.y = -10; f.x = rand(0, W); }
    if (f.x > W + 10) f.x = -10;
    if (f.x < -10) f.x = W + 10;

    ctx.beginPath();
    ctx.arc(f.x + f.ox, f.y + f.oy, f.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

/* =========================================================
   Partículas
   ========================================================= */
const particles = [];
const SPARK_COLORS = ['#ffd27a', '#fff3c4', '#ff7a6a', '#ffffff'];

function addParticle(p) {
  particles.push({ rot: 0, vr: 0, gravity: 0.12, decay: 0.02, life: 1, delay: 0, ...p });
}

function emitBurst(x, y, count, power = 6) {
  for (let i = 0; i < count; i++) {
    const a = rand(0, Math.PI * 2);
    const s = rand(power * 0.3, power);
    addParticle({ type: 'star', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 2, size: rand(4, 9), vr: 0.08, decay: rand(0.015, 0.03), color: pick(SPARK_COLORS) });
  }
}

function emitNotes(x, y, count, color) {
  for (let i = 0; i < count; i++) {
    addParticle({ type: 'text', x: x + rand(-8, 8), y, vx: rand(-0.8, 0.8), vy: rand(-1.8, -1), gravity: -0.01, size: rand(16, 24), decay: 0.012, delay: i * 8, text: pick(['♪', '♫', '♬']), color });
  }
}

function emitText(x, y, text, color) {
  addParticle({ type: 'text', x, y, vx: 0, vy: -0.8, gravity: -0.005, size: 17, decay: 0.012, text, color, italic: true });
}

function emitHearts(x, y, count) {
  for (let i = 0; i < count; i++) {
    addParticle({ type: 'heart', x: x + rand(-10, 10), y, vx: rand(-0.6, 0.6), vy: rand(-1.6, -0.9), gravity: -0.008, size: rand(6, 10), decay: 0.012, delay: i * 10, color: '#ff5a64' });
  }
}

function emitDrops(x, y, count, color) {
  for (let i = 0; i < count; i++) {
    addParticle({ type: 'dot', x: x + rand(-3, 3), y, vx: rand(0.1, 1.2), vy: rand(0.5, 1.5), gravity: 0.25, size: rand(1.4, 2.6), decay: 0.035, color });
  }
}

function emitPuff(x, y, count) {
  for (let i = 0; i < count; i++) {
    addParticle({ type: 'dot', x: x + rand(-20, 20), y, vx: rand(-2, 2), vy: rand(-2.8, -0.6), gravity: 0.06, size: rand(3, 7), decay: 0.022, color: '#ffffff' });
  }
}

function emitSnowFall(x, y, count) {
  for (let i = 0; i < count; i++) {
    addParticle({ type: 'dot', x: x + rand(-40, 40), y: y + rand(-20, 20), vx: rand(-0.6, 0.6), vy: rand(0, 1), gravity: 0.08, size: rand(1.5, 4), decay: 0.012, color: '#ffffff' });
  }
}

function emitSeeds(x, y, count) {
  for (let i = 0; i < count; i++) {
    addParticle({ type: 'dot', x, y, vx: rand(0.5, 2), vy: rand(-1, 0.5), gravity: 0.2, size: rand(1.4, 2.2), decay: 0.02, color: pick(['#f2c35b', '#ffe9a8', '#c99a3a']) });
  }
}

function emitConfetti(x, y, count) {
  for (let i = 0; i < count; i++) {
    const a = rand(-Math.PI, 0);
    const s = rand(3, 9);
    addParticle({ type: 'confetti', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, gravity: 0.15, size: rand(3, 6), vr: rand(-0.3, 0.3), decay: 0.012, color: pick(['#c0262f', '#f2c35b', '#4f7fc2', '#3f8a5c', '#ffffff']) });
  }
}

// Hojas y agujas arrancadas por el viento
function emitLeaf() {
  const sources = [
    () => ({ x: rand(70, 230), y: rand(690, 930) }),     // árbol de Navidad
    () => ({ x: rand(-20, 280), y: rand(470, 600) }),    // pinos
    () => ({ x: rand(520, 600), y: rand(640, 690) }),    // acebo
  ];
  const s = pick(sources)();
  addParticle({
    type: 'leaf', x: s.x, y: s.y,
    vx: wind.value * 2 + rand(-0.5, 0.5), vy: rand(-0.6, 0.3), gravity: 0.015,
    size: rand(3, 5.5), vr: rand(-0.12, 0.12), decay: 0.005, flip: rand(0, 6),
    color: pick(['#3f8a5c', '#2a6142', '#8a6a3a', '#b07a3a', '#c0262f']),
  });
}

// Estelas de viento durante las ráfagas
function emitStreak() {
  addParticle({
    type: 'streak', x: rand(-60, W), y: rand(80, 1000),
    vx: wind.value * 16, vy: 0, gravity: 0, size: rand(40, 100), decay: 0.035, color: '#ffffff',
  });
}

// Nieve que el viento arranca del tejado
function emitRoofSnow() {
  const x = rand(300, 840);
  addParticle({
    type: 'dot', x, y: 447 - (x - 280) * 0.3785,
    vx: wind.value * 4 + rand(-0.5, 0.5), vy: rand(-1.6, -0.3), gravity: 0.03,
    size: rand(1, 2.4), decay: 0.014, color: '#ffffff',
  });
}

function emitSmoke(x, y, power = 1, delay = 0) {
  addParticle({ type: 'smoke', x: x + rand(-3, 3), y, vx: rand(-0.2, 0.2), vy: -rand(0.5, 0.9) * power, gravity: -0.002, size: rand(5, 8) * power, decay: 0.006, delay, color: '#cfc8d6' });
}

function drawStar(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * 0.15, -s * 0.15, s, 0);
  ctx.quadraticCurveTo(s * 0.15, s * 0.15, 0, s);
  ctx.quadraticCurveTo(-s * 0.15, s * 0.15, -s, 0);
  ctx.quadraticCurveTo(-s * 0.15, -s * 0.15, 0, -s);
  ctx.fill();
}

function drawHeart(ctx, s) {
  ctx.beginPath();
  ctx.moveTo(0, s * 0.9);
  ctx.bezierCurveTo(-s * 1.4, -s * 0.2, -s * 0.6, -s * 1.2, 0, -s * 0.4);
  ctx.bezierCurveTo(s * 0.6, -s * 1.2, s * 1.4, -s * 0.2, 0, s * 0.9);
  ctx.fill();
}

function updateParticles() {
  // humo continuo de la chimenea, empujado por el "viento" del ratón
  if (++fxState.smokeTick % 9 === 0) emitSmoke(641, 232);

  fxCtx.clearRect(0, 0, W, H);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (p.delay > 0) { p.delay--; continue; }

    if (p.type === 'smoke') p.x += wind.value * 1.3;
    if (p.type === 'leaf') {
      p.vx = lerp(p.vx, wind.value * 3.4, 0.04);
      p.vy += Math.sin(p.flip * 2) * 0.03;
      p.flip += 0.12;
    }
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity;
    p.vx *= 0.98;
    p.rot += p.vr;
    p.life -= p.decay;
    if (p.life <= 0) { particles.splice(i, 1); continue; }

    fxCtx.save();
    fxCtx.translate(p.x, p.y);
    fxCtx.rotate(p.rot);
    fxCtx.fillStyle = p.color;

    if (p.type === 'smoke') {
      const r = p.size * (2 - p.life);
      const g = fxCtx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, `rgba(215, 208, 222, ${0.35 * p.life})`);
      g.addColorStop(1, 'rgba(215, 208, 222, 0)');
      fxCtx.fillStyle = g;
      fxCtx.beginPath();
      fxCtx.arc(0, 0, r, 0, Math.PI * 2);
      fxCtx.fill();
    } else {
      fxCtx.globalAlpha = Math.min(1, p.life * 1.5);
      if (p.type === 'star') {
        drawStar(fxCtx, p.size * p.life);
      } else if (p.type === 'heart') {
        drawHeart(fxCtx, p.size);
      } else if (p.type === 'leaf') {
        fxCtx.scale(1, Math.cos(p.flip));
        fxCtx.beginPath();
        fxCtx.ellipse(0, 0, p.size, p.size * 0.42, 0, 0, Math.PI * 2);
        fxCtx.fill();
      } else if (p.type === 'streak') {
        fxCtx.globalAlpha = p.life * 0.28;
        fxCtx.strokeStyle = p.color;
        fxCtx.lineWidth = 1.2;
        fxCtx.beginPath();
        fxCtx.moveTo(0, 0);
        fxCtx.lineTo(-Math.sign(p.vx || 1) * p.size, 0);
        fxCtx.stroke();
      } else if (p.type === 'confetti') {
        fxCtx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else if (p.type === 'text') {
        fxCtx.font = `${p.italic ? 'italic ' : ''}800 ${p.size}px Fraunces, Georgia, serif`;
        fxCtx.textAlign = 'center';
        fxCtx.lineWidth = 4;
        fxCtx.strokeStyle = 'rgba(20, 14, 30, .55)';
        fxCtx.strokeText(p.text, Math.sin(p.life * 10) * 3, 0);
        fxCtx.fillText(p.text, Math.sin(p.life * 10) * 3, 0);
      } else {
        fxCtx.beginPath();
        fxCtx.arc(0, 0, p.size, 0, Math.PI * 2);
        fxCtx.fill();
      }
    }
    fxCtx.restore();
  }
}

/* =========================================================
   Cursor (copo de nieve con luz)
   ========================================================= */
function setCursorScale(s) {
  cursor.targetScale = s;
}

function updateCursor(time) {
  cursor.x = lerp(cursor.x, mouse.x, 0.35);
  cursor.y = lerp(cursor.y, mouse.y, 0.35);
  cursor.scale = lerp(cursor.scale, cursor.targetScale, 0.2);
  cursorEl.style.transform =
    `translate(${(cursor.x - 17).toFixed(1)}px, ${(cursor.y - 17).toFixed(1)}px) ` +
    `rotate(${((time / 20) % 360).toFixed(1)}deg) scale(${cursor.scale.toFixed(3)})`;
}

/* =========================================================
   Eventos generales del cartel
   ========================================================= */
function handlePosterMove(event) {
  const p = toPosterCoords(event.clientX, event.clientY);
  mouse.vx = p.x - mouse.x;
  mouse.vy = p.y - mouse.y;
  mouse.x = p.x;
  mouse.y = p.y;
  mouse.nx = (p.x / W) * 2 - 1;
  mouse.ny = (p.y / H) * 2 - 1;

  if (!mouse.inside) {
    mouse.inside = true;
    cursor.x = p.x;
    cursor.y = p.y;
    cursorEl.style.opacity = '1';
    cursorLight.style.opacity = '1';
  }

  if (Math.hypot(mouse.vx, mouse.vy) > 6 && Math.random() < 0.6) {
    addParticle({ type: 'star', x: p.x, y: p.y, vx: rand(-0.6, 0.6), vy: rand(-0.6, 0.6), gravity: 0.02, size: rand(3, 6), decay: 0.04, color: pick(SPARK_COLORS) });
  }
}

function handlePosterLeave() {
  mouse.inside = false;
  mouse.nx = 0;
  mouse.ny = 0;
  mouse.vx = 0;
  mouse.vy = 0;
  cursorEl.style.opacity = '0';
  cursorLight.style.opacity = '0';
}

function handlePosterClick(event) {
  const p = toPosterCoords(event.clientX, event.clientY);
  if (event.target.closest('.cta')) {
    emitBurst(p.x, p.y, 40, 10);
    emitHearts(p.x, p.y - 20, 6);
    return;
  }
  if (event.target.closest('[data-react="sack"]')) {
    spillFromSack();
    return;
  }
  dropGiftFromSky(p.x);
  emitBurst(p.x, p.y, 8, 4);
}

/* =========================================================
   Bucle de animación
   ========================================================= */
function animate(time) {
  if (hasPhysics) {
    pushGifts();
    Matter.Engine.update(engine, 1000 / 60);
  }
  mouse.vx *= 0.8;
  mouse.vy *= 0.8;

  updateWind(time);
  updateWindEffects(time);
  updateDeer();
  updateFox();
  updateWorld();
  updateLighting();
  updatePupils();
  updateLetters();
  updateStars(time);
  updateLights(treeLights, time, fxState.treeChase);
  updateLights(eaveLights, time, fxState.eaveChase);
  updateGifts();
  updateBadge();
  updateCta();
  drawSnow(snowFarCtx, farFlakes, 0, 0.7);
  drawSnow(snowNearCtx, nearFlakes, 120, 0.85);
  updateParticles();
  updateCursor(time);

  requestAnimationFrame(animate);
}

/* =========================================================
   Inicialización
   ========================================================= */
function init() {
  setupPlanes();
  splitHeadline();
  createStars(80);
  createTreeLights();
  createEaveLights();
  createGrass();
  createPhysics();
  setupBlinks();
  fitPoster();

  // elementos que mueve el viento
  pineSways = $$('.sway');
  ornaments = $$('#ornaments .orn');
  hollyUses = $$('#hollyLeaves use');
  hollyUses.forEach((h) => { h.style.transformOrigin = '560px 704px'; });

  const captureMode = new URLSearchParams(location.search).has('captura');
  if (captureMode) {
    document.documentElement.classList.add('no-intro');
    for (let i = 0; i < 120; i++) updateParticles();     // humo ya formado
    updateLighting();
    updateWindEffects(0);
    updateStars(0);
    updateLights(treeLights, 0, 0);
    updateLights(eaveLights, 0, 0);
    drawSnow(snowFarCtx, farFlakes, 0, 0.7);
    drawSnow(snowNearCtx, nearFlakes, 0, 0.85);
  } else {
    // vida propia de la escena
    later('deer', deerNextAction, 1500);
    later('fox', foxStart, 4000);
    later('rabbit', rabbitWander, 3000);
    later('groundBirds', groundBirdsLife, 2000);
    later('smallLife', smallCreaturesLife, 2500);
    later('blink', blinkSomeone, 1000);
    later('flock', flyFlock, 6000);
    later('shoot', shootStar, 2500);
    if (hasPhysics) [720, 640, 790].forEach((x, i) => setTimeout(() => dropGiftFromSky(x), 1800 + i * 450));
  }

  window.addEventListener('resize', fitPoster);
  if (document.fonts) document.fonts.ready.then(measureLayout);

  poster.addEventListener('mousemove', handlePosterMove);
  poster.addEventListener('mouseleave', handlePosterLeave);
  poster.addEventListener('click', handlePosterClick);

  $$('[data-react]').forEach((el) => {
    el.addEventListener('mouseenter', handleReactEnter);
    el.addEventListener('mouseleave', handleReactLeave);
  });

  $$('.kw[data-fx]').forEach((word) => {
    word.addEventListener('mouseenter', handleWordEnter);
    word.addEventListener('mouseleave', handleWordLeave);
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

  cta.addEventListener('mouseenter', activateCta);
  cta.addEventListener('mouseleave', deactivateCta);

  requestAnimationFrame(animate);
}

init();
