/* =========================================================
   THE INTERACTIVE POSTER · Fundación ITACA · 21 de diciembre
   "Ningún niño sin regalo"

   Interacciones programadas:
   1. mouseenter  → los regalos se abren, se iluminan y muestran un deseo.
   2. mouseleave  → los regalos se cierran y recuperan su aspecto inicial.
   3. mousemove   → profundidad (fecha, estrellas), luz que sigue al cursor,
                    letras del titular que se elevan y nieve que se aparta.
   Extra: el botón "Dona desde 5 €" es magnético (mouseenter + mousemove +
          mouseleave) y un indicador cuenta los deseos descubiertos.
   ========================================================= */

'use strict';

/* ---------- 1. Configuración y referencias al DOM ---------- */

const CARTEL = { ancho: 848, alto: 1200 };
const RADIO_LETRAS = 170;   // px de influencia del cursor sobre el titular
const RADIO_NIEVE = 110;    // px de influencia del cursor sobre la nieve
const NUM_COPOS = 170;
const ATRACCION = 0.2;      // cuánto sigue el botón al cursor (0 = nada, 1 = todo)

const $ = (selector, contexto = document) => contexto.querySelector(selector);
const $$ = (selector, contexto = document) => [...contexto.querySelectorAll(selector)];

const poster = $('#poster');
const glow = $('#glow');
const fecha = $('#date');
const fechaEco = $('#dateEcho');
const estrella = $('#star');
const sello = $('#seal');
const estrellasLejos = $('#starsFar');
const estrellasCerca = $('#starsNear');
const titular = $('#headline');
const regalos = $$('.gift');
const boton = $('#cta');
const botonTexto = $('#ctaLabel');
const puntosProgreso = $('#progressDots');
const textoProgreso = $('#progressLabel');
const canvas = $('#snow');
const ctx = canvas.getContext('2d');

const estado = {
  escala: 1,
  raton: { x: CARTEL.ancho / 2, y: CARTEL.alto / 2, dentro: false },
  luz: { x: CARTEL.ancho / 2, y: CARTEL.alto / 2 },   // posición suavizada de la luz
  objetivo: { x: 0, y: 0 },                           // cursor normalizado [-1, 1]
  inclinacion: { x: 0, y: 0 },                        // valor suavizado
  viento: 0,
  vientoObjetivo: 0,
  letras: [],
  copos: [],
  abiertos: new Set(),
  completo: false,
  tiempo: 0,
  ultimoFrame: 0,
};

/* ---------- 2. Utilidades ---------- */

const limitar = (valor, min, max) => Math.min(max, Math.max(min, valor));
const interpolar = (a, b, t) => a + (b - a) * t;

function hexARgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mezclarColor(a, b, t) {
  const r = Math.round(interpolar(a[0], b[0], t));
  const g = Math.round(interpolar(a[1], b[1], t));
  const bl = Math.round(interpolar(a[2], b[2], t));
  return `rgb(${r}, ${g}, ${bl})`;
}

/** Convierte las coordenadas del ratón (pantalla) a coordenadas del cartel (848×1200). */
function coordenadasEnCartel(evento) {
  const rect = poster.getBoundingClientRect();
  return {
    x: (evento.clientX - rect.left) / estado.escala,
    y: (evento.clientY - rect.top) / estado.escala,
  };
}

/* ---------- 3. Escalado proporcional del cartel ---------- */

function escalarCartel() {
  const margen = 0.96;
  const escala = Math.min(
    (window.innerWidth * margen) / CARTEL.ancho,
    (window.innerHeight * margen) / CARTEL.alto
  );
  // En la captura (?final) el cartel se muestra a tamaño real si cabe
  estado.escala = new URLSearchParams(location.search).has('final')
    ? Math.min(window.innerWidth / CARTEL.ancho, window.innerHeight / CARTEL.alto)
    : escala;
  poster.style.setProperty('--scale', estado.escala);
}

/* ---------- 4. Construcción de elementos ---------- */

function crearEstrellas(capa, cantidad, tamMax) {
  const fragmento = document.createDocumentFragment();
  for (let i = 0; i < cantidad; i++) {
    const punto = document.createElement('span');
    const tam = 1 + Math.random() * tamMax;
    punto.style.width = `${tam}px`;
    punto.style.height = `${tam}px`;
    punto.style.left = `${Math.random() * 100}%`;
    // más estrellas arriba que abajo
    punto.style.top = `${Math.pow(Math.random(), 1.6) * 100}%`;
    punto.style.animationDelay = `${-Math.random() * 3.2}s`;
    punto.style.animationDuration = `${2 + Math.random() * 3}s`;
    fragmento.appendChild(punto);
  }
  capa.appendChild(fragmento);
}

/** Separa cada línea del titular en <span class="char"> para animar letra a letra. */
function separarLetras() {
  $$('.headline__line', titular).forEach((linea) => {
    const base = hexARgb(linea.dataset.base);
    const hover = hexARgb(linea.dataset.hover);
    const texto = linea.textContent;
    linea.textContent = '';
    linea.setAttribute('aria-label', texto);

    [...texto].forEach((caracter) => {
      const span = document.createElement('span');
      span.className = 'char';
      span.textContent = caracter;
      span.setAttribute('aria-hidden', 'true');
      linea.appendChild(span);
      estado.letras.push({ el: span, base, hover, cx: 0, cy: 0, k: 0 });
    });
  });
}

/**
 * Posición de un elemento dentro del cartel, sumando los offsets hasta llegar a #poster.
 * offsetLeft/offsetTop son relativos al ancestro posicionado más cercano (offsetParent),
 * por eso hay que subir por la cadena de offsetParent y no por la de parentElement.
 * No le afectan ni el escalado ni los transform, así que vale para cualquier pantalla.
 */
function posicionEnCartel(el) {
  let x = 0;
  let y = 0;
  for (let nodo = el; nodo && nodo !== poster; nodo = nodo.offsetParent) {
    x += nodo.offsetLeft;
    y += nodo.offsetTop;
  }
  return { x, y };
}

/** Calcula el centro de cada letra en coordenadas del cartel. */
function medirLetras() {
  estado.letras.forEach((letra) => {
    const { x, y } = posicionEnCartel(letra.el);
    letra.cx = x + letra.el.offsetWidth / 2;
    letra.cy = y + letra.el.offsetHeight / 2;
  });
}

/* ---------- 5. Nieve ---------- */

function prepararCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = CARTEL.ancho * dpr;
  canvas.height = CARTEL.alto * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function crearCopo(inicial) {
  const z = Math.random(); // profundidad: 0 = lejos, 1 = cerca
  return {
    x: Math.random() * CARTEL.ancho,
    y: inicial ? Math.random() * CARTEL.alto : -10,
    r: 0.8 + z * 2.6,
    z,
    vy: 0.3 + z * 1.1,
    vx: 0,
    fase: Math.random() * Math.PI * 2,
  };
}

/** @param {number} paso 1 = un fotograma a 60 fps (así la nieve cae igual en pantallas de 120 Hz). */
function actualizarNieve(paso) {
  const { raton } = estado;

  estado.copos.forEach((copo, i) => {
    copo.fase += (0.01 + copo.z * 0.012) * paso;
    copo.x += (Math.sin(copo.fase) * 0.35 * (0.5 + copo.z) + estado.viento * (0.4 + copo.z) + copo.vx) * paso;
    copo.y += copo.vy * paso;

    // El cursor aparta la nieve, como una mano que protege
    if (raton.dentro) {
      const dx = copo.x - raton.x;
      const dy = copo.y - raton.y;
      const distancia = Math.hypot(dx, dy) || 1;
      if (distancia < RADIO_NIEVE) {
        const fuerza = (1 - distancia / RADIO_NIEVE) * 2.4;
        copo.vx += (dx / distancia) * fuerza * 0.35;
        copo.y += (dy / distancia) * fuerza;
      }
    }
    copo.vx *= 0.92;

    if (copo.x < -10) copo.x = CARTEL.ancho + 10;
    if (copo.x > CARTEL.ancho + 10) copo.x = -10;
    if (copo.y > CARTEL.alto + 10) estado.copos[i] = crearCopo(false);
  });
}

function dibujarNieve() {
  ctx.clearRect(0, 0, CARTEL.ancho, CARTEL.alto);
  estado.copos.forEach((copo) => {
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 248, 235, ${0.3 + copo.z * 0.6})`;
    ctx.arc(copo.x, copo.y, copo.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

/* ---------- 6. INTERACCIÓN 3 · mousemove ---------- */

function manejarMovimiento(evento) {
  const punto = coordenadasEnCartel(evento);

  // la velocidad horizontal del ratón genera viento
  estado.vientoObjetivo = limitar((punto.x - estado.raton.x) * 0.08, -3, 3);

  estado.raton.x = punto.x;
  estado.raton.y = punto.y;
  estado.objetivo.x = limitar((punto.x / CARTEL.ancho) * 2 - 1, -1, 1);
  estado.objetivo.y = limitar((punto.y / CARTEL.alto) * 2 - 1, -1, 1);
}

function entrarEnCartel(evento) {
  const punto = coordenadasEnCartel(evento);
  estado.raton.x = estado.luz.x = punto.x;
  estado.raton.y = estado.luz.y = punto.y;
  estado.raton.dentro = true;
  glow.style.opacity = '1';
}

function salirDelCartel() {
  estado.raton.dentro = false;
  estado.objetivo.x = 0;
  estado.objetivo.y = 0;
  glow.style.opacity = '0';
}

/** Efecto de profundidad: cada capa se mueve a distinta velocidad. */
function actualizarProfundidad() {
  const { inclinacion: inc, luz, tiempo } = estado;

  inc.x = interpolar(inc.x, estado.objetivo.x, 0.08);
  inc.y = interpolar(inc.y, estado.objetivo.y, 0.08);
  luz.x = interpolar(luz.x, estado.raton.x, 0.12);
  luz.y = interpolar(luz.y, estado.raton.y, 0.12);

  fecha.style.transform = `perspective(1000px) rotateY(${inc.x * 8}deg) rotateX(${-inc.y * 6}deg)`;
  fechaEco.style.transform = `translate(${-inc.x * 24}px, ${-inc.y * 18}px)`;
  estrellasLejos.style.transform = `translate(${-inc.x * 10}px, ${-inc.y * 8}px)`;
  estrellasCerca.style.transform = `translate(${-inc.x * 28}px, ${-inc.y * 20}px)`;
  estrella.style.transform = `rotate(${tiempo * 6 + inc.x * 45}deg) scale(${1 + Math.abs(inc.x) * 0.15})`;
  sello.style.transform = `rotate(${inc.x * 90}deg)`;
  glow.style.transform = `translate(${luz.x - 300}px, ${luz.y - 300}px)`;
}

/** Las letras cercanas al cursor se elevan y cambian de color. */
function actualizarTitular() {
  const { raton } = estado;

  estado.letras.forEach((letra) => {
    let objetivo = 0;
    if (raton.dentro) {
      const distancia = Math.hypot(letra.cx - raton.x, letra.cy - raton.y);
      objetivo = Math.max(0, 1 - distancia / RADIO_LETRAS);
    }
    letra.k = interpolar(letra.k, objetivo, 0.15);
    if (letra.k < 0.001 && objetivo === 0) {
      if (letra.k !== 0) {
        letra.k = 0;
        letra.el.style.transform = '';
        letra.el.style.color = '';
      }
      return;
    }
    const giro = limitar((letra.cx - raton.x) / 20, -8, 8) * letra.k;
    letra.el.style.transform = `translateY(${-letra.k * 24}px) rotate(${giro}deg)`;
    letra.el.style.color = mezclarColor(letra.base, letra.hover, letra.k);
  });
}

/* ---------- 7. INTERACCIONES 1 y 2 · mouseenter / mouseleave ---------- */

function partesDeRegalo(regalo) {
  return {
    tapa: $('.gift__lid', regalo),
    caja: $('.gift__box', regalo),
    brillo: $('.gift__glow', regalo),
    deseo: $('.gift__wish', regalo),
  };
}

/** mouseenter: el regalo salta, se abre, se ilumina y muestra el deseo. */
function abrirRegalo(regalo) {
  // Al hacer clic, el regalo recibe también "focus": evitamos abrirlo dos veces
  if (regalo.classList.contains('is-open')) return;
  regalo.classList.add('is-open');

  const { tapa, caja, brillo, deseo } = partesDeRegalo(regalo);
  const giro = Number(regalo.dataset.tilt || 0);

  regalo.style.transform = `translateY(-16px) scale(1.07) rotate(${giro}deg)`;
  tapa.style.transform = 'translate(-8px, -40px) rotate(-18deg)';
  caja.style.filter = 'brightness(1.2) saturate(1.15)';
  brillo.style.opacity = '1';
  deseo.style.opacity = '1';
  deseo.style.transform = 'translate(-50%, -6px) rotate(var(--rot)) scale(1.05)';

  lanzarDestellos(regalo);
  registrarIlusion(regalo);
}

/** mouseleave: el regalo vuelve a su estado inicial (las transiciones CSS lo suavizan). */
function cerrarRegalo(regalo) {
  regalo.classList.remove('is-open');
  const { tapa, caja, brillo, deseo } = partesDeRegalo(regalo);

  regalo.style.transform = '';
  tapa.style.transform = '';
  caja.style.filter = '';
  brillo.style.opacity = '';
  deseo.style.opacity = '';
  deseo.style.transform = '';
}

/** Crea pequeñas chispas que salen disparadas de la caja. */
function lanzarDestellos(regalo, cantidad = 12) {
  const colores = ['#f6c453', '#fff3df', '#ff7a66'];
  for (let i = 0; i < cantidad; i++) {
    const chispa = document.createElement('span');
    const angulo = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
    const distancia = 50 + Math.random() * 70;
    chispa.className = 'spark';
    chispa.style.setProperty('--dx', `${Math.cos(angulo) * distancia}px`);
    chispa.style.setProperty('--dy', `${Math.sin(angulo) * distancia}px`);
    chispa.style.setProperty('--size', `${3 + Math.random() * 5}px`);
    chispa.style.setProperty('--color', colores[i % colores.length]);
    chispa.addEventListener('animationend', () => chispa.remove());
    regalo.appendChild(chispa);
  }
}

/** Recuerda los regalos descubiertos; al llegar a todos, se completa la campaña. */
function registrarIlusion(regalo) {
  if (estado.abiertos.has(regalo)) return;
  estado.abiertos.add(regalo);
  if (estado.abiertos.size === regalos.length) completarCampana();
  else actualizarProgreso();
}

/** Estado final: todos los deseos quedan visibles (es el estado de la captura). */
function completarCampana() {
  if (estado.completo) return;
  estado.completo = true;
  regalos.forEach((regalo) => estado.abiertos.add(regalo));
  poster.classList.add('is-complete');
  actualizarProgreso();
  regalos.forEach((regalo, i) => setTimeout(() => lanzarDestellos(regalo, 16), i * 120));
}

function reiniciarCampana() {
  estado.completo = false;
  estado.abiertos.clear();
  poster.classList.remove('is-complete');
  regalos.forEach(cerrarRegalo);
  actualizarProgreso();
}

/* ---------- 8. Indicador de progreso ---------- */

/** Crea una marca por regalo debajo del mensaje. */
function crearIndicador() {
  regalos.forEach(() => puntosProgreso.appendChild(document.createElement('span')));
}

/** Cada regalo descubierto enciende su marca con el color de su caja. */
function actualizarProgreso() {
  const marcas = [...puntosProgreso.children];

  regalos.forEach((regalo, i) => {
    const marca = marcas[i];
    if (estado.abiertos.has(regalo)) {
      const color = regalo.style.getPropertyValue('--c').trim();
      marca.style.backgroundColor = color;
      marca.style.boxShadow = `0 0 12px ${color}`;
      marca.style.transform = 'scaleY(1.5)';
    } else {
      marca.style.backgroundColor = '';
      marca.style.boxShadow = '';
      marca.style.transform = '';
    }
  });

  const total = regalos.length;
  const vistos = estado.abiertos.size;
  if (estado.completo) {
    textoProgreso.textContent = '¡Todos descubiertos! Ahora, hazlos realidad.';
  } else if (vistos === 0) {
    textoProgreso.textContent = 'Pasa el cursor por los regalos y descubre qué piden';
  } else {
    textoProgreso.textContent = `${vistos} de ${total} deseos descubiertos`;
  }
}

/* ---------- 9. Botón magnético (mouseenter + mousemove + mouseleave) ---------- */

function activarBoton() {
  boton.classList.add('is-active');
}

/** El botón y su texto se desplazan hacia el cursor (el texto un poco más: efecto de profundidad). */
function atraerBoton(evento) {
  const rect = boton.getBoundingClientRect();
  // distancia al centro del botón, convertida a píxeles del cartel
  const dx = (evento.clientX - (rect.left + rect.width / 2)) / estado.escala;
  const dy = (evento.clientY - (rect.top + rect.height / 2)) / estado.escala;

  boton.style.transform = `translate(${dx * ATRACCION}px, ${dy * ATRACCION}px)`;
  botonTexto.style.transform = `translate(${dx * ATRACCION * 0.4}px, ${dy * ATRACCION * 0.4}px)`;
}

/** mouseleave: vuelve a su sitio con rebote (transición CSS). */
function soltarBoton() {
  boton.classList.remove('is-active');
  boton.style.transform = '';
  botonTexto.style.transform = '';
}

/* ---------- 10. Bucle de animación ---------- */

function animar(ahora) {
  // "paso" = fotogramas de 60 fps transcurridos (máx. 3 por si la pestaña estuvo en segundo plano)
  const paso = estado.ultimoFrame ? limitar((ahora - estado.ultimoFrame) / (1000 / 60), 0, 3) : 1;
  estado.ultimoFrame = ahora;

  estado.tiempo += paso / 60;
  estado.vientoObjetivo *= 0.95;
  estado.viento = interpolar(estado.viento, estado.vientoObjetivo, 0.05);

  actualizarProfundidad();
  actualizarTitular();
  actualizarNieve(paso);
  dibujarNieve();

  requestAnimationFrame(animar);
}

/* ---------- 11. Registro de eventos e inicio ---------- */

function registrarEventos() {
  // Interacción 3 · mousemove sobre todo el cartel
  poster.addEventListener('mousemove', manejarMovimiento);
  poster.addEventListener('mouseenter', entrarEnCartel);
  poster.addEventListener('mouseleave', salirDelCartel);

  // Interacciones 1 y 2 · mouseenter / mouseleave en cada regalo
  regalos.forEach((regalo) => {
    regalo.addEventListener('mouseenter', () => abrirRegalo(regalo));
    regalo.addEventListener('mouseleave', () => cerrarRegalo(regalo));
    // accesibilidad: también con teclado (Tab)
    regalo.addEventListener('focus', () => abrirRegalo(regalo));
    regalo.addEventListener('blur', () => cerrarRegalo(regalo));
  });

  // Extra · botón magnético
  boton.addEventListener('mouseenter', activarBoton);
  boton.addEventListener('mousemove', atraerBoton);
  boton.addEventListener('mouseleave', soltarBoton);

  // Atajos: F = estado final (para la captura), R = reiniciar
  document.addEventListener('keydown', (evento) => {
    const tecla = evento.key.toLowerCase();
    if (tecla === 'f') completarCampana();
    if (tecla === 'r') reiniciarCampana();
  });

  window.addEventListener('resize', escalarCartel);
}

function iniciar() {
  escalarCartel();
  prepararCanvas();
  crearEstrellas(estrellasLejos, 90, 1.5);
  crearEstrellas(estrellasCerca, 35, 2.5);
  separarLetras();
  medirLetras();
  crearIndicador();
  actualizarProgreso();
  estado.copos = Array.from({ length: NUM_COPOS }, () => crearCopo(true));

  registrarEventos();

  // Volver a medir cuando cargue la tipografía (cambian los anchos de letra)
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(medirLetras);
  }

  if (new URLSearchParams(location.search).has('final')) completarCampana();

  requestAnimationFrame(animar);
}

iniciar();
