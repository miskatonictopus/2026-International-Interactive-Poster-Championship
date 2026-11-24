/* =====================================================================
   REGALA ILUSIÓN · Fundación ITACA
   main.js — la guirnalda interactiva, con JavaScript vanilla.

   Interacciones principales (todas con addEventListener):
     1. mouseenter sobre un adorno → encenderAdorno()  (brillo + campanada)
     2. mouseleave del adorno      → apagarAdorno()    (vuelve a su estado)
     3. mousemove sobre el cartel  → moverRaton()      (lámpara + viento)

   Extras: física de péndulo, sombras y reflejos calculados según la
   posición del cursor, sonido sintetizado con Web Audio, villancico
   oculto, etiqueta COLABORA, soporte táctil y de teclado.
   ===================================================================== */
'use strict';

/* ---------- 1. Configuración ---------- */
const ANCHO = 848;
const ALTO = 1200;
const GRAVEDAD = 4000;          // px/s²: da periodos de 1,5–2,5 s
const AMORTIGUACION = 1.05;     // pérdida de energía por segundo
const MAX_ANGULO = 0.75;        // rad (≈ 43°)
const RADIO_VIENTO = 36;        // px alrededor de la bola que "empuja" el cursor
const RADIO_HILO = 10;          // px alrededor del hilo para pulsarlo
const LUZ_REPOSO = { x: 150, y: -300 };   // luz de ventana cuando el cursor no está
const PULSO = 0.36;             // s por tiempo del villancico
const COLORES_DESTELLO = ['#D6A84F', '#E9C271', '#FFFFFF', '#F5EAD5'];

// Notas (Hz, una octava por encima para que suenen a cristal)
const SOL = 784.0, LA = 880.0, MI = 659.3, RE = 1174.7, SI = 987.8, DO = 1046.5;

/* Los 13 adornos. Leídos en orden, sus notas forman el principio de
   «Noche de paz» (Gruber, 1818): sol la sol mi · sol la sol mi · re re si · do do (sol) */
const ADORNOS = [
  // REGALA
  { letra: 'R', x: 99,  largo: 175, tam: 118, color: 'rojo',  patron: 'franjas', nota: SOL },
  { letra: 'E', x: 229, largo: 235, tam: 118, color: 'verde', patron: 'puntos',  nota: LA  },
  { letra: 'G', x: 359, largo: 150, tam: 118, color: 'oro',   patron: 'liso',    nota: SOL },
  { letra: 'A', x: 489, largo: 255, tam: 118, color: 'rojo',  patron: 'gajos',   nota: MI  },
  { letra: 'L', x: 619, largo: 195, tam: 118, color: 'verde', patron: 'franjas', nota: SOL },
  { letra: 'A', x: 749, largo: 225, tam: 118, color: 'oro',   patron: 'gajos',   nota: LA  },
  // ILUSIÓN
  { letra: 'I', x: 88,  largo: 470, tam: 104, color: 'oro',   patron: 'liso',    nota: SOL },
  { letra: 'L', x: 200, largo: 545, tam: 104, color: 'verde', patron: 'franjas', nota: MI  },
  { letra: 'U', x: 312, largo: 445, tam: 104, color: 'rojo',  patron: 'puntos',  nota: RE  },
  { letra: 'S', x: 424, largo: 525, tam: 104, color: 'oro',   patron: 'franjas',   nota: RE  },
  { letra: 'I', x: 536, largo: 475, tam: 104, color: 'verde', patron: 'liso',    nota: SI  },
  { letra: 'Ó', x: 648, largo: 565, tam: 104, color: 'rojo',  patron: 'franjas', nota: DO  },
  { letra: 'N', x: 760, largo: 495, tam: 104, color: 'oro',   patron: 'gajos',   nota: DO  },
];

// Villancico: índice del adorno + duración en tiempos (compás de 3/4)
const VILLANCICO = [
  [0, 1.5], [1, 0.5], [2, 1], [3, 3],
  [4, 1.5], [5, 0.5], [6, 1], [7, 3],
  [8, 2], [9, 1], [10, 3],
  [11, 2], [12, 1], [0, 3],
];

const movimientoReducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const sinHover = window.matchMedia('(hover: none)').matches;

/* ---------- 2. Referencias al DOM ---------- */
const cartel = document.getElementById('cartel');
const guirnalda = document.getElementById('guirnalda');
const capaSombras = document.getElementById('sombras');
const luzEl = document.getElementById('luz');
const aviso = document.getElementById('aviso');
const capaDestellos = document.getElementById('destellos');
const cta = document.getElementById('cta');
const pista = document.getElementById('pista');
const botonSonido = document.getElementById('sonido');

/* ---------- 3. Estado ---------- */
const estado = {
  escala: 1,
  luz: { ...LUZ_REPOSO },          // posición suavizada de la luz
  luzObjetivo: { ...LUZ_REPOSO },  // posición del cursor
  raton: { x: 0, y: 0, t: 0, dentro: false },
  tocados: new Set(),
  enVillancico: false,
  ultimoFotograma: 0,
  temporizadorCta: null,
};

const pendulos = [];   // un objeto por adorno con su física y sus elementos

/* =====================================================================
   4. Escalado proporcional del cartel
   ===================================================================== */
function ajustarEscala() {
  const conBarra = window.innerHeight > 600;
  const anchoDisponible = window.innerWidth - 32;
  const altoDisponible = window.innerHeight - (conBarra ? 56 : 32);
  estado.escala = Math.max(0.1, Math.min(1, anchoDisponible / ANCHO, altoDisponible / ALTO));
  document.documentElement.style.setProperty('--escala', estado.escala.toFixed(4));
}

function puntoEnCartel(clientX, clientY) {
  const rect = cartel.getBoundingClientRect();
  return {
    x: (clientX - rect.left) / estado.escala,
    y: (clientY - rect.top) / estado.escala,
  };
}

const azar = (min, max) => Math.random() * (max - min) + min;
const elegir = (lista) => lista[Math.floor(Math.random() * lista.length)];
const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

/* =====================================================================
   5. Creación de la guirnalda
   ===================================================================== */
function crearGuirnalda() {
  ADORNOS.forEach((datos, i) => {
    const adorno = document.createElement('div');
    adorno.className = `adorno c-${datos.color} p-${datos.patron}`;
    adorno.style.left = `${datos.x}px`;
    adorno.style.setProperty('--lc', `${datos.largo}px`);
    adorno.style.setProperty('--d', `${datos.tam}px`);
    adorno.style.setProperty('--i', i);
    adorno.innerHTML = `
      <span class="hilo"></span>
      <span class="anilla"></span>
      <div class="bola-giro">
        <button class="bola" type="button" aria-label="Adorno con la letra ${datos.letra}">
          <span class="bola-letra" aria-hidden="true">${datos.letra}</span>
        </button>
      </div>
      <span class="casquillo"></span>`;

    const sombra = document.createElement('span');
    sombra.className = 'sombra-adorno';
    sombra.style.setProperty('--d', `${datos.tam}px`);
    sombra.style.setProperty('--i', i);

    // Los de la segunda fila van detrás para que sus hilos pasen por detrás de REGALA
    guirnalda.prepend(adorno);
    capaSombras.appendChild(sombra);

    pendulos.push({
      i,
      datos,
      el: adorno,
      bola: adorno.querySelector('.bola'),
      giro: adorno.querySelector('.bola-giro'),
      sombra,
      radio: datos.tam / 2,
      theta: movimientoReducido ? 0 : azar(-0.04, 0.04),
      omega: 0,
      bx: datos.x,
      by: datos.largo,
      ultimaNota: 0,
    });
  });
}

/* =====================================================================
   6. Sonido: campanas sintetizadas con Web Audio
   ===================================================================== */
const sonido = { ctx: null, salida: null, activo: true };

function prepararAudio() {
  if (!sonido.activo) return;
  if (!sonido.ctx) {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return;
    sonido.ctx = new Contexto();
    sonido.salida = sonido.ctx.createGain();
    sonido.salida.gain.value = 0.55;
    const compresor = sonido.ctx.createDynamicsCompressor();
    sonido.salida.connect(compresor).connect(sonido.ctx.destination);
  }
  if (sonido.ctx.state === 'suspended') sonido.ctx.resume();
}

// Una campana = varios parciales inarmónicos que se apagan a distinto ritmo
function campanada(frecuencia, intensidad = 1) {
  const ctx = sonido.ctx;
  if (!sonido.activo || !ctx || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  const parciales = [[1, 1, 1.8], [2.76, 0.42, 0.9], [5.4, 0.22, 0.45], [8.93, 0.1, 0.25]];
  for (const [relacion, volumen, duracion] of parciales) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frecuencia * relacion;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(volumen * 0.16 * intensidad, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duracion);
    osc.connect(env).connect(sonido.salida);
    osc.start(t);
    osc.stop(t + duracion + 0.05);
  }
}

function alternarSonido() {
  sonido.activo = !sonido.activo;
  botonSonido.textContent = sonido.activo ? '♪ Sonido: sí' : '♪ Sonido: no';
  botonSonido.setAttribute('aria-pressed', String(sonido.activo));
  if (sonido.activo) prepararAudio();
}

/* =====================================================================
   7. Partículas
   ===================================================================== */
function lanzarDestellos(x, y, cantidad, fuerza = 90) {
  if (movimientoReducido) cantidad = Math.ceil(cantidad / 3);
  for (let n = 0; n < cantidad; n++) {
    const angulo = (Math.PI * 2 * n) / cantidad + azar(-0.3, 0.3);
    const distancia = azar(fuerza * 0.5, fuerza);
    const destello = document.createElement('span');
    destello.className = `destello${Math.random() < 0.3 ? ' destello--punto' : ''}`;
    destello.style.left = `${x}px`;
    destello.style.top = `${y}px`;
    destello.style.background = elegir(COLORES_DESTELLO);
    destello.style.setProperty('--tam', `${azar(7, 17)}px`);
    destello.style.setProperty('--dx', `${Math.cos(angulo) * distancia}px`);
    destello.style.setProperty('--dy', `${Math.sin(angulo) * distancia}px`);
    destello.style.setProperty('--giro', `${azar(-180, 180)}deg`);
    destello.style.setProperty('--dur', `${azar(700, 1200)}ms`);
    destello.addEventListener('animationend', () => destello.remove(), { once: true });
    capaDestellos.appendChild(destello);
  }
}

/* =====================================================================
   8. INTERACCIÓN 1 · MOUSEENTER — el adorno se enciende y suena
   ===================================================================== */
function encenderAdorno(p) {
  p.bola.classList.add('encendida');   // transform: scale · filter · box-shadow · color
  p.el.style.zIndex = '5';

  const ahora = performance.now();
  if (ahora - p.ultimaNota > 140) {
    campanada(p.datos.nota, 0.9);
    p.ultimaNota = ahora;
  }
  marcarTocado(p);
  pista.classList.add('oculta');
}

/* =====================================================================
   9. INTERACCIÓN 2 · MOUSELEAVE — el adorno vuelve a su estado inicial
   ===================================================================== */
function apagarAdorno(p) {
  p.bola.classList.remove('encendida');
  p.el.style.zIndex = '';
}

/* Extra: clic / toque / Enter — vuelta completa, golpe y destellos */
function pulsarAdorno(p) {
  prepararAudio();
  encenderAdorno(p);
  campanada(p.datos.nota, 1.3);
  if (!movimientoReducido) p.omega += (Math.random() < 0.5 ? -1 : 1) * 2.2 * Math.sqrt(250 / p.datos.largo);

  p.giro.classList.remove('gira');
  void p.giro.offsetWidth;            // reinicia la animación
  p.giro.classList.add('gira');
  lanzarDestellos(p.bx, p.by, 10, 100);
}

function marcarTocado(p) {
  if (estado.enVillancico) return;
  estado.tocados.add(p.i);
  p.el.classList.add('tocado');
  if (estado.tocados.size === ADORNOS.length) {
    estado.enVillancico = true;
    setTimeout(tocarVillancico, 700);
  }
}

/* Final: al tocar los 13 adornos, la guirnalda toca «Noche de paz» sola */
function tocarVillancico() {
  let tiempo = 0;
  VILLANCICO.forEach(([indice, tiempos], n) => {
    setTimeout(() => {
      const p = pendulos[indice];
      p.bola.classList.add('encendida');
      campanada(p.datos.nota, 1);
      if (!movimientoReducido) p.omega += (n % 2 ? 1 : -1) * 1.4 * Math.sqrt(250 / p.datos.largo);
      lanzarDestellos(p.bx, p.by, 6, 70);
      setTimeout(() => p.bola.classList.remove('encendida'), tiempos * PULSO * 1000 * 0.9);
    }, tiempo * 1000);
    tiempo += tiempos * PULSO;
  });

  setTimeout(() => {
    aviso.textContent = 'Noche de paz… ¡gracias por regalar ilusión!';
    aviso.classList.add('visible');
    pendulos.forEach((p) => p.el.classList.remove('tocado'));
    estado.tocados.clear();
  }, tiempo * 1000);

  setTimeout(() => {
    aviso.classList.remove('visible');
    estado.enVillancico = false;
  }, tiempo * 1000 + 4200);
}

/* =====================================================================
   10. INTERACCIÓN 3 · MOUSEMOVE — la lámpara y el viento
   ===================================================================== */
function moverRaton(clientX, clientY) {
  const p = puntoEnCartel(clientX, clientY);
  const ahora = performance.now();
  const r = estado.raton;

  // Velocidad del cursor en px/s (para empujar los adornos)
  const dt = Math.max(8, ahora - r.t) / 1000;
  const vx = r.dentro ? (p.x - r.x) / dt : 0;
  const vy = r.dentro ? (p.y - r.y) / dt : 0;
  estado.raton = { x: p.x, y: p.y, t: ahora, dentro: true };

  // a) La luz sigue al cursor: halo en la pared, reflejos y sombras
  estado.luzObjetivo.x = p.x;
  estado.luzObjetivo.y = p.y;
  luzEl.style.transform = `translate(${p.x}px, ${p.y}px)`;
  luzEl.style.opacity = '1';

  // b) El cursor arrastra el aire: empuja bolas e hilos que roza
  if (!movimientoReducido) empujarAdornos(p.x, p.y, limitar(vx, -3000, 3000), limitar(vy, -3000, 3000));
}

function empujarAdornos(x, y, vx, vy) {
  for (const p of pendulos) {
    const seno = Math.sin(p.theta);
    const coseno = Math.cos(p.theta);
    let fuerza = 0;
    let brazo = p.datos.largo;

    const d = Math.hypot(x - p.bx, y - p.by);
    if (d < p.radio + RADIO_VIENTO) {
      fuerza = d < p.radio ? 1 : 1 - (d - p.radio) / RADIO_VIENTO;
    } else {
      // ¿Está el cursor sobre el hilo? (distancia a un segmento)
      const ax = p.datos.x;
      const hx = p.bx - ax;
      const hy = p.by;
      const t = limitar(((x - ax) * hx + y * hy) / (hx * hx + hy * hy), 0, 1);
      const distanciaHilo = Math.hypot(x - (ax + hx * t), y - hy * t);
      if (distanciaHilo < RADIO_HILO && t > 0.05) {
        fuerza = 0.55 * (1 - distanciaHilo / RADIO_HILO);
        brazo = p.datos.largo * t;
      }
    }

    if (fuerza > 0) {
      // Velocidad del cursor en la dirección en la que puede moverse el péndulo
      const tangencial = vx * coseno - vy * seno;
      const omegaCursor = tangencial / brazo;
      p.omega += (omegaCursor - p.omega) * 0.3 * fuerza;
    }
  }
}

function salirDelCartel() {
  estado.raton.dentro = false;
  estado.luzObjetivo = { ...LUZ_REPOSO };
  luzEl.style.opacity = '0';
}

/* =====================================================================
   11. Bucle de animación: física + luz + sombras
   ===================================================================== */
function animar(tiempo) {
  const dt = Math.min(0.033, (tiempo - estado.ultimoFotograma) / 1000 || 0.016);
  estado.ultimoFotograma = tiempo;

  // La luz persigue al cursor con suavidad
  estado.luz.x += (estado.luzObjetivo.x - estado.luz.x) * 0.14;
  estado.luz.y += (estado.luzObjetivo.y - estado.luz.y) * 0.14;
  const lx = estado.luz.x;
  const ly = estado.luz.y;

  for (const p of pendulos) {
    const { x, largo } = p.datos;

    if (!movimientoReducido) {
      // Péndulo: θ'' = −(g/L)·(sen θ − brisa). La brisa es una ola lenta que recorre la guirnalda
      const brisa = 0.028 * Math.sin(tiempo * 0.0007 + x * 0.006) + 0.012 * Math.sin(tiempo * 0.0017 + p.i * 1.7);
      const aceleracion = -(GRAVEDAD / largo) * (Math.sin(p.theta) - brisa);
      p.omega += aceleracion * dt;
      p.omega *= Math.exp(-AMORTIGUACION * dt);
      p.theta = limitar(p.theta + p.omega * dt, -MAX_ANGULO, MAX_ANGULO);
    }

    const seno = Math.sin(p.theta);
    const coseno = Math.cos(p.theta);
    p.el.style.transform = `rotate(${p.theta.toFixed(4)}rad)`;

    // Centro de la bola en coordenadas del cartel
    p.bx = x + seno * largo;
    p.by = coseno * largo;

    // Dirección hacia la luz
    const dx = lx - p.bx;
    const dy = ly - p.by;
    const distancia = Math.hypot(dx, dy) || 1;
    const nx = dx / distancia;
    const ny = dy / distancia;

    // Reflejo: la dirección se pasa a coordenadas locales de la bola (que está girada θ)
    const localX = nx * coseno + ny * seno;
    const localY = -nx * seno + ny * coseno;
    p.bola.style.setProperty('--hx', `${(50 + localX * 26).toFixed(1)}%`);
    p.bola.style.setProperty('--hy', `${(50 + localY * 26).toFixed(1)}%`);

    // Sombra: en sentido contrario a la luz y más lejos cuanto más lejos está la lámpara
    const desplazamiento = 12 + 34 * Math.min(distancia, 900) / 900;
    const sx = p.bx - nx * desplazamiento - p.radio;
    const sy = p.by - ny * desplazamiento - p.radio;
    p.sombra.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
  }

  requestAnimationFrame(animar);
}

/* =====================================================================
   12. COLABORA
   ===================================================================== */
function pulsarColabora() {
  prepararAudio();
  const caja = cta.getBoundingClientRect();
  const centro = puntoEnCartel(caja.left + caja.width / 2, caja.top + caja.height / 2);
  lanzarDestellos(centro.x, centro.y, 22, 140);
  campanada(SOL, 1);
  setTimeout(() => campanada(RE, 0.8), 120);

  clearTimeout(estado.temporizadorCta);
  cta.classList.add('girada');
  cta.setAttribute('aria-label', '¡Gracias por colaborar!');
  estado.temporizadorCta = setTimeout(() => {
    cta.classList.remove('girada');
    cta.removeAttribute('aria-label');
  }, 2400);
}

/* =====================================================================
   13. Registro de eventos (addEventListener)
   ===================================================================== */
function registrarEventos() {
  for (const p of pendulos) {
    // Interacciones 1 y 2
    p.bola.addEventListener('mouseenter', () => encenderAdorno(p));
    p.bola.addEventListener('mouseleave', () => apagarAdorno(p));
    p.bola.addEventListener('click', () => pulsarAdorno(p));
    // Teclado: el foco equivale a pasar el cursor
    p.bola.addEventListener('focus', () => encenderAdorno(p));
    p.bola.addEventListener('blur', () => apagarAdorno(p));
  }

  // Interacción 3
  cartel.addEventListener('mousemove', (e) => moverRaton(e.clientX, e.clientY));
  cartel.addEventListener('mouseleave', salirDelCartel);

  // Táctil: deslizar el dedo mueve la luz y empuja los adornos
  cartel.addEventListener('touchmove', (e) => {
    const toque = e.touches[0];
    if (toque) moverRaton(toque.clientX, toque.clientY);
  }, { passive: true });
  cartel.addEventListener('touchend', salirDelCartel, { passive: true });

  // Los navegadores solo permiten sonido tras un gesto del usuario
  document.addEventListener('pointerdown', prepararAudio);
  document.addEventListener('keydown', prepararAudio);

  cta.addEventListener('click', pulsarColabora);
  botonSonido.addEventListener('click', alternarSonido);
  window.addEventListener('resize', ajustarEscala);
}

/* =====================================================================
   14. Arranque
   ===================================================================== */
function iniciar() {
  ajustarEscala();
  document.body.classList.add('escala-lista');
  if (location.hash === '#captura') document.body.classList.add('captura');
  if (sinHover) pista.textContent = 'Toca los adornos · desliza el dedo para moverlos';

  crearGuirnalda();
  registrarEventos();

  const fuentesListas = document.fonts ? document.fonts.ready : Promise.resolve();
  fuentesListas.then(() => cartel.classList.add('listo'));

  requestAnimationFrame(animar);
}

iniciar();
