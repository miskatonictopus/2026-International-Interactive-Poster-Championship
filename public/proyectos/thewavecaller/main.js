'use strict';

/* ==========================================================================
   THE INTERACTIVE POSTER · Que ningún niño se quede sin regalo · Fundación ITACA
   --------------------------------------------------------------------------
   El cartel tiene dos caras:
   · En la web, la pila de regalos empieza vacía: solo hay huecos punteados.
   · El estado final, con todos los regalos en su sitio, es el cartel impreso.

   Las tres interacciones:

   1. mouseenter · Al entrar en un hueco vacío, su regalo cae desde arriba y
      encaja con un rebote. Si el regalo ya está, se levanta un poco y se ladea.
   2. mouseleave · Al salir, el regalo vuelve a reposar en su sitio.
   3. mousemove  · El cursor es como una luz sobre un cartel con oro estampado:
      un brillo recorre el dorado de «se quede sin», el medallón de la fecha se
      inclina apenas y su anillo punteado gira despacio. La nieve se mueve en
      tres profundidades. Todo se suaviza fotograma a fotograma.

   Con la pila completa, cada regalo se abre con un clic: suelta confeti,
   estrellas, caramelos, bastones y bolas de árbol. Cuando están todos abiertos,
   los huecos vuelven a estar vacíos y la pila se puede llenar otra vez.

   Además, «REGALO» se cubre de purpurina al pasar el ratón (mouseenter /
   mouseleave) y suelta chispas mientras el cursor se mueve por encima.

   Atajos: F completa la pila · R la vacía · index.html?final abre el estado final.
   Al imprimir (Ctrl+P) se completa la pila y sale el cartel final en A3.
   ========================================================================== */

/* --------------------------------------------------------------------------
   Configuración
   -------------------------------------------------------------------------- */
const W = 848;
const H = 1200;
const FLOOR_Y = 990;                // la línea dorada sobre la que reposa la pila
const DROP_TIME = 750;              // ms que tarda un regalo en caer

// Papeles de regalo: color de la caja, cinta (con su tono de sombra) y estampado.
const GIFT_STYLES = {
  burgundy: { base: '#8b2236', ribbon: '#e3c690', shade: '#b8935e', pattern: 'pat-dots' },
  sage:     { base: '#86a98f', ribbon: '#e0473b', shade: '#a82a2e', pattern: 'pat-sprig' },
  pine:     { base: '#2f5a46', ribbon: '#e3c690', shade: '#b8935e', pattern: 'pat-snow' },
  coral:    { base: '#e0574a', ribbon: '#f3e9d6', shade: '#cdbfa5' },
  candy:    { base: '#f3e9d6', ribbon: '#2f5a46', shade: '#1f4033', pattern: 'pat-stripes' },
  kraft:    { base: '#c9a77c', ribbon: '#e0473b', shade: '#a82a2e' },
  berry:    { base: '#a8325a', ribbon: '#e3c690', shade: '#b8935e', pattern: 'pat-stars' },
};

// La pila, compuesta a mano para que el cartel impreso quede equilibrado.
// Cada regalo: [x izquierda, y de la base, ancho, alto, giro en grados, papel, extras]
// Extras: «cross» lleva cinta en cruz y el lazo delante; «tag» lleva etiqueta; «off» descentra la cinta.
const PILE = [
  // Fila de abajo, sobre el suelo
  [78, 990, 96, 74, -2, 'burgundy', 'cross'],
  [178, 990, 80, 92, 1, 'candy', 'cross'],
  [262, 990, 112, 70, 0, 'pine', 'cross tag'],
  [378, 990, 86, 86, -1, 'kraft', 'cross'],
  [468, 990, 104, 66, 2, 'sage', 'cross off'],
  [576, 990, 80, 96, 0, 'berry', 'cross'],
  [660, 990, 108, 72, -2, 'coral', 'cross tag'],
  // Segunda fila
  [104, 916, 88, 62, -5, 'sage', ''],
  [196, 898, 70, 56, 3, 'coral', ''],
  [282, 920, 82, 68, 2, 'berry', 'off'],
  [404, 904, 98, 76, -2, 'candy', 'cross'],
  [596, 894, 94, 62, 4, 'pine', 'tag'],
  [702, 918, 64, 70, -3, 'burgundy', ''],
  // Tercera fila
  [136, 854, 70, 58, 5, 'kraft', ''],
  [300, 852, 96, 70, -3, 'sage', 'cross'],
  [432, 828, 72, 84, 2, 'burgundy', 'tag'],
  [612, 832, 80, 62, -4, 'candy', ''],
  // Cima
  [322, 782, 66, 54, 6, 'pine', ''],
];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* --------------------------------------------------------------------------
   Elementos del DOM
   -------------------------------------------------------------------------- */
const stage = document.getElementById('stage');
const poster = document.getElementById('poster');
const snowCanvas = document.getElementById('snow');
const snowCtx = snowCanvas.getContext('2d');
const pile = document.getElementById('pile');
const titleScript = document.getElementById('title-script');
const titleBig = document.getElementById('title-big');
const sparkles = document.getElementById('sparkles');
const badge = document.getElementById('badge');
const badgePath = document.getElementById('badge-path');
const badgeRing = document.getElementById('badge-ring');
const countEl = document.getElementById('count');
const hintText = document.getElementById('hint-text');
const burstCanvas = document.getElementById('burst');
const burstCtx = burstCanvas.getContext('2d');
const totalEl = document.getElementById('total');

/* --------------------------------------------------------------------------
   Estado
   -------------------------------------------------------------------------- */
const state = {
  slots: [],          // { slot, gift, filled, opening, liftTimer }
  final: false,
  mode: 'fill',       // 'fill': se llena pasando el cursor · 'open': se abren con clic · 'wait': pausa entre los dos
  opened: 0,
  modeTimer: null,
  mouse: { x: W / 2, y: H / 2 },
  parallax: { x: 0, y: 0 },  // desplazamiento suavizado de la nieve
  light: { x: 0, y: 0 },     // posición suavizada de la «luz» (de -1 a 1 en cada eje)
};

/* --------------------------------------------------------------------------
   Utilidades
   -------------------------------------------------------------------------- */
const random = (min, max) => min + Math.random() * (max - min);

// Pasa las coordenadas del ratón (pantalla) a coordenadas del cartel (848 × 1200).
function toPosterCoords(event) {
  const rect = poster.getBoundingClientRect();
  const scale = rect.width / W;
  return {
    x: (event.clientX - rect.left) / scale,
    y: (event.clientY - rect.top) / scale,
  };
}

/* --------------------------------------------------------------------------
   Escalado: el cartel mide siempre 848 × 1200 y se escala entero.
   -------------------------------------------------------------------------- */
function fitPoster() {
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H);
  stage.style.width = `${W * scale}px`;
  stage.style.height = `${H * scale}px`;
  poster.style.transform = `scale(${scale})`;
}

/* --------------------------------------------------------------------------
   Medallón de la fecha: un círculo con el borde festoneado
   -------------------------------------------------------------------------- */
function buildBadge() {
  const bumps = 30;
  const radius = 92;
  const depth = 5;
  let d = '';
  for (let i = 0; i <= bumps * 8; i++) {
    const angle = (i / (bumps * 8)) * Math.PI * 2;
    const r = radius - depth + depth * Math.abs(Math.cos((angle * bumps) / 2));
    d += `${i ? 'L' : 'M'} ${(Math.cos(angle) * r).toFixed(2)} ${(Math.sin(angle) * r).toFixed(2)} `;
  }
  badgePath.setAttribute('d', `${d}Z`);
}

/* --------------------------------------------------------------------------
   Ramas de acebo ilustradas, en estilo plano
   -------------------------------------------------------------------------- */
const GREENERY = {
  dark: '#2a5e45',
  mid: '#3b7a56',
  light: '#5c9b72',
  vein: '#a3cdaa',
  stem: '#6b4a2f',
  red: '#c8322b',
  redDark: '#8f1f22',
  white: '#f3e9d6',
};

// Hoja de acebo de 60 px de largo, apuntando a la derecha, en dos tonos con nervio.
function hollyLeaf(x, y, angle, length = 60) {
  const top = 'M0 0 Q 2 -11 11 -18 Q 18 -10 27 -21 Q 33 -11 43 -17 Q 47 -7 60 0';
  const bottom = 'Q 47 7 43 17 Q 33 11 27 21 Q 18 10 11 18 Q 2 11 0 0 Z';
  return `
    <g transform="translate(${x} ${y}) rotate(${angle}) scale(${length / 60})">
      <path d="${top} ${bottom}" fill="${GREENERY.mid}"/>
      <path d="M0 0 L60 0 ${bottom}" fill="${GREENERY.dark}"/>
      <path d="M3 0 Q 30 -1.5 55 0" fill="none" stroke="${GREENERY.vein}" stroke-width="1.6" stroke-linecap="round"/>
    </g>`;
}

// Baya roja con sombra y brillo.
function berry(x, y, r, color = GREENERY.red, shade = GREENERY.redDark) {
  return `
    <circle cx="${x}" cy="${y}" r="${r}" fill="${shade}"/>
    <circle cx="${x - r * 0.12}" cy="${y - r * 0.12}" r="${r * 0.86}" fill="${color}"/>
    <circle cx="${x - r * 0.38}" cy="${y - r * 0.38}" r="${r * 0.22}" fill="#fff" opacity="0.6"/>`;
}

function hollySprig(x, y, scale, rotation) {
  return `
    <g transform="translate(${x} ${y}) rotate(${rotation}) scale(${scale})">
      ${hollyLeaf(0, 0, -150)}
      ${hollyLeaf(0, 0, -30)}
      ${berry(-8, -2, 9.5)}
      ${berry(9, -4, 9.5)}
      ${berry(0, 11, 9.5)}
    </g>`;
}

function buildGreenery() {
  document.getElementById('greenery').innerHTML =
    hollySprig(86, 600, 0.9, -12) +
    hollySprig(764, 626, 0.9, 14) +
    hollySprig(530, 96, 0.75, 8);
}

/* --------------------------------------------------------------------------
   La pila: un hueco por regalo
   -------------------------------------------------------------------------- */

// Distancia que tiene que caer un regalo para empezar fuera del cartel, por arriba.
function dropDistance(bottom) {
  return bottom + 160;
}

// Lazo: dos lazadas con su pliegue interior, el nudo y las dos cintas que cuelgan.
function bowSVG(s, { ribbon, shade }) {
  const n = (v) => (v * s).toFixed(1);
  const loop = `M0 0 C ${n(-0.3)} ${n(-0.95)} ${n(-1.3)} ${n(-1)} ${n(-1.25)} ${n(-0.28)} C ${n(-1.2)} ${n(0.25)} ${n(-0.45)} ${n(0.2)} 0 0 Z`;
  const fold = `M0 0 C ${n(-0.25)} ${n(-0.55)} ${n(-0.85)} ${n(-0.62)} ${n(-0.9)} ${n(-0.25)} C ${n(-0.62)} ${n(-0.1)} ${n(-0.3)} 0 0 0 Z`;
  const tail = `M${n(-0.08)} ${n(0.1)} L${n(-0.6)} ${n(1.05)} L${n(-0.36)} ${n(0.96)} L${n(-0.26)} ${n(1.18)} L${n(0.14)} ${n(0.16)} Z`;
  return `
    <path d="${tail}" fill="${shade}"/>
    <path d="${tail}" fill="${shade}" transform="scale(-1 1) rotate(-8)"/>
    <path d="${loop}" fill="${ribbon}"/>
    <path d="${fold}" fill="${shade}"/>
    <g transform="scale(-1 1)">
      <path d="${loop}" fill="${ribbon}"/>
      <path d="${fold}" fill="${shade}"/>
    </g>
    <rect x="${n(-0.2)}" y="${n(-0.24)}" width="${n(0.4)}" height="${n(0.46)}" rx="${n(0.12)}" fill="${shade}"/>`;
}

// Etiqueta de regalo de papel kraft, colgada del lazo con un cordel.
function tagSVG(fromX, fromY, x, y, base) {
  const paper = base === GIFT_STYLES.kraft.base ? '#f3e9d6' : '#d8bb8f';
  return `
    <path d="M ${fromX} ${fromY} Q ${(fromX + x) / 2} ${y - 4} ${x} ${y}" fill="none" stroke="#f3e9d6" stroke-width="1.2"/>
    <g transform="translate(${x} ${y}) rotate(-16)">
      <path d="M -9 4 L 0 -3 L 9 4 L 9 24 L -9 24 Z" fill="${paper}"/>
      <path d="M -6 6 L 0 1 L 6 6 L 6 21 L -6 21 Z" fill="none" stroke="#8a6a44" stroke-width="0.8"/>
      <circle cx="0" cy="3" r="1.8" fill="#1d2a38" opacity="0.55"/>
    </g>`;
}

// Un regalo ilustrado: tapa que sobresale, caja, papel estampado, sombras, cinta y lazo.
function giftSVG(w, h, style, extras) {
  const lidH = Math.round(Math.max(13, h * 0.24));
  const ribbonX = w * (extras.includes('off') ? 0.34 : 0.5);
  const rw = Math.max(8, Math.round(w * 0.13));
  const cross = extras.includes('cross');
  const crossY = lidH + (h - lidH) * 0.52;
  const bowSize = Math.min(Math.max(w * 0.24, 13), 22);
  const bowY = cross ? crossY : 2;
  const pattern = (x, y, width, height) => (style.pattern
    ? `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#${style.pattern})"/>`
    : '');

  let svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`;

  // Caja
  svg += `<rect x="0" y="${lidH}" width="${w}" height="${h - lidH}" fill="${style.base}"/>`;
  svg += pattern(0, lidH, w, h - lidH);
  svg += `<rect x="${w * 0.8}" y="${lidH}" width="${w * 0.2}" height="${h - lidH}" fill="#000" opacity="0.14"/>`;

  // Cintas sobre la caja
  svg += `<rect x="${ribbonX - rw / 2}" y="${lidH}" width="${rw}" height="${h - lidH}" fill="${style.ribbon}"/>`;
  svg += `<rect x="${ribbonX + rw / 2 - 2}" y="${lidH}" width="2" height="${h - lidH}" fill="${style.shade}"/>`;
  if (cross) {
    svg += `<rect x="0" y="${crossY - rw / 2}" width="${w}" height="${rw}" fill="${style.ribbon}"/>`;
    svg += `<rect x="0" y="${crossY + rw / 2 - 2}" width="${w}" height="2" fill="${style.shade}"/>`;
  }

  // Sombra bajo la tapa y tapa, un poco más ancha que la caja
  svg += `<rect x="0" y="${lidH}" width="${w}" height="4" fill="#000" opacity="0.22"/>`;
  // La tapa va en su propio grupo para poder salir volando al abrir el regalo.
  // Si el lazo va delante (cinta en cruz) se queda en la caja; si no, se va con la tapa.
  let front = '';
  svg += '<g class="lid">';
  svg += `<rect x="-4" y="0" width="${w + 8}" height="${lidH}" rx="2" fill="${style.base}"/>`;
  svg += pattern(-4, 0, w + 8, lidH);
  svg += `<rect x="${(w + 8) * 0.8 - 4}" y="0" width="${(w + 8) * 0.2}" height="${lidH}" fill="#000" opacity="0.14"/>`;
  svg += `<rect x="-4" y="0" width="${w + 8}" height="2.5" rx="1" fill="#fff" opacity="0.18"/>`;
  svg += `<rect x="${ribbonX - rw / 2}" y="0" width="${rw}" height="${lidH}" fill="${style.ribbon}"/>`;

  // Lazo: delante, en el cruce de cintas, o encima de la tapa
  let bow = `<g transform="translate(${ribbonX} ${bowY})">${bowSVG(bowSize, style)}</g>`;

  if (extras.includes('tag')) {
    // La etiqueta queda siempre dentro de la caja, sin pasar del suelo.
    const tagY = Math.min(bowY + bowSize * 0.9, h - 27);
    bow += tagSVG(ribbonX + 3, bowY + 3, Math.min(w - 12, ribbonX + w * 0.32), tagY, style.base);
  }

  if (cross) front = bow;
  else svg += bow;
  svg += '</g>';

  return `${svg}${front}</svg>`;
}

function buildPile() {
  PILE.forEach(([x, bottom, w, h, rotation, styleName, extras], index) => {
    const style = GIFT_STYLES[styleName];

    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.tabIndex = 0;
    slot.setAttribute('aria-label', `Regalo ${index + 1}`);
    slot.style.left = `${x}px`;
    slot.style.top = `${bottom - h}px`;
    slot.style.width = `${w}px`;
    slot.style.height = `${h}px`;
    slot.style.transform = `rotate(${rotation}deg)`;

    const gift = document.createElement('div');
    gift.className = 'gift';
    gift.innerHTML = giftSVG(w, h, style, extras);
    gift.style.transform = `translateY(${-dropDistance(bottom)}px)`;
    slot.append(gift);

    const item = { slot, gift, x, bottom, w, h, filled: false, opening: false, liftTimer: null };
    state.slots.push(item);
    pile.append(slot);

    slot.addEventListener('mouseenter', () => handleSlotEnter(item));
    slot.addEventListener('mouseleave', () => handleSlotLeave(item));
    // Con teclado (Tab) funciona igual que con el ratón.
    slot.addEventListener('focus', () => handleSlotEnter(item));
    slot.addEventListener('blur', () => handleSlotLeave(item));
    // Con la pila completa, clic (o Intro / espacio) abre el regalo.
    slot.addEventListener('click', () => openGift(item));
    slot.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openGift(item);
      }
    });
  });

  totalEl.textContent = PILE.length;
}

// Deja caer el regalo en su hueco.
function fillSlot(item, instant = false) {
  if (item.filled) return;
  item.filled = true;
  item.slot.classList.add('is-filled');
  item.gift.style.transition = instant || reduceMotion
    ? 'none'
    : `transform ${DROP_TIME}ms cubic-bezier(0.34, 1.45, 0.55, 1)`;
  item.gift.style.transform = 'none';
  updateCount();
}

function emptySlot(item) {
  item.filled = false;
  item.slot.classList.remove('is-filled');
  item.gift.style.transition = 'none';
  item.gift.style.transform = `translateY(${-dropDistance(item.bottom)}px)`;
}

function updateCount() {
  if (state.mode !== 'fill') return;
  const filled = state.slots.filter((item) => item.filled).length;
  countEl.textContent = filled;
  if (filled === state.slots.length) showFinal();
}

// Estado final: la pila completa y sin pista de uso. Es el cartel que se imprime.
// Poco después, en la web, la pista vuelve para invitar a abrir los regalos.
function showFinal() {
  state.final = true;
  state.mode = 'wait';
  poster.classList.add('is-final');
  clearTimeout(state.modeTimer);
  state.modeTimer = setTimeout(startOpening, 1600);
}

function startOpening() {
  state.mode = 'open';
  state.opened = 0;
  hintText.textContent = 'Haz clic en un regalo para abrirlo';
  countEl.textContent = 0;
  poster.classList.add('is-opening');
}

// Con todos abiertos, la pila vuelve a estar vacía y se puede llenar otra vez.
function startRefill() {
  state.mode = 'wait';
  clearTimeout(state.modeTimer);
  state.modeTimer = setTimeout(() => {
    state.mode = 'fill';
    state.final = false;
    poster.classList.remove('is-final', 'is-opening');
    hintText.textContent = 'Pasa el cursor para volver a llenar la pila';
    countEl.textContent = 0;
  }, 900);
}

/* --------------------------------------------------------------------------
   Abrir un regalo: tiembla, la tapa sale volando, la caja se aplasta y se
   desvanece, y del hueco salen confeti, estrellas, caramelos y bolas de árbol.
   -------------------------------------------------------------------------- */
function openGift(item) {
  if (state.mode !== 'open' || !item.filled || item.opening) return;
  item.opening = true;
  clearTimeout(item.liftTimer);
  item.gift.style.transition = 'none';
  item.gift.style.transform = 'none';

  const lid = item.gift.querySelector('.lid');
  const finish = () => {
    item.gift.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    item.opening = false;
    emptySlot(item);
    state.opened += 1;
    countEl.textContent = state.opened;
    if (state.opened === state.slots.length) startRefill();
  };

  if (reduceMotion) {
    item.gift.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).onfinish = finish;
    return;
  }

  // 1 · Tiembla, como si algo empujara desde dentro
  item.gift.animate([
    { transform: 'rotate(0deg)' },
    { transform: 'rotate(-4deg) translateY(-2px)' },
    { transform: 'rotate(4deg)' },
    { transform: 'rotate(-3deg) translateY(-3px)' },
    { transform: 'rotate(3deg)' },
    { transform: 'rotate(0deg)' },
  ], { duration: 300, easing: 'ease-in-out' }).onfinish = () => {
    // 2 · Explota: la tapa sale despedida y la caja se aplasta y desaparece
    const side = Math.random() < 0.5 ? -1 : 1;
    if (lid) {
      lid.animate([
        { transform: 'none', opacity: 1 },
        { transform: `translate(${side * random(30, 60)}px, -120px) rotate(${side * random(40, 80)}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${side * random(70, 110)}px, -80px) rotate(${side * random(120, 180)}deg)`, opacity: 0 },
      ], { duration: 750, easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)', fill: 'forwards' });
    }
    item.gift.animate([
      { transform: 'none', opacity: 1 },
      { transform: 'scale(1.12, 0.82)', opacity: 1, offset: 0.2 },
      { transform: 'scale(0.96, 1.04)', opacity: 1, offset: 0.45 },
      { transform: 'scale(0.9, 0.9)', opacity: 0 },
    ], { duration: 750, easing: 'ease-out', fill: 'forwards' }).onfinish = finish;

    burst(item.x + item.w / 2, item.bottom - item.h);
  };
}

// --- Partículas, dibujadas en un canvas por delante de la nieve
const CONFETTI_COLORS = ['#d4ad5a', '#ecd28d', '#c8322b', '#e0473b', '#f3e9d6', '#2f5a46', '#86a98f', '#a8325a'];
const CANDY_COLORS = ['#c8322b', '#2f5a46', '#d4ad5a', '#a8325a'];
const BAUBLE_COLORS = ['#c8322b', '#2f5a46', '#d4ad5a', '#8b2236'];
const PARTICLE_KINDS = [
  ['confetti', 26], ['star', 7], ['candy', 5], ['cane', 3], ['bauble', 4],
];
const particles = [];
const rings = [];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function burst(x, y) {
  rings.push({ x, y, r: 10, life: 1 });
  PARTICLE_KINDS.forEach(([kind, count]) => {
    for (let i = 0; i < count; i++) {
      const angle = random(-Math.PI * 0.92, -Math.PI * 0.08);   // abanico hacia arriba
      const speed = random(5, 12) * (kind === 'confetti' ? 1 : 0.85);
      particles.push({
        kind,
        x: x + random(-10, 10),
        y: y + random(-4, 8),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: random(0, Math.PI * 2),
        spin: random(-0.25, 0.25),
        flip: random(0, Math.PI * 2),
        size: kind === 'confetti' ? random(5, 9) : random(7, 11),
        color: kind === 'confetti' ? pick(CONFETTI_COLORS) : kind === 'bauble' ? pick(BAUBLE_COLORS) : pick(CANDY_COLORS),
        restY: random(992, 1003),    // se queda en la franja de nieve al pie de la pila, sin tapar la pista ni el sello
        landed: 0,                   // ms que lleva en el suelo
        alpha: 1,
      });
    }
  });
}

function starPath(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}

function drawParticle(ctx, p) {
  const s = p.size;
  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);

  if (p.kind === 'confetti') {
    // Tira de papel que da vueltas: se estrecha al girar
    ctx.scale(1, p.landed ? 0.5 : Math.cos(p.flip));
    ctx.fillStyle = p.color;
    ctx.fillRect(-s / 2, -s / 4, s, s / 2);
  } else if (p.kind === 'star') {
    starPath(ctx, s * 0.75);
    ctx.fillStyle = '#ecd28d';
    ctx.fill();
    starPath(ctx, s * 0.4);
    ctx.fillStyle = '#fff3c9';
    ctx.fill();
  } else if (p.kind === 'candy') {
    // Caramelo envuelto: bola con dos lazos de papel
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.moveTo(-s * 0.4, 0); ctx.lineTo(-s * 0.95, -s * 0.38); ctx.lineTo(-s * 0.95, s * 0.38); ctx.closePath();
    ctx.moveTo(s * 0.4, 0); ctx.lineTo(s * 0.95, -s * 0.38); ctx.lineTo(s * 0.95, s * 0.38); ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.48, s * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f3e9d6';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-s * 0.2, -s * 0.34); ctx.lineTo(s * 0.05, s * 0.36);
    ctx.moveTo(s * 0.12, -s * 0.36); ctx.lineTo(s * 0.32, s * 0.2);
    ctx.stroke();
  } else if (p.kind === 'cane') {
    // Bastón de caramelo: crema con franjas rojas
    const cane = new Path2D(`M 0 ${s} L 0 ${-s * 0.4} A ${s * 0.38} ${s * 0.38} 0 0 1 ${s * 0.76} ${-s * 0.4}`);
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = '#f3e9d6';
    ctx.stroke(cane);
    ctx.setLineDash([2.4, 2.4]);
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#c8322b';
    ctx.stroke(cane);
    ctx.setLineDash([]);
  } else if (p.kind === 'bauble') {
    // Bola de árbol con su enganche dorado y un brillo
    ctx.fillStyle = '#d4ad5a';
    ctx.fillRect(-s * 0.18, -s * 0.72, s * 0.36, s * 0.22);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgb(255 255 255 / 0.55)';
    ctx.beginPath();
    ctx.arc(-s * 0.2, -s * 0.18, s * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

let lastBurstTime = 0;
let burstWasActive = false;
function drawBursts(time) {
  const dt = Math.min(2.5, lastBurstTime ? (time - lastBurstTime) / 16.67 : 1);   // en fotogramas de 60 Hz
  lastBurstTime = time;
  const active = particles.length > 0 || rings.length > 0;
  if (!active && !burstWasActive) return;
  burstWasActive = active;

  const ctx = burstCtx;
  ctx.setTransform(burstCanvas.width / W, 0, 0, burstCanvas.height / H, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Aro dorado punteado, como el del medallón, que se abre y se apaga
  for (let i = rings.length - 1; i >= 0; i--) {
    const ring = rings[i];
    ring.r += (90 - ring.r) * 0.12 * dt;
    ring.life -= 0.035 * dt;
    if (ring.life <= 0) { rings.splice(i, 1); continue; }
    ctx.save();
    ctx.globalAlpha = ring.life;
    ctx.strokeStyle = '#ecd28d';
    ctx.lineWidth = 2;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (!p.landed) {
      const drag = p.kind === 'confetti' ? 0.965 : 0.985;   // el confeti planea
      p.vx *= Math.pow(drag, dt);
      p.vy = p.vy * Math.pow(drag, dt) + (p.kind === 'confetti' ? 0.2 : 0.32) * dt;
      if (p.kind === 'confetti') p.vx += Math.sin(time / 180 + p.flip) * 0.06 * dt;   // vaivén
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.flip += 0.18 * dt;
      if (p.vy > 0 && p.y >= p.restY) {
        p.y = p.restY;
        p.landed = 1;
      }
    } else {
      // Se queda un rato sobre la nieve y luego se desvanece
      p.landed += 16.67 * dt;
      if (p.landed > 2600) p.alpha -= 0.02 * dt;
    }
    if (p.alpha <= 0 || p.x < -40 || p.x > W + 40) {
      particles.splice(i, 1);
      continue;
    }
    drawParticle(ctx, p);
  }
}

/* --------------------------------------------------------------------------
   Interacciones 1 y 2 · mouseenter / mouseleave en los huecos de la pila
   -------------------------------------------------------------------------- */
function handleSlotEnter(item) {
  if (!item.filled) {
    if (state.mode === 'fill') fillSlot(item);
    return;
  }
  if (item.opening) return;

  // El regalo ya está: se levanta un poco y se ladea, como si alguien lo cogiera.
  clearTimeout(item.liftTimer);
  const tilt = random(-6, 6).toFixed(1);
  item.gift.style.transition = 'transform 0.25s ease-out';
  item.gift.style.transform = `translateY(-12px) rotate(${tilt}deg) scale(1.06)`;
}

function handleSlotLeave(item) {
  if (!item.filled || item.opening) return;

  // Si acaba de caer, se espera a que termine la caída antes de recolocarlo.
  item.liftTimer = setTimeout(() => {
    item.gift.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.45, 0.55, 1)';
    item.gift.style.transform = 'none';
  }, item.gift.style.transition.includes(`${DROP_TIME}ms`) ? DROP_TIME : 0);
}

/* --------------------------------------------------------------------------
   Interacción 3 · mousemove sobre el cartel
   -------------------------------------------------------------------------- */
// mousemove solo guarda dónde está el cursor; el bucle de animación lo sigue con suavidad.
function handlePosterMove(event) {
  state.mouse = toPosterCoords(event);
}

// Al salir del cartel, la luz vuelve despacio al centro.
function handlePosterLeave() {
  state.mouse = { x: W / 2, y: H / 2 };
}

/* --------------------------------------------------------------------------
   Purpurina en «REGALO»: al entrar barre un destello y aparece la purpurina bajo
   un foco que sigue al cursor; mientras se mueve, titilan chispas sobre las letras.
   -------------------------------------------------------------------------- */
const GLITTER_COLORS = ['#fff3c9', '#ffe08a', '#f2c14e', '#d4ad5a'];
const SPARKLE_COLORS = ['#fff8e6', '#ffe9a8', '#f2c14e'];

// Textura de purpurina: rojo algo más hondo con motas finas casi todas doradas.
function buildGlitter() {
  const size = 180;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#b8302a';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1400; i++) {
    ctx.globalAlpha = random(0.25, 0.9);
    ctx.fillStyle = GLITTER_COLORS[Math.floor(Math.random() * GLITTER_COLORS.length)];
    const s = random(0.6, 1.8);
    ctx.fillRect(random(0, size), random(0, size), s, s);
  }
  titleBig.style.setProperty('--glitter-img', `url(${canvas.toDataURL()})`);
}

// Posición del cursor dentro de «REGALO», en px del propio elemento (sin la escala del cartel).
function setGlitterSpot(event) {
  const rect = titleBig.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * titleBig.offsetWidth;
  const y = ((event.clientY - rect.top) / rect.height) * titleBig.offsetHeight;
  titleBig.style.setProperty('--mx', `${x.toFixed(0)}px`);
  titleBig.style.setProperty('--my', `${y.toFixed(0)}px`);
}

function handleGlitterEnter(event) {
  setGlitterSpot(event);
  titleBig.style.setProperty('--glitter', 1);
  // Reinicia el destello para que barra la palabra cada vez que se entra
  titleBig.classList.remove('is-shining');
  void titleBig.offsetWidth;
  titleBig.classList.add('is-shining');
}

function handleGlitterLeave() {
  titleBig.style.setProperty('--glitter', 0);
}

// Hace titilar una chispa cerca del cursor, sobre las letras; no cae, se apaga en su sitio.
let lastSparkle = 0;
function handleGlitterMove(event) {
  setGlitterSpot(event);
  if (reduceMotion) return;
  const now = performance.now();
  if (now - lastSparkle < 110) return;
  lastSparkle = now;

  const { x, y } = toPosterCoords(event);
  const sparkle = document.createElement('span');
  sparkle.className = 'sparkle';
  sparkle.style.left = `${x + random(-60, 60)}px`;
  sparkle.style.top = `${y + random(-40, 40)}px`;
  sparkle.style.setProperty('--size', `${random(8, 18).toFixed(1)}px`);
  sparkle.style.setProperty('--color', SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)]);
  sparkles.append(sparkle);

  const turn = random(-30, 30).toFixed(0);
  sparkle.animate([
    { transform: 'translate(-50%, -50%) scale(0) rotate(0deg)', opacity: 0 },
    { transform: `translate(-50%, -50%) scale(1) rotate(${turn}deg)`, opacity: 1, offset: 0.4 },
    { transform: `translate(-50%, -50%) scale(0) rotate(${turn * 2}deg)`, opacity: 0 },
  ], { duration: random(650, 950), easing: 'ease-in-out' }).onfinish = () => sparkle.remove();
}

// Acerca la luz poco a poco a la posición del cursor y la aplica al dorado y al medallón.
function updateLight() {
  const targetX = (state.mouse.x - W / 2) / (W / 2);
  const targetY = (state.mouse.y - H / 2) / (H / 2);
  state.light.x += (targetX - state.light.x) * 0.05;
  state.light.y += (targetY - state.light.y) * 0.05;
  const { x } = state.light;

  // Brillo que recorre el dorado de «se quede sin»
  titleScript.style.backgroundPosition = `${(50 - x * 50).toFixed(1)}% 50%`;

  // El medallón se inclina apenas y su anillo punteado gira despacio
  badge.style.transform = `rotate(${(8 + x * 3).toFixed(2)}deg)`;
  badgeRing.setAttribute('transform', `rotate(${(x * 40).toFixed(1)})`);
}

/* --------------------------------------------------------------------------
   Nieve (canvas) con tres profundidades
   -------------------------------------------------------------------------- */
// Estrellas del cielo: solo por encima del horizonte nevado, más densas arriba.
const stars = Array.from({ length: 150 }, () => ({
  x: random(36, W - 36),
  y: 36 + Math.pow(Math.random(), 1.6) * 860,
  r: random(0.5, 1.5),
  speed: random(0.6, 2.2),
  phase: random(0, Math.PI * 2),
  bright: Math.random() < 0.08,   // unas pocas, más grandes, con destello en cruz
}));

function drawStars(time) {
  snowCtx.fillStyle = '#fff6dc';
  snowCtx.strokeStyle = '#fff6dc';
  stars.forEach((star) => {
    const twinkle = reduceMotion ? 0.8 : 0.45 + 0.55 * Math.abs(Math.sin((time / 1000) * star.speed + star.phase));
    snowCtx.globalAlpha = twinkle * (star.bright ? 1 : 0.75);
    snowCtx.beginPath();
    snowCtx.arc(star.x, star.y, star.bright ? 1.8 : star.r, 0, Math.PI * 2);
    snowCtx.fill();

    if (star.bright) {
      const arm = 4 + twinkle * 4;
      snowCtx.lineWidth = 1;
      snowCtx.beginPath();
      snowCtx.moveTo(star.x - arm, star.y);
      snowCtx.lineTo(star.x + arm, star.y);
      snowCtx.moveTo(star.x, star.y - arm);
      snowCtx.lineTo(star.x, star.y + arm);
      snowCtx.stroke();
    }
  });
  snowCtx.globalAlpha = 1;
}

const flakes = Array.from({ length: 120 }, () => ({
  x: random(0, W),
  y: random(0, H),
  r: random(1, 3.2),
  depth: random(0.25, 1),
  phase: random(0, Math.PI * 2),
}));

function drawSnow(time) {
  // Suaviza el desplazamiento para que la nieve siga al ratón con calma.
  const targetX = (state.mouse.x - W / 2) * -0.06;
  const targetY = (state.mouse.y - H / 2) * -0.04;
  state.parallax.x += (targetX - state.parallax.x) * 0.06;
  state.parallax.y += (targetY - state.parallax.y) * 0.06;

  snowCtx.clearRect(0, 0, W, H);
  drawStars(time);
  snowCtx.fillStyle = '#ffffff';
  snowCtx.strokeStyle = '#ffffff';
  snowCtx.lineWidth = 1.4;

  flakes.forEach((flake) => {
    if (!reduceMotion) {
      flake.y += 0.25 + flake.depth * 0.9;
      if (flake.y > H + 10) {
        flake.y = -10;
        flake.x = random(0, W);
      }
    }
    const sway = reduceMotion ? 0 : Math.sin(time / 1400 + flake.phase) * 6 * flake.depth;
    const x = flake.x + sway + state.parallax.x * flake.depth * 2;
    const y = flake.y + state.parallax.y * flake.depth * 2;

    snowCtx.globalAlpha = 0.25 + flake.depth * 0.5;

    // Los copos más cercanos son estrellas de seis brazos; el resto, puntos.
    if (flake.depth > 0.85 && flake.r > 2.4) {
      const arm = flake.r * 2.6;
      snowCtx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + flake.phase;
        snowCtx.moveTo(x, y);
        snowCtx.lineTo(x + Math.cos(a) * arm, y + Math.sin(a) * arm);
      }
      snowCtx.stroke();
    } else {
      snowCtx.beginPath();
      snowCtx.arc(x, y, flake.r * flake.depth + 0.6, 0, Math.PI * 2);
      snowCtx.fill();
    }
  });
  snowCtx.globalAlpha = 1;
}

function frame(time) {
  if (!reduceMotion) updateLight();
  drawSnow(time);
  drawBursts(time);
  requestAnimationFrame(frame);
}

/* --------------------------------------------------------------------------
   Atajos: completar y vaciar la pila
   -------------------------------------------------------------------------- */
function fillAll(instant = false) {
  // Si se estaban abriendo los regalos, se vuelve al modo de llenado.
  if (state.mode !== 'fill') {
    clearTimeout(state.modeTimer);
    state.slots.forEach((item) => {
      item.gift.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      item.opening = false;
    });
    state.mode = 'fill';
    poster.classList.remove('is-opening');
    hintText.textContent = 'Pasa el cursor por los huecos';
  }
  // Si el final se abre de golpe (?final o imprimir), la pista desaparece sin transición.
  if (instant) document.getElementById('hint').style.transition = 'none';

  state.slots.forEach((item, index) => {
    if (instant || reduceMotion) {
      fillSlot(item, true);
    } else {
      setTimeout(() => fillSlot(item), index * 90);   // caen uno tras otro
    }
  });
}

function reset() {
  clearTimeout(state.modeTimer);
  state.slots.forEach((item) => {
    item.gift.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    item.opening = false;
    emptySlot(item);
  });
  state.mode = 'fill';
  state.final = false;
  particles.length = 0;
  rings.length = 0;
  hintText.textContent = 'Pasa el cursor por los huecos';
  poster.classList.remove('is-final', 'is-opening');
  document.getElementById('hint').style.transition = '';
  countEl.textContent = 0;
}

function handleKey(event) {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.toLowerCase();
  if (key === 'f') fillAll();
  if (key === 'r') reset();
}

/* --------------------------------------------------------------------------
   Arranque
   -------------------------------------------------------------------------- */
function init() {
  fitPoster();
  buildBadge();
  buildGreenery();
  buildGlitter();
  buildPile();

  titleBig.addEventListener('mouseenter', handleGlitterEnter);
  titleBig.addEventListener('mouseleave', handleGlitterLeave);
  titleBig.addEventListener('mousemove', handleGlitterMove);

  poster.addEventListener('mousemove', handlePosterMove);
  poster.addEventListener('mouseleave', handlePosterLeave);
  window.addEventListener('keydown', handleKey);
  window.addEventListener('resize', fitPoster);
  // Al imprimir siempre sale el cartel final.
  window.addEventListener('beforeprint', () => fillAll(true));

  if (new URLSearchParams(window.location.search).has('final')) fillAll(true);

  requestAnimationFrame(frame);
}

init();
