/* =========================================================
   REGALA ILUSIÓN · Cartel interactivo · Fundación ITACA
   Interacciones:
     1. mouseenter → letras del titular, regalos y botón reaccionan
     2. mouseleave → todo vuelve a su estado inicial
     3. mousemove  → glitch, tinta fluida, ojos, lente-cursor con
                     arbolito, parallax, nieve (viento y copos que
                     crecen), estela de cristales y botón "magnético"
     Extra: click → onda expansiva, salpicadura de tinta y nieve ·
            mousedown/mouseup → arrancar bolas y estirar guirnaldas ·
            sacudir el ratón → terremoto
   ========================================================= */

const POSTER_W = 848;
const POSTER_H = 1200;

const poster = document.getElementById('poster');
const spotlight = document.getElementById('spotlight');
const headline = document.getElementById('headline');
const gifts = document.querySelectorAll('.gift');
const cta = document.getElementById('cta');
const ctaInner = cta.querySelector('.cta__inner');
const stamp = document.getElementById('stamp');
const hint = document.getElementById('hint');
const parallaxLayers = document.querySelectorAll('.parallax');

let scale = 1;
let glitch = 0;        // intensidad del glitch RGB (depende de la velocidad del ratón)
// Posición del ratón en coordenadas del cartel (null = fuera)
const mouse = { x: null, y: null };


/* ---------------------------------------------------------
   0. Escalado proporcional del cartel
   --------------------------------------------------------- */
function fitPoster() {
  const margin = 0.95;
  // En vertical ocupa toda la altura: el cartel va pegado arriba
  scale = Math.min(
    (window.innerWidth / POSTER_W) * margin,
    window.innerHeight / POSTER_H,
    1
  );
  poster.style.transform = `scale(${scale})`;
}

// Convierte la posición del evento a coordenadas internas (848×1200)
function getPosterCoords(event) {
  const rect = poster.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / scale,
    y: (event.clientY - rect.top) / scale
  };
}

function random(min, max) {
  return Math.random() * (max - min) + min;
}


/* ---------------------------------------------------------
   1. Titular: cada letra salta al pasar el cursor
   --------------------------------------------------------- */
function splitIntoLetters(line) {
  const text = line.dataset.text;
  for (const char of text) {
    const span = document.createElement('span');
    span.className = 'letter';
    span.textContent = char;
    span.addEventListener('mouseenter', handleLetterEnter);
    span.addEventListener('mouseleave', handleLetterLeave);
    line.appendChild(span);
  }
}

function handleLetterEnter(event) {
  const letter = event.currentTarget;
  const isAccent = letter.parentElement.classList.contains('headline__line--accent');
  letter.style.transform = `translateY(-38px) rotate(${random(-14, 14)}deg) scale(1.12)`;
  letter.style.color = isAccent ? '#fff6e6' : '#ffd25a';
  letter.style.textShadow = '7px 14px 0 #2a0208, 0 0 40px rgba(255,210,90,.8)';
  scrambleLetter(letter);
}

function handleLetterLeave(event) {
  const letter = event.currentTarget;
  letter.style.transform = '';
  letter.style.color = '';
  letter.style.textShadow = '';
}

// La letra "se descodifica": muestra símbolos aleatorios y vuelve a la original
function scrambleLetter(letter) {
  const symbols = '#%&@$€✦*?!¿¡+=';
  const original = letter.dataset.char || letter.textContent;
  letter.dataset.char = original;
  if (letter.dataset.scrambling) return;

  letter.dataset.scrambling = 'true';
  letter.style.width = `${letter.offsetWidth}px`; // evita que baile el resto
  letter.style.textAlign = 'center';

  let steps = 0;
  const timer = setInterval(() => {
    letter.textContent = symbols[Math.floor(random(0, symbols.length))];
    steps++;
    if (steps > 7) {
      clearInterval(timer);
      letter.textContent = original;
      letter.style.width = '';
      delete letter.dataset.scrambling;
    }
  }, 45);
}

headline.querySelectorAll('.headline__line').forEach(splitIntoLetters);


/* ---------------------------------------------------------
   2. Regalos: se abren con mouseenter y se cierran con mouseleave
   --------------------------------------------------------- */
const openedGifts = new Set();

function burstSparkles(gift) {
  const symbols = ['✦', '★', '❄', '✧'];
  for (let i = 0; i < 12; i++) {
    const sparkle = document.createElement('span');
    sparkle.className = 'sparkle';
    sparkle.textContent = symbols[i % symbols.length];
    gift.appendChild(sparkle);

    const angle = random(-Math.PI, 0); // hacia arriba
    const distance = random(70, 150);
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;

    sparkle.animate(
      [
        { transform: 'translate(-50%, -50%) scale(.3)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(1.2) rotate(${random(-180, 180)}deg)`, opacity: 0 }
      ],
      { duration: random(600, 1000), easing: 'cubic-bezier(.2,.8,.3,1)' }
    ).onfinish = () => sparkle.remove();
  }
}

function openGift(event) {
  const gift = event.currentTarget;
  const lid = gift.querySelector('.gift__lid');
  const box = gift.querySelector('.gift__box');
  const label = gift.querySelector('.gift__label');
  const detail = label.querySelector('small');

  lid.style.transform = 'translateY(-55px) rotate(-28deg)';
  box.style.boxShadow = '6px 6px 0 #2a0208, 0 -20px 60px 10px rgba(255,210,90,.75)';
  label.style.transform = 'translateY(-95px) scale(1.25)';
  detail.style.opacity = '1';
  gift.style.transform = 'translateY(-6px)';

  burstSparkles(gift);
  registerOpenedGift(gift);
}

function closeGift(event) {
  const gift = event.currentTarget;
  gift.querySelector('.gift__lid').style.transform = '';
  gift.querySelector('.gift__box').style.boxShadow = '';
  gift.querySelector('.gift__label').style.transform = '';
  gift.querySelector('.gift__label small').style.opacity = '';
  gift.style.transform = '';
}

// Cuando se han abierto los tres regalos aparece el sello "¡GRACIAS!"
function registerOpenedGift(gift) {
  openedGifts.add(gift);
  const remaining = gifts.length - openedGifts.size;

  if (remaining > 0) {
    hint.textContent = `¡Bien! Te ${remaining === 1 ? 'queda 1 regalo' : `quedan ${remaining} regalos`} por abrir`;
  } else {
    hint.textContent = 'Cada euro es una sonrisa el 21 de diciembre';
    stamp.style.opacity = '1';
    stamp.style.transform = 'rotate(-12deg) scale(1)';
  }
}

gifts.forEach((gift) => {
  gift.addEventListener('mouseenter', openGift);
  gift.addEventListener('mouseleave', closeGift);
});


/* ---------------------------------------------------------
   3. Botón "DONA AHORA": cambia de color y es magnético
   --------------------------------------------------------- */
function handleCtaEnter() {
  ctaInner.style.background = '#ffd25a';
  ctaInner.style.color = '#2a0208';
  ctaInner.style.boxShadow = '0 14px 0 #2a0208, 0 0 50px rgba(255,210,90,.8)';
}

function handleCtaMove(event) {
  const rect = cta.getBoundingClientRect();
  const dx = (event.clientX - (rect.left + rect.width / 2)) / scale;
  const dy = (event.clientY - (rect.top + rect.height / 2)) / scale;
  cta.style.transform = `translate(${dx * 0.25}px, ${dy * 0.35}px)`;
  ctaInner.style.transform = `scale(1.06) rotate(${dx * 0.02}deg)`;
}

function handleCtaLeave() {
  cta.style.transform = '';
  ctaInner.style.transform = '';
  ctaInner.style.background = '';
  ctaInner.style.color = '';
  ctaInner.style.boxShadow = '';
}

cta.addEventListener('mouseenter', handleCtaEnter);
cta.addEventListener('mousemove', handleCtaMove);
cta.addEventListener('mouseleave', handleCtaLeave);
cta.addEventListener('click', (event) => event.preventDefault());


/* ---------------------------------------------------------
   4. mousemove en el cartel: parallax + luz que sigue al cursor
   --------------------------------------------------------- */
function updateParallax(x, y) {
  // Valor de -0.5 a 0.5 respecto al centro del cartel
  const nx = x / POSTER_W - 0.5;
  const ny = y / POSTER_H - 0.5;

  parallaxLayers.forEach((layer) => {
    const depth = Number(layer.dataset.depth);
    layer.style.transform = `translate(${nx * depth}px, ${ny * depth}px)`;
  });
}

function handlePosterMove(event) {
  const { x, y } = getPosterCoords(event);

  if (mouse.x !== null) {
    const speed = Math.hypot(x - mouse.x, y - mouse.y);
    glitch = Math.min(Math.max(glitch, speed * 0.7), 34);
    stirFluid(x, y, x - mouse.x, y - mouse.y);
    touchTree(x, y, x - mouse.x, y - mouse.y);
    spawnCrystal(x, y, speed);
    detectShake(x - mouse.x, speed);
    // El arbolito se inclina hacia atrás, como si lo arrastrara el viento
    treeTilt = Math.max(-35, Math.min(35, treeTilt - (x - mouse.x) * 1.2));
  }

  mouse.x = x;
  mouse.y = y;

  spotlight.style.setProperty('--mx', `${x}px`);
  spotlight.style.setProperty('--my', `${y}px`);
  updateParallax(x, y);
  moveLens(x, y);
  updateEyes(event);
}

function handlePosterLeave() {
  leaveTree();
  mouse.x = null;
  mouse.y = null;
  lens.style.opacity = '0';
  spotlight.style.removeProperty('--mx');
  spotlight.style.removeProperty('--my');
  updateParallax(POSTER_W / 2, POSTER_H / 2);
}

poster.addEventListener('mousemove', handlePosterMove);
poster.addEventListener('mouseleave', handlePosterLeave);


/* ---------------------------------------------------------
   5. Nieve en canvas: los copos se apartan del cursor,
      crecen al acercarse y el ratón controla el viento
   --------------------------------------------------------- */
const canvas = document.getElementById('snow');
const ctx = canvas.getContext('2d');
const FLAKE_COUNT = 170;
const REPEL_RADIUS = 110;
const BUBBLE_RADIUS = 150;
const BLAST_RADIUS = 280;

let wind = 0;       // viento lateral: depende de la X del ratón
let fallSpeed = 1;  // velocidad de caída: depende de la Y del ratón

function createFlake(startOnTop = false) {
  const r = random(1.2, 4.2);
  return {
    x: random(0, POSTER_W),
    y: startOnTop ? random(-40, -5) : random(0, POSTER_H),
    r,
    size: r, // radio con el que se dibuja (crece cerca del cursor)
    vy: random(0.4, 1.4),
    drift: random(0, Math.PI * 2),
    pushX: 0,
    pushY: 0
  };
}

const flakes = Array.from({ length: FLAKE_COUNT }, () => createFlake());

// Ratón a la izquierda/derecha = viento hacia ese lado; arriba = nieve lenta, abajo = ventisca
function updateWeather() {
  const targetWind = mouse.x === null ? 0 : (mouse.x / POSTER_W - 0.5) * 4;
  const targetSpeed = mouse.y === null ? 1 : 0.4 + (mouse.y / POSTER_H) * 2.2;
  wind += (targetWind - wind) * 0.05;
  fallSpeed += (targetSpeed - fallSpeed) * 0.05;
}

function updateFlake(flake) {
  flake.drift += 0.01;
  flake.y += flake.vy * fallSpeed + flake.pushY;
  flake.x += Math.sin(flake.drift) * 0.4 + wind * (flake.r / 3) + flake.pushX;

  let targetSize = flake.r;

  // Repulsión respecto al cursor + los copos cercanos se hinchan
  if (mouse.x !== null) {
    const dx = flake.x - mouse.x;
    const dy = flake.y - mouse.y;
    const dist = Math.hypot(dx, dy);
    if (dist < REPEL_RADIUS && dist > 0) {
      const force = (REPEL_RADIUS - dist) / REPEL_RADIUS;
      flake.pushX += (dx / dist) * force * 1.2;
      flake.pushY += (dy / dist) * force * 1.2;
    }
    if (dist < BUBBLE_RADIUS) {
      targetSize = flake.r * (1 + (1 - dist / BUBBLE_RADIUS) * 1.8);
    }
  }
  flake.size += (targetSize - flake.size) * 0.2;

  // Fricción: el empuje se va disipando
  flake.pushX *= 0.92;
  flake.pushY *= 0.92;

  if (flake.y > POSTER_H + 10) {
    Object.assign(flake, createFlake(true));
  }
  // Con viento, el copo que sale por un lado entra por el otro
  if (flake.x < -20) flake.x = POSTER_W + 20;
  else if (flake.x > POSTER_W + 20) flake.x = -20;
}

function drawSnow() {
  updateWeather();
  ctx.clearRect(0, 0, POSTER_W, POSTER_H);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  for (const flake of flakes) {
    updateFlake(flake);
    ctx.moveTo(flake.x + flake.size, flake.y);
    ctx.arc(flake.x, flake.y, flake.size, 0, Math.PI * 2);
  }
  ctx.fill();
}

// Clic: la nieve sale disparada desde el punto del clic
function blowSnow(x, y) {
  for (const flake of flakes) {
    const dx = flake.x - x;
    const dy = flake.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist < BLAST_RADIUS && dist > 0) {
      const force = (1 - dist / BLAST_RADIUS) * 16;
      flake.pushX += (dx / dist) * force;
      flake.pushY += (dy / dist) * force;
    }
  }
}


/* ---------------------------------------------------------
   5b. Estela de cristales de nieve que suelta el cursor
   --------------------------------------------------------- */
const crystals = [];
const CRYSTAL_SYMBOLS = ['❅', '❆', '✻'];
let crystalDistance = 0;

// Suelta un cristal cada ~28 px recorridos
function spawnCrystal(x, y, speed) {
  crystalDistance += speed;
  if (crystalDistance < 28) return;
  crystalDistance = 0;
  crystals.push({
    x, y,
    symbol: CRYSTAL_SYMBOLS[Math.floor(random(0, CRYSTAL_SYMBOLS.length))],
    vx: random(-0.6, 0.6),
    vy: random(0.3, 1.2),
    rot: random(0, Math.PI * 2),
    vr: random(-0.05, 0.05),
    size: random(14, 26),
    life: 1
  });
}

function drawCrystals() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff6e6';
  ctx.shadowColor = 'rgba(255, 255, 255, .9)';
  ctx.shadowBlur = 8;
  for (let i = crystals.length - 1; i >= 0; i--) {
    const c = crystals[i];
    c.x += c.vx + wind * 0.5;
    c.y += c.vy;
    c.rot += c.vr;
    c.life -= 0.012;
    if (c.life <= 0) {
      crystals.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = c.life;
    ctx.translate(c.x, c.y);
    ctx.rotate(c.rot);
    ctx.font = `${c.size}px system-ui, sans-serif`;
    ctx.fillText(c.symbol, 0, 0);
    ctx.restore();
  }
  ctx.shadowBlur = 0;
}


/* ---------------------------------------------------------
   6. Confeti: trozos que caen con gravedad
   --------------------------------------------------------- */
const shredsCanvas = document.getElementById('shreds');
const shredsCtx = shredsCanvas.getContext('2d');
const shreds = [];

function spawnShred(x, y, color) {
  shreds.push({
    x, y, color,
    vx: random(-4, 4),
    vy: random(-6, -1),
    rot: random(0, Math.PI * 2),
    vr: random(-0.3, 0.3),
    w: random(10, 26),
    h: random(6, 16)
  });
}

function drawShreds() {
  shredsCtx.clearRect(0, 0, POSTER_W, POSTER_H);
  for (let i = shreds.length - 1; i >= 0; i--) {
    const s = shreds[i];
    s.vy += 0.35; // gravedad
    s.vx *= 0.98;
    s.x += s.vx;
    s.y += s.vy;
    s.rot += s.vr;

    shredsCtx.save();
    shredsCtx.translate(s.x, s.y);
    shredsCtx.rotate(s.rot);
    shredsCtx.fillStyle = s.color;
    shredsCtx.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
    shredsCtx.restore();

    if (s.y > POSTER_H + 40) shreds.splice(i, 1);
  }
}


/* ---------------------------------------------------------
   7. Glitch RGB en el titular según la velocidad del ratón
   --------------------------------------------------------- */
const headlineLines = headline.querySelectorAll('.headline__line');

function updateGlitch() {
  glitch *= 0.88;
  if (glitch < 0.3) glitch = 0;

  const g = glitch;
  headlineLines.forEach((line, i) => {
    if (g === 0) {
      line.style.transform = '';
      line.style.textShadow = '';
      return;
    }
    const dir = i === 0 ? 1 : -1;
    line.style.transform = `translateX(${dir * g * 0.6}px) skewX(${dir * -g * 0.4}deg)`;
    line.style.textShadow =
      `${g}px 0 0 rgba(0,240,255,.75), ${-g}px 0 0 rgba(255,0,90,.75), 7px 7px 0 #2a0208`;
  });
}


/* ---------------------------------------------------------
   8. Lente-cursor: invierte los colores y crece sobre lo interactivo
   --------------------------------------------------------- */
const lens = document.getElementById('lens');
const LENS_SMALL = 34;
const LENS_BIG = 170;

function moveLens(x, y) {
  lens.style.opacity = '1';
  lens.style.transform = `translate(${x}px, ${y}px)`;
}

function setLensSize(size) {
  lens.style.width = `${size}px`;
  lens.style.height = `${size}px`;
  lens.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
}

// El arbolito-puntero vuelve poco a poco a estar recto
const cursorTree = document.getElementById('cursorTree');
let treeTilt = 0;

function updateTreeTilt() {
  treeTilt *= 0.88;
  cursorTree.style.transform = `rotate(${treeTilt.toFixed(2)}deg)`;
  // Cuanto más rápido te mueves, más brillan las luces
  const glow = Math.abs(treeTilt) / 35;
  cursorTree.style.filter =
    `drop-shadow(0 0 ${4 + glow * 8}px rgba(255,210,90,.9)) brightness(${(1 + glow * 0.8).toFixed(2)})`;
}

function growLens() { setLensSize(LENS_BIG); }
function shrinkLens() { setLensSize(LENS_SMALL); }

document.querySelectorAll('.letter, .gift, .cta, .date, .stamp').forEach((el) => {
  el.addEventListener('mouseenter', growLens);
  el.addEventListener('mouseleave', shrinkLens);
});


/* ---------------------------------------------------------
   9. Splash cursor: el ratón remueve tinta fluida (WebGL)
      Simulación de fluidos basada en la técnica de
      Pavel Dobryakov (WebGL-Fluid-Simulation, licencia MIT)
   --------------------------------------------------------- */
const FLUID = {
  SIM_RES: 128,          // resolución de la simulación de velocidad
  DYE_RES: 512,          // resolución de la tinta
  VELOCITY_DISSIPATION: 0.4,
  DENSITY_DISSIPATION: 5, // cuanto más alto, antes desaparece la tinta
  PRESSURE: 0.8,
  PRESSURE_ITERATIONS: 20,
  CURL: 28,              // remolinos
  SPLAT_RADIUS: 0.0011,
  SPLAT_FORCE: 4000
};

// Colores de la tinta: dorado, crema, rosa, cian y verde navideño
const FLUID_COLORS = [
  [1.0, 0.82, 0.35],
  [1.0, 0.96, 0.9],
  [1.0, 0.23, 0.54],
  [0.0, 0.94, 1.0],
  [0.07, 0.6, 0.35]
];

const FLUID_VERTEX = `#version 300 es
precision highp float;
in vec2 aPosition;
uniform vec2 texelSize;
out vec2 vUv, vL, vR, vT, vB;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FLUID_HEADER = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv, vL, vR, vT, vB;
out vec4 fragColor;
`;

const FLUID_SHADERS = {
  // Añade una "gota" de velocidad o de color en un punto
  splat: `
    uniform sampler2D uTarget;
    uniform float aspectRatio, radius;
    uniform vec3 color;
    uniform vec2 point;
    void main() {
      vec2 p = vUv - point;
      p.x *= aspectRatio;
      vec3 splat = exp(-dot(p, p) / radius) * color;
      fragColor = vec4(texture(uTarget, vUv).xyz + splat, 1.0);
    }`,
  // Mueve lo que hay en la textura siguiendo la velocidad
  advection: `
    uniform sampler2D uVelocity, uSource;
    uniform float dt, dissipation;
    uniform vec2 texelSize;
    void main() {
      vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
      fragColor = texture(uSource, coord) / (1.0 + dissipation * dt);
    }`,
  divergence: `
    uniform sampler2D uVelocity;
    void main() {
      float L = texture(uVelocity, vL).x;
      float R = texture(uVelocity, vR).x;
      float T = texture(uVelocity, vT).y;
      float B = texture(uVelocity, vB).y;
      vec2 C = texture(uVelocity, vUv).xy;
      if (vL.x < 0.0) L = -C.x;
      if (vR.x > 1.0) R = -C.x;
      if (vT.y > 1.0) T = -C.y;
      if (vB.y < 0.0) B = -C.y;
      fragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
    }`,
  curl: `
    uniform sampler2D uVelocity;
    void main() {
      float L = texture(uVelocity, vL).y;
      float R = texture(uVelocity, vR).y;
      float T = texture(uVelocity, vT).x;
      float B = texture(uVelocity, vB).x;
      fragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
    }`,
  // Refuerza los remolinos para que la tinta se enrosque
  vorticity: `
    uniform sampler2D uVelocity, uCurl;
    uniform float curl, dt;
    void main() {
      float L = texture(uCurl, vL).x;
      float R = texture(uCurl, vR).x;
      float T = texture(uCurl, vT).x;
      float B = texture(uCurl, vB).x;
      float C = texture(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 0.0001;
      force *= curl * C;
      force.y *= -1.0;
      vec2 v = texture(uVelocity, vUv).xy + force * dt;
      fragColor = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
    }`,
  pressure: `
    uniform sampler2D uPressure, uDivergence;
    void main() {
      float L = texture(uPressure, vL).x;
      float R = texture(uPressure, vR).x;
      float T = texture(uPressure, vT).x;
      float B = texture(uPressure, vB).x;
      float d = texture(uDivergence, vUv).x;
      fragColor = vec4((L + R + B + T - d) * 0.25, 0.0, 0.0, 1.0);
    }`,
  gradientSubtract: `
    uniform sampler2D uPressure, uVelocity;
    void main() {
      float L = texture(uPressure, vL).x;
      float R = texture(uPressure, vR).x;
      float T = texture(uPressure, vT).x;
      float B = texture(uPressure, vB).x;
      vec2 v = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
      fragColor = vec4(v, 0.0, 1.0);
    }`,
  clear: `
    uniform sampler2D uTexture;
    uniform float value;
    void main() { fragColor = value * texture(uTexture, vUv); }`,
  // Pinta la tinta con transparencia: donde no hay tinta se ve el cartel
  display: `
    uniform sampler2D uTexture;
    void main() {
      vec3 c = min(texture(uTexture, vUv).rgb, 1.0);
      fragColor = vec4(c, max(c.r, max(c.g, c.b)));
    }`
};

function createFluid(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false
  });
  // Sin WebGL2 o sin texturas float el cartel funciona igual, sólo sin tinta
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  const vertexShader = compile(gl.VERTEX_SHADER, FLUID_VERTEX);

  function createProgram(source) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FLUID_HEADER + source));
    gl.bindAttribLocation(program, 0, 'aPosition');
    gl.linkProgram(program);
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const name = gl.getActiveUniform(program, i).name;
      uniforms[name] = gl.getUniformLocation(program, name);
    }
    return { uniforms, bind: () => gl.useProgram(program) };
  }

  const programs = {};
  for (const name in FLUID_SHADERS) programs[name] = createProgram(FLUID_SHADERS[name]);

  // Rectángulo que cubre toda la pantalla
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  function blit(target) {
    if (target) {
      gl.viewport(0, 0, target.width, target.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    } else {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  function createFBO(width, height, filter) {
    gl.activeTexture(gl.TEXTURE0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      fbo, width, height,
      texelX: 1 / width,
      texelY: 1 / height,
      attach(unit) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        return unit;
      }
    };
  }

  // Dos texturas que se turnan: se lee de una y se escribe en la otra
  function createDoubleFBO(width, height, filter) {
    let read = createFBO(width, height, filter);
    let write = createFBO(width, height, filter);
    return {
      width, height,
      texelX: read.texelX,
      texelY: read.texelY,
      get read() { return read; },
      get write() { return write; },
      swap() { [read, write] = [write, read]; }
    };
  }

  // Cartel vertical: el lado corto usa la resolución base
  const aspect = canvas.width / canvas.height;
  const size = (res) => (aspect < 1
    ? [res, Math.round(res / aspect)]
    : [Math.round(res * aspect), res]);
  const [simW, simH] = size(FLUID.SIM_RES);
  const [dyeW, dyeH] = size(FLUID.DYE_RES);

  const velocity = createDoubleFBO(simW, simH, gl.LINEAR);
  const dye = createDoubleFBO(dyeW, dyeH, gl.LINEAR);
  const pressure = createDoubleFBO(simW, simH, gl.NEAREST);
  const divergence = createFBO(simW, simH, gl.NEAREST);
  const curl = createFBO(simW, simH, gl.NEAREST);

  function splat(x, y, dx, dy, color) {
    const p = programs.splat;
    p.bind();
    gl.uniform1i(p.uniforms.uTarget, velocity.read.attach(0));
    gl.uniform1f(p.uniforms.aspectRatio, aspect);
    gl.uniform2f(p.uniforms.point, x, y);
    gl.uniform3f(p.uniforms.color, dx, dy, 0);
    gl.uniform1f(p.uniforms.radius, FLUID.SPLAT_RADIUS);
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(p.uniforms.uTarget, dye.read.attach(0));
    gl.uniform3f(p.uniforms.color, color[0], color[1], color[2]);
    blit(dye.write);
    dye.swap();
  }

  function step(dt) {
    const pr = programs;
    gl.disable(gl.BLEND);

    pr.curl.bind();
    gl.uniform2f(pr.curl.uniforms.texelSize, velocity.texelX, velocity.texelY);
    gl.uniform1i(pr.curl.uniforms.uVelocity, velocity.read.attach(0));
    blit(curl);

    pr.vorticity.bind();
    gl.uniform2f(pr.vorticity.uniforms.texelSize, velocity.texelX, velocity.texelY);
    gl.uniform1i(pr.vorticity.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(pr.vorticity.uniforms.uCurl, curl.attach(1));
    gl.uniform1f(pr.vorticity.uniforms.curl, FLUID.CURL);
    gl.uniform1f(pr.vorticity.uniforms.dt, dt);
    blit(velocity.write);
    velocity.swap();

    pr.divergence.bind();
    gl.uniform2f(pr.divergence.uniforms.texelSize, velocity.texelX, velocity.texelY);
    gl.uniform1i(pr.divergence.uniforms.uVelocity, velocity.read.attach(0));
    blit(divergence);

    pr.clear.bind();
    gl.uniform1i(pr.clear.uniforms.uTexture, pressure.read.attach(0));
    gl.uniform1f(pr.clear.uniforms.value, FLUID.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    pr.pressure.bind();
    gl.uniform2f(pr.pressure.uniforms.texelSize, velocity.texelX, velocity.texelY);
    gl.uniform1i(pr.pressure.uniforms.uDivergence, divergence.attach(0));
    for (let i = 0; i < FLUID.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(pr.pressure.uniforms.uPressure, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    pr.gradientSubtract.bind();
    gl.uniform2f(pr.gradientSubtract.uniforms.texelSize, velocity.texelX, velocity.texelY);
    gl.uniform1i(pr.gradientSubtract.uniforms.uPressure, pressure.read.attach(0));
    gl.uniform1i(pr.gradientSubtract.uniforms.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    pr.advection.bind();
    gl.uniform2f(pr.advection.uniforms.texelSize, velocity.texelX, velocity.texelY);
    gl.uniform1i(pr.advection.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(pr.advection.uniforms.uSource, velocity.read.attach(0));
    gl.uniform1f(pr.advection.uniforms.dt, dt);
    gl.uniform1f(pr.advection.uniforms.dissipation, FLUID.VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(pr.advection.uniforms.uVelocity, velocity.read.attach(0));
    gl.uniform1i(pr.advection.uniforms.uSource, dye.read.attach(1));
    gl.uniform1f(pr.advection.uniforms.dissipation, FLUID.DENSITY_DISSIPATION);
    blit(dye.write);
    dye.swap();
  }

  function render() {
    programs.display.bind();
    gl.uniform1i(programs.display.uniforms.uTexture, dye.read.attach(0));
    blit(null);
  }

  return { splat, step, render };
}

const fluidCanvas = document.getElementById('fluid');
let fluid = null;
try {
  fluid = createFluid(fluidCanvas);
} catch (error) {
  console.warn('Splash cursor desactivado:', error);
}

let fluidColor = FLUID_COLORS[0];
let fluidColorIndex = 0;
let lastFluidTime = performance.now();

// Cada poco tiempo la tinta cambia de color
setInterval(() => {
  fluidColorIndex = (fluidColorIndex + 1) % FLUID_COLORS.length;
  fluidColor = FLUID_COLORS[fluidColorIndex];
}, 450);

// Coordenadas del cartel (px) → coordenadas de la textura (0..1, y hacia arriba)
function fluidSplat(x, y, dx, dy, color, strength = 0.03) {
  if (!fluid) return;
  const aspect = POSTER_W / POSTER_H;
  fluid.splat(
    x / POSTER_W,
    1 - y / POSTER_H,
    (dx / POSTER_W) * FLUID.SPLAT_FORCE * aspect,
    (-dy / POSTER_H) * FLUID.SPLAT_FORCE,
    color.map((c) => c * strength)
  );
}

// mousemove: el ratón remueve la tinta
function stirFluid(x, y, dx, dy) {
  if (dx === 0 && dy === 0) return;
  fluidSplat(x, y, dx, dy, fluidColor);
}

// click: salpicadura en todas direcciones (un solo color: mezclados quedan blancos)
function splashFluid(x, y) {
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    fluidSplat(x, y, Math.cos(angle) * 40, Math.sin(angle) * 40, fluidColor, 0.015);
  }
}

function updateFluid() {
  if (!fluid) return;
  const now = performance.now();
  const dt = Math.min((now - lastFluidTime) / 1000, 0.016666);
  lastFluidTime = now;
  fluid.step(dt);
  fluid.render();
}


/* ---------------------------------------------------------
   10. Ojos saltones: los regalos te siguen con la mirada
   --------------------------------------------------------- */
const pupils = document.querySelectorAll('.pupil');

function updateEyes(event) {
  pupils.forEach((pupil) => {
    const eye = pupil.parentElement.getBoundingClientRect();
    const cx = eye.left + eye.width / 2;
    const cy = eye.top + eye.height / 2;
    const angle = Math.atan2(event.clientY - cy, event.clientX - cx);
    const reach = (eye.width / scale) * 0.24;
    pupil.style.transform =
      `translate(${Math.cos(angle) * reach}px, ${Math.sin(angle) * reach}px)`;
  });
}


/* ---------------------------------------------------------
   11. Clic: onda expansiva que deforma todo el cartel
   --------------------------------------------------------- */
const shockMap = document.getElementById('shockMap');
let shockStart = 0;

function shockwave(event) {
  if (event.target.closest('.cta')) return;
  // Si acabas de soltar una bola o una guirnalda, no es un clic
  if (suppressClick) {
    suppressClick = false;
    return;
  }
  const { x, y } = getPosterCoords(event);
  blowSnow(x, y);
  splashFluid(x, y);
  treeClick(x, y);

  const ring = document.createElement('div');
  ring.className = 'shock-ring';
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  poster.appendChild(ring);
  ring.animate(
    [
      { transform: 'scale(0.2)', opacity: 1 },
      { transform: 'scale(22)', opacity: 0 }
    ],
    { duration: 800, easing: 'cubic-bezier(.1,.7,.3,1)' }
  ).onfinish = () => ring.remove();

  // La deformación se anima cambiando la escala del feDisplacementMap
  poster.style.filter = 'url(#shock)';
  shockStart = performance.now();
  requestAnimationFrame(animateShock);
}

function animateShock(now) {
  const t = Math.min((now - shockStart) / 700, 1);
  const strength = 95 * (1 - t) * Math.abs(Math.sin(t * Math.PI * 5));
  shockMap.setAttribute('scale', strength.toFixed(1));
  if (t < 1) {
    requestAnimationFrame(animateShock);
  } else {
    shockMap.setAttribute('scale', '0');
    poster.style.filter = '';
  }
}

poster.addEventListener('click', shockwave);


/* ---------------------------------------------------------
   12. Sacudir el ratón: terremoto + lluvia de confeti
   --------------------------------------------------------- */
const stage = document.getElementById('stage');
const CONFETTI_COLORS = ['#ffd25a', '#fff6e6', '#0f7a4a', '#12955a', '#00f0ff', '#ff3b8a'];
let lastDirection = 0;
let directionChanges = [];
let quaking = false;

function detectShake(dx, speed) {
  if (speed < 12 || dx === 0) return;
  const direction = Math.sign(dx);
  if (direction !== lastDirection) {
    const now = performance.now();
    directionChanges = directionChanges.filter((time) => now - time < 700);
    directionChanges.push(now);
    lastDirection = direction;
    if (directionChanges.length >= 6) {
      directionChanges = [];
      earthquake();
    }
  }
}

function earthquake() {
  if (quaking) return;
  quaking = true;
  stage.classList.add('stage--quake');
  stage.addEventListener('animationend', () => {
    stage.classList.remove('stage--quake');
    quaking = false;
  }, { once: true });

  for (let i = 0; i < 140; i++) {
    const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    spawnShred(random(0, POSTER_W), random(-300, -10), color);
  }
  gifts.forEach((gift, i) => {
    gift.animate(
      [
        { transform: 'translateY(0) rotate(0)' },
        { transform: `translateY(-90px) rotate(${i % 2 ? 25 : -25}deg)` },
        { transform: 'translateY(0) rotate(0)' }
      ],
      { duration: 650, delay: i * 80, easing: 'cubic-bezier(.3,1.6,.5,1)' }
    );
  });
  // Todo el árbol tiembla
  shakeTree();
}


/* ---------------------------------------------------------
   13. Árbol de fondo
       · los pisos son de gelatina: se deforman al pasar el ratón
       · las guirnaldas son cuerdas con física (Verlet): se mecen,
         se pueden agarrar y estirar
       · las bolas se balancean y se pueden arrancar y lanzar
       · las luces se encienden a tu paso; al clic salta la estrella
   --------------------------------------------------------- */
const SVG_NS = 'http://www.w3.org/2000/svg';
const treeStar = document.getElementById('treeStar');
const garlandGroup = document.getElementById('treeGarlands');
const ornamentGroup = document.getElementById('treeOrnaments');
const BULB_COLORS = ['#ffd25a', '#00f0ff', '#ff3b8a', '#fff6e6'];
const LIGHT_RADIUS = 95;
const SWING_RADIUS = 70;
const JELLY_RADIUS = 120;
const FLOOR_Y = 1130;     // "suelo" donde rebotan las bolas arrancadas
const treeMouse = { dx: 0, dy: 0 }; // último movimiento del ratón (para lanzar)
let grabbed = null;       // { type: 'ornament' | 'rope', ... } lo que tienes agarrado
let suppressClick = false;

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const name in attrs) el.setAttribute(name, attrs[name]);
  return el;
}

// Une puntos con curvas suaves (pasando por los puntos medios)
function smoothPath(points, closed) {
  const mid = (a, b) => `${((a.x + b.x) / 2).toFixed(1)} ${((a.y + b.y) / 2).toFixed(1)}`;
  if (closed) {
    let d = `M${mid(points[points.length - 1], points[0])}`;
    points.forEach((p, i) => {
      d += ` Q${p.x.toFixed(1)} ${p.y.toFixed(1)} ${mid(p, points[(i + 1) % points.length])}`;
    });
    return d + ' Z';
  }
  let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    d += ` Q${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)} ${mid(points[i], points[i + 1])}`;
  }
  const last = points[points.length - 1];
  return d + ` L${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
}


/* ---- 13a. Pisos de gelatina ---- */
// [x de la punta, y de la punta, medio ancho de la base, y de la base]
const TIERS = [
  [424, 230, 190, 470],
  [424, 360, 270, 680],
  [424, 520, 340, 920]
];

// Reparte puntos por el contorno del triángulo; cada punto recuerda su sitio
function triangleOutline([ax, ay, half, by]) {
  const corners = [[ax, ay], [ax + half, by], [ax - half, by]];
  const points = [];
  corners.forEach(([x1, y1], i) => {
    const [x2, y2] = corners[(i + 1) % 3];
    const steps = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 26);
    for (let s = 0; s < steps; s++) {
      const x = x1 + (x2 - x1) * (s / steps);
      const y = y1 + (y2 - y1) * (s / steps);
      points.push({ x, y, hx: x, hy: y, vx: 0, vy: 0 });
    }
  });
  return points;
}

const jellyTiers = TIERS.map((tier, i) => ({
  points: triangleOutline(tier),
  paths: document.querySelectorAll(`#xmasTree [data-tier="${i}"]`),
  moving: false
}));

function pushJelly(x, y, dx, dy) {
  for (const tier of jellyTiers) {
    for (const p of tier.points) {
      const dist = Math.hypot(p.x - x, p.y - y);
      if (dist < JELLY_RADIUS) {
        const force = (1 - dist / JELLY_RADIUS) * 0.35;
        p.vx += dx * force;
        p.vy += dy * force;
        tier.moving = true;
      }
    }
  }
}

function updateJelly() {
  for (const tier of jellyTiers) {
    if (!tier.moving) continue;
    let energy = 0;
    for (const p of tier.points) {
      p.vx += (p.hx - p.x) * 0.09; // muelle hacia su sitio
      p.vy += (p.hy - p.y) * 0.09;
      p.vx *= 0.84;                // la gelatina se calma poco a poco
      p.vy *= 0.84;
      p.x += p.vx;
      p.y += p.vy;
      energy += Math.abs(p.x - p.hx) + Math.abs(p.y - p.hy) + Math.abs(p.vx) + Math.abs(p.vy);
    }
    // Cuando ya está quieto, vuelve a la forma exacta y deja de calcular
    if (energy < 0.5) {
      tier.points.forEach((p) => { p.x = p.hx; p.y = p.hy; p.vx = 0; p.vy = 0; });
      tier.moving = false;
    }
    const d = smoothPath(tier.points, true);
    tier.paths.forEach((path) => path.setAttribute('d', d));
  }
}


/* ---- 13b. Guirnaldas: cuerdas con física de Verlet ---- */
// [x1, y1, x2, y2, caída]; cada bombilla es un nudo de la cuerda
const GARLANDS = [
  [292, 432, 562, 410, 26],
  [236, 612, 606, 588, 44],
  [196, 826, 652, 794, 52]
];
const ROPE_GRAVITY = 0.25;
const ROPE_ITERATIONS = 6;
const ROPE_GRAB_RADIUS = 30;
const treeBulbs = [];

const ropes = GARLANDS.map(([x1, y1, x2, y2, sag]) => {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2 + sag * 2;
  const wire = svgEl('path', { fill: 'none', stroke: '#2a0208', 'stroke-width': 3, opacity: 0.6 });
  garlandGroup.appendChild(wire);

  const count = Math.round((x2 - x1) / 30);
  const points = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    // Punto de la curva cuadrática
    const x = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t ** 2 * x2;
    const y = (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t ** 2 * y2;
    // Los extremos están clavados al árbol
    const point = { x, y, px: x, py: y, pinned: i === 0 || i === count };
    points.push(point);

    if (!point.pinned) {
      const el = svgEl('circle', {
        class: 'tree-bulb', cx: x, cy: y + 6, r: 8,
        fill: BULB_COLORS[treeBulbs.length % BULB_COLORS.length],
        stroke: '#2a0208', 'stroke-width': 2
      });
      garlandGroup.appendChild(el);
      treeBulbs.push({ el, point, x, y, lit: 0, delay: -1 });
    }
  }
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  return { wire, points, lengths };
});

function updateRopes() {
  for (const rope of ropes) {
    // 1. Verlet: cada nudo sigue su inercia + gravedad
    for (const p of rope.points) {
      if (p.pinned) continue;
      if (grabbed && grabbed.point === p) {
        p.px = p.x; p.py = p.y;
        p.x = mouse.x; p.y = mouse.y;
        continue;
      }
      const vx = (p.x - p.px) * 0.97;
      const vy = (p.y - p.py) * 0.97;
      p.px = p.x; p.py = p.y;
      p.x += vx;
      p.y += vy + ROPE_GRAVITY;
    }
    // 2. Restricciones: los nudos mantienen la distancia entre ellos
    for (let k = 0; k < ROPE_ITERATIONS; k++) {
      for (let i = 0; i < rope.lengths.length; i++) {
        const a = rope.points[i];
        const b = rope.points[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const diff = (dist - rope.lengths[i]) / dist / 2;
        const aFixed = a.pinned || (grabbed && grabbed.point === a);
        const bFixed = b.pinned || (grabbed && grabbed.point === b);
        if (!aFixed) { a.x += dx * diff * (bFixed ? 2 : 1); a.y += dy * diff * (bFixed ? 2 : 1); }
        if (!bFixed) { b.x -= dx * diff * (aFixed ? 2 : 1); b.y -= dy * diff * (aFixed ? 2 : 1); }
      }
    }
    rope.wire.setAttribute('d', smoothPath(rope.points, false));
  }
  for (const bulb of treeBulbs) {
    bulb.x = bulb.point.x;
    bulb.y = bulb.point.y + 6;
    bulb.el.setAttribute('cx', bulb.x.toFixed(1));
    bulb.el.setAttribute('cy', bulb.y.toFixed(1));
  }
}

// Al pasar el ratón cerca, la cuerda se arrastra un poco con él
function brushRopes(x, y, dx, dy) {
  for (const rope of ropes) {
    for (const p of rope.points) {
      if (p.pinned) continue;
      const dist = Math.hypot(p.x - x, p.y - y);
      if (dist < 45) {
        const force = (1 - dist / 45) * 0.5;
        p.x += dx * force;
        p.y += dy * force;
      }
    }
  }
}


/* ---- 13c. Bolas: se balancean, se arrancan y rebotan ---- */
// [x, y del gancho, largo del hilo, radio, color]
const ORNAMENTS = [
  [296, 455, 30, 17, '#ffd25a'], [424, 330, 26, 15, '#ff3b8a'], [552, 455, 34, 18, '#00f0ff'],
  [210, 664, 34, 20, '#fff6e6'], [352, 520, 28, 17, '#ffd25a'], [498, 668, 40, 21, '#ff3b8a'],
  [640, 664, 30, 19, '#ffd25a'], [130, 904, 36, 22, '#00f0ff'], [300, 700, 30, 18, '#ff3b8a'],
  [560, 730, 30, 19, '#fff6e6'], [718, 904, 34, 22, '#ffd25a']
];
const treeOrnaments = ORNAMENTS.map(([hx, hy, len, r, color]) => {
  const g = svgEl('g', { class: 'tree-ornament' });
  const string = svgEl('line', { x1: hx, y1: hy, x2: hx, y2: hy + len, stroke: '#2a0208', 'stroke-width': 3 });
  g.appendChild(string);
  g.appendChild(svgEl('circle', { cx: hx + 5, cy: hy + len + r + 5, r, fill: '#2a0208' }));
  g.appendChild(svgEl('circle', { cx: hx, cy: hy + len + r, r, fill: color, stroke: '#2a0208', 'stroke-width': 3 }));
  // Brillo
  g.appendChild(svgEl('circle', { cx: hx - r * 0.35, cy: hy + len + r * 0.6, r: r * 0.25, fill: '#fff', opacity: 0.7 }));
  ornamentGroup.appendChild(g);
  return {
    g, string, hx, hy, r,
    ballY: hy + len + r,
    angle: 0, vel: 0,
    state: 'hanging',      // hanging · held · falling
    x: 0, y: 0, vx: 0, vy: 0, rest: 0
  };
});

// Centro actual de la bola
function ballPosition(o) {
  if (o.state !== 'hanging') return { x: o.x, y: o.y };
  const len = o.ballY - o.hy;
  return { x: o.hx + Math.sin(o.angle) * len, y: o.hy + Math.cos(o.angle) * len };
}

function updateOrnaments() {
  for (const o of treeOrnaments) {
    if (o.state === 'hanging') {
      o.vel += -o.angle * 0.03; // muelle: vuelve al centro
      o.vel *= 0.96;            // rozamiento
      o.angle = Math.max(-1.2, Math.min(1.2, o.angle + o.vel));
      o.g.setAttribute('transform', `rotate(${(o.angle * 57.3).toFixed(2)} ${o.hx} ${o.hy})`);
      continue;
    }
    if (o.state === 'held') {
      o.x = mouse.x ?? o.x;
      o.y = mouse.y ?? o.y;
    } else {
      // Cae con gravedad y rebota contra el suelo y los lados
      o.vy += 0.6;
      o.x += o.vx;
      o.y += o.vy;
      if (o.y > FLOOR_Y - o.r) {
        o.y = FLOOR_Y - o.r;
        o.vy *= -0.55;
        o.vx *= 0.9;
      }
      if (o.x < o.r || o.x > POSTER_W - o.r) {
        o.x = Math.max(o.r, Math.min(POSTER_W - o.r, o.x));
        o.vx *= -0.7;
      }
      // Tras un rato quieta en el suelo, vuelve a su rama
      const still = Math.abs(o.vy) < 1 && o.y >= FLOOR_Y - o.r - 1;
      o.rest = still ? o.rest + 1 : 0;
      if (o.rest > 150) hangBack(o);
    }
    const dx = o.x - o.hx;
    const dy = o.y - o.ballY;
    if (o.state !== 'hanging') {
      o.g.setAttribute('transform', `translate(${dx.toFixed(1)} ${dy.toFixed(1)})`);
    }
  }
}

function hangBack(o) {
  o.state = 'hanging';
  o.angle = 0;
  o.vel = 0.15;
  o.rest = 0;
  o.string.removeAttribute('visibility');
  o.g.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: 'ease-out' });
}

// Agarrar: primero una bola; si no hay, un nudo de guirnalda
function grabTree(event) {
  suppressClick = false;
  if (mouse.x === null) return;
  const { x, y } = getPosterCoords(event);

  for (const o of treeOrnaments) {
    const ball = ballPosition(o);
    if (o.state !== 'held' && Math.hypot(ball.x - x, ball.y - y) < o.r + 12) {
      o.state = 'held';
      o.x = ball.x;
      o.y = ball.y;
      o.string.setAttribute('visibility', 'hidden');
      grabbed = { type: 'ornament', ornament: o };
      suppressClick = true;
      event.preventDefault();
      return;
    }
  }
  for (const rope of ropes) {
    for (const p of rope.points) {
      if (!p.pinned && Math.hypot(p.x - x, p.y - y) < ROPE_GRAB_RADIUS) {
        grabbed = { type: 'rope', point: p };
        suppressClick = true;
        event.preventDefault();
        return;
      }
    }
  }
}

// Soltar: la bola sale lanzada con la velocidad del ratón
function releaseTree() {
  if (!grabbed) return;
  if (grabbed.type === 'ornament') {
    const o = grabbed.ornament;
    o.state = 'falling';
    o.vx = treeMouse.dx * 0.8;
    o.vy = treeMouse.dy * 0.8;
  }
  grabbed = null;
}

poster.addEventListener('mousedown', grabTree);
window.addEventListener('mouseup', releaseTree);


/* ---- 13d. Luces, estrella y reacciones al ratón ---- */
// mousemove: gelatina, cuerdas, bolas y luces reaccionan al ratón
function touchTree(x, y, dx, dy) {
  treeMouse.dx = dx;
  treeMouse.dy = dy;
  pushJelly(x, y, dx, dy);
  if (!grabbed) brushRopes(x, y, dx, dy);
  for (const o of treeOrnaments) {
    if (o.state !== 'hanging') continue;
    const ball = ballPosition(o);
    if (Math.hypot(ball.x - x, ball.y - y) < SWING_RADIUS) {
      o.vel += dx * 0.004;
    }
  }
  for (const bulb of treeBulbs) {
    if (Math.hypot(bulb.x - x, bulb.y - y) < LIGHT_RADIUS) bulb.lit = 1;
  }
}

// Si sales del cartel con algo agarrado, se suelta
function leaveTree() {
  releaseTree();
}

// click: la estrella salta y una ola de luz recorre las guirnaldas desde el clic
function treeClick(x, y) {
  treeStar.animate(
    [
      { transform: 'translateY(0) rotate(0) scale(1)' },
      { transform: 'translateY(-50px) rotate(180deg) scale(1.3)' },
      { transform: 'translateY(0) rotate(360deg) scale(1)' }
    ],
    { duration: 700, easing: 'cubic-bezier(.3,1.5,.5,1)' }
  );
  for (const bulb of treeBulbs) {
    bulb.delay = Math.round(Math.hypot(bulb.x - x, bulb.y - y) / 12);
  }
}

// Terremoto: todo el árbol tiembla
function shakeTree() {
  treeOrnaments.forEach((o) => { o.vel += random(-0.12, 0.12); });
  for (const rope of ropes) {
    for (const p of rope.points) {
      if (!p.pinned) { p.px += random(-8, 8); p.py += random(-8, 8); }
    }
  }
  for (const tier of jellyTiers) {
    for (const p of tier.points) { p.vx += random(-6, 6); p.vy += random(-6, 6); }
    tier.moving = true;
  }
}

function updateXmasTree() {
  updateJelly();
  updateRopes();
  updateOrnaments();
  for (const bulb of treeBulbs) {
    if (bulb.delay > 0) bulb.delay--;
    else if (bulb.delay === 0) { bulb.lit = 1; bulb.delay = -1; }
    bulb.lit = Math.max(0, bulb.lit - 0.008);
    bulb.el.style.opacity = (0.55 + bulb.lit * 0.45).toFixed(2);
    bulb.el.style.filter = bulb.lit > 0.05
      ? `drop-shadow(0 0 ${(bulb.lit * 12).toFixed(1)}px ${bulb.el.getAttribute('fill')})`
      : '';
  }
}


/* ---------------------------------------------------------
   Inicio
   --------------------------------------------------------- */
function loop() {
  drawSnow();
  drawCrystals();
  drawShreds();
  updateFluid();
  updateGlitch();
  updateTreeTilt();
  updateXmasTree();
  requestAnimationFrame(loop);
}

fitPoster();
window.addEventListener('resize', fitPoster);
loop();
