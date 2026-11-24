'use strict';

/* ==========================================================================
   Cartel digital interactivo · Associació Educativa Itaca · v4
   «Cap nen hi juga.»

   Interacciones (todas con addEventListener, ninguna con :hover de CSS):
     1. mouseenter  en .bola → la escarcha baja un 4 % y el reescarchado va lento
     2. mouseleave  en .bola → el reescarchado se acelera
     3. mousemove   en .bola → borra escarcha + hover de los juguetes + agitado
     4. mousedown   en .bola → coge el juguete destapado que hay bajo el cursor
     5. mouseup     en window → lo suelta: sale con inercia y rebota en el cristal
   El color de HI JUGA sigue a la escarcha: verde casi negro con la bola
   empañada y crema con la bola limpia.
   Además, mousemove en document mueve el ambiente: polvo, haz, brillo,
   sombra e inclinación de la bola. Detrás de todo, una nevada de fondo.
   El agitado hace temblar el titular.

   Regla de oro: los handlers solo GUARDAN datos. Todo el dibujo se hace
   dentro de requestAnimationFrame (función bucle).

   Técnicas adaptadas (ver créditos en README.md):
   · Escarcha: brocha con calvas, cristales en el borde del trazo y gotas
     que resbalan → "Fogged Glass", de Aakash Mehra.
   · Nieve: motor de profundidad, viento, repulsión y tormenta → pen de
     iamjamie (CodePen); forma de copo de seis puntas → pen de iautomation.
   ========================================================================== */

/* -------------------------------------------------------------------------
   Constantes
   ------------------------------------------------------------------------- */
const ANCHO = 848;
const ALTO = 1200;

const LADO_BOLA = 770;          // .bola y canvas: 770 × 770
const RADIO_BOLA = 385;
const CENTRO = 385;             // centro de la bola en sus coordenadas
const CENTRO_CARTEL_X = 424;    // centro de la bola en coordenadas del cartel
const CENTRO_CARTEL_Y = 670;

// Escarcha
const OPACIDAD_ESCARCHA = 0.93;
const OPACIDAD_ESCARCHA_TOCADA = 0.89;   // −4 % al notar la mano
const GROSOR_TRAZO = 90;
const RADIO_BROCHA = GROSOR_TRAZO / 2;
const UMBRAL_ALFA = 60;                  // por debajo de esto, el píxel cuenta como limpio

// Reescarchado progresivo. La escarcha nunca se retira sola: lo que no se
// limpia se queda, y lo limpio se vuelve a empañar (si es toda la bola, toda).
const SEG_REESCARCHADO = 30;             // ratón dentro: segundos hasta que el centro vuelve del todo
const SEG_REESCARCHADO_FUERA = 12;       // ratón fuera: también poco a poco, sin cerrarse de golpe
const FACTOR_BORDE = 2.5;                // el borde se empaña más rápido que el centro
const PAUSA_TRAS_TRAZO = 1500;           // ms que el cristal se queda limpio antes de empañarse
const PASO_BORDE = 4;                    // niveles de alfa (de 255) por paso de la capa del borde
const TANDA = 200;                       // ms entre tandas de desvanecido de los cristales

// Gotas de deshielo
const MAX_GOTAS = 3;

// Resplandor cálido: 8 % de base + hasta 55 % según lo limpio
const RESPLANDOR_BASE = 0.08;
const RESPLANDOR_EXTRA = 0.55;

// Nieve
const UMBRAL_AGITADO = 1.2;              // px/ms
// Caída continua: la bola siempre tiene vida dentro. Con el nivel medio,
// un copo cruza la bola en ~10–17 s; los cercanos el doble de rápido y los lejanos la mitad.
const VEL_CAIDA = [0.035, 0.06];         // px/ms, se multiplica por la velocidad del nivel
const BALANCEO = 0.015;                  // px/ms de vaivén lateral
const DURACION_FUNDIDO = 1800;           // ms que un copo posado tarda en fundirse y renacer arriba
const PASOS = 8;                         // rotaciones pre-renderizadas por sprite
const GIRO = Math.PI / 3;                // una estrella de seis puntas se repite cada 60°
const VROT_MAX = 0.0008;                 // rad/ms
const RADIO_EMPUJE = 90;                 // hasta dónde aparta el cursor a los copos
const TORMENTA_MAX = 3.5;                // cuánto se acelera la nieve al agitar
const DURACION_TORMENTA = 2500;          // ms hasta que se calma
const SUAVIZADO_INCLINACION = 0.02;      // inercia de la deriva lateral
const SUAVIZADO_TORMENTA = 0.05;         // entrada y salida de tormenta y refuerzos

// Refracción del borde: la escena y los copos se comprimen contra el filo, como en una lente
const LADO_ESCENA = 1040;                // la escena se pinta hasta radio 520 (la lente muestrea fuera)
const PASOS_REFRACCION = 28;             // anillos concéntricos
const U0 = 0.70;                         // radio relativo donde empieza a deformar
const COMPRESION = 0.74;                 // escala en el borde mismo
const P_COPOS = 2.2;                     // curva de compresión de los copos
// Fondo de la escena: la parte baja de un árbol de Navidad (foto 1024 × 1024), con
// sus bolas, luces y regalos. Se compone en el canvas de 1040 y se refracta.
// Encaje: escala 1,06 y desplazada para que el pie de los regalos de la foto
// (y = 950) caiga en y = 740 de la escena (855 del cartel), justo detrás de donde
// se apoyan los juguetes. Así los juguetes quedan delante de los regalos y sobre la
// nieve de la foto. Cubre todo el ancho y el alto de la escena hasta y = 818, que
// queda bajo la duna (la duna tapa el borde inferior de la foto).
const FONDO = {
    src: 'assets/fondo.webp',
    x: -22.7,                        // (1040 − 1024 · 1,06) / 2: centrada en horizontal
    y: -267,                         // 740 − 950 · 1,06
    escala: 1.06
};
// Difuminado del fondo: profundidad de campo. Los juguetes van nítidos delante y el
// árbol, desenfocado detrás, no compite con ellos ni con el titular.
// Subir el número para más desenfoque (a partir de 8 px las bolas se convierten en manchas).
const DIFUMINADO_FONDO = 'blur(4px)';

// Resplandor y cáustica crecen con lo limpio
const CAUSTICA_BASE = 0.15;
const CAUSTICA_EXTRA = 0.6;

// Juguetes. cx, cy: centro BASE en coordenadas de .bola (cartel − 39, − 285) = centro
// del slot en style.css. Dos bandas, grandes y muy juntos (la bola está llena):
//   arriba → ós (377, 694) · trompeta (549, 698) · ioiò (689, 649)
//   abajo  → robot (275, 815) · tren (487, 807) · pilota (427, 915), delante
// El tren es grande (372 × 100) y cruza la bola por el centro: así se lee largo.
// rx, ry: semiejes de la zona de detección. Es una elipse y no un círculo: el tren
// es 3,7 veces más largo que alto y un círculo de su alto no lo cubriría.
// sigue: cuánto del desplazamiento horizontal copia la sombra (null = sin sombra).
//
// Animación: cada parámetro es la SUMA DE DOS SENOS (medido sobre el cartel Bachelor
// Presentation de Michel Bütepage, The Moving Poster):
//   [amplitud lenta, periodo lento (ms), amplitud rápida, periodo rápido (ms)]
// Un solo seno es un péndulo y el bucle se nota a los tres segundos; dos con periodos
// que no son múltiplos entre sí nunca se repiten igual y se leen como algo vivo.
// x, y en px; rot en grados. Los recorridos son cortos a propósito: con seis juguetes
// grandes en el cristal, recorridos más largos los harían chocar todavía más.
// Encima, cada uno puede tener su animación PROPIA (rodar, tren, robot, ioio), que
// sobrescribe lo que toque (ver ANIMACIONES).
//
// NINGÚN periodo es igual ni múltiplo de otro (×1 y ×2 con un 3 % de tolerancia, ×3
// exacto): si dos coinciden, esos dos juguetes se sincronizan y el conjunto parece un
// salvapantallas. Comprobado con un script. Los valores del documento chocaban entre
// sí (4900 dos veces, 1900 dos veces, 3400 = 2 × 1700, 5700 = 3 × 1900), así que se
// han movido lo mínimo, nunca más de un 8 %. Al añadir un objeto, comprobarlo de nuevo.
//
// Ninguno se sale del cristal: comprobadas las cuatro esquinas reales de cada slot, ya
// giradas (la pelota y el ioiò, como discos), durante la animación y con la subida del
// hover. Límite: 340 px del centro (45 de aire respecto al borde). Ninguno sube por
// encima de y = 572 del cartel: la tinta de HI JUGA acaba en 565.
//
// caja: lo que ocupa cada juguete, para que al arrastrarlo no salga del cristal
// (ver cabeEnLaBola). w × h es el slot (o r, el radio, en los redondos: la pelota y
// el ioiò, con el margen transparente de la foto descontado). mx, arriba y abajo: lo
// que su animación lo aleja de la base hacia cada lado (el ioiò solo baja).
const JOGUINES = [
    {   // Grande, bajo el titular. Solo deriva, corta: arriba tiene el titular y abajo
        // el tren. Flota: sin sombra
        id: 'joguina-os', sombra: null, cx: 338, cy: 409, rx: 70, ry: 90,
        caja: { w: 148.8, h: 185.1, mx: 14, arriba: 8, abajo: 8 },
        fase: 5.2, sigue: null,
        x: [11, 6800, 3, 3300], y: [6, 4300, 1.5, 1500], rot: [5, 3950, 1.5, 2500]
    },
    {   // Rueda ±40 px de lado a lado: el giro sale del recorrido (ANIMACIONES.rodar)
        id: 'joguina-pilota', sombra: 'sombra-pilota', cx: 388, cy: 630, rx: 87, ry: 87,
        caja: { r: 82.7, mx: 41, arriba: 7, abajo: 7 },
        fase: 2.6, sigue: 1, propia: 'rodar',
        x: [35, 8300, 6, 3100], y: [5, 5600, 1.5, 1900]
    },
    {   // Cuelga de una rama, arriba: solo deriva. Sin sombra de contacto
        id: 'joguina-trompeta', sombra: null, cx: 510, cy: 413, rx: 105, ry: 72,
        caja: { w: 213.5, h: 153.2, mx: 22, arriba: 12, abajo: 12 },
        fase: 0.0, sigue: null,
        x: [18, 7050, 4, 2600], y: [10, 4800, 2, 1750], rot: [9, 3650, 2.5, 1200]
    },
    {   // Avanza y retrocede con inercia (ANIMACIONES.tren). Al ser largo, le basta un
        // recorrido corto (±18 px) para que se note que anda
        id: 'joguina-tren', sombra: 'sombra-tren', cx: 448, cy: 522, rx: 180, ry: 50,
        caja: { w: 372, h: 99.5, mx: 18, arriba: 3, abajo: 3 },
        fase: 1.3, sigue: 1, propia: 'tren',
        x: [15, 9100, 3, 2900]
    },
    {   // Anda a saltos, como un juguete de cuerda (ANIMACIONES.robot)
        id: 'joguina-robot', sombra: 'sombra-robot', cx: 236, cy: 530, rx: 48, ry: 100,
        caja: { w: 98.9, h: 206, mx: 28, arriba: 4, abajo: 0 },
        fase: 4.4, sigue: 1, propia: 'robot'
    },
    {   // Sube y baja por el cordel (ANIMACIONES.ioio); solo la x deriva. Está en el aire:
        // sin sombra. El cordel cuelga de x = 689 (index.html, #cordill-ioio)
        id: 'joguina-ioio', sombra: null, cx: 650, cy: 364, rx: 58, ry: 58,
        caja: { r: 58, mx: 9, arriba: 0, abajo: 60 },
        fase: 3.1, sigue: null, propia: 'ioio',
        x: [7, 7550, 2, 3200]
    }
];
const ELEVACION_HOVER = 14;              // px que sube al hover: la misma que en style.css (.activo)
const RADIO_PELOTA = 87;                 // radio REAL de la pelota en px (174 / 2)
const PASO_ROBOT = 625;                  // ms por paso
const SALT_ROBOT = 8;                    // px por paso: ±28 px en total
const BOTE_TREN = 430;                   // el traqueteo: sin(t / 430), un ciclo cada 2,7 s
const CICLE_IOIO = 2050;                 // ms por subida y bajada
const CAIGUDA_IOIO = 60;                 // px que baja

// Color de HI JUGA dentro de la bola, según la escarcha que quede (colorTitular)
const COLOR_EMPANADA = [0x16, 0x20, 0x1A];   // #16201A: 9,95:1 sobre la escarcha (#C6C9BE)
const COLOR_LIMPIA = [0xE8, 0xDF, 0xCF];     // #E8DFCF: 6,50:1 sobre el árbol (#664435)
const CADENCIA_MEDIDA = 180;             // ms entre mediciones de la escarcha (~5 por segundo)

// Nevada de fondo (pluja): copos que caen como lluvia sobre el muro, detrás de la bola.
// Discreta a propósito: pocos, pequeños y tenues. Cada copo tiene una profundidad z
// (0 = lejos, 1 = cerca) que decide a la vez su tamaño, su velocidad y su opacidad:
// los cercanos son más grandes, más rápidos y algo más visibles. Caen casi rectos,
// con un poco de viento, a velocidad constante, como la lluvia.
const PLUJA = {
    N: 90,                               // muchos caen detrás de la bola o del titular
    MIDA: [5, 13],                       // px
    VEL: [0.05, 0.13],                   // px/ms: cruzan el cartel en 9–24 s
    OPACITAT: [0.10, 0.30],
    VENT: 0.12,                          // px de deriva lateral por px de caída
    VROT: 0.0006                         // rad/ms, como mucho
};

// Motas de polvo del fondo: [x, y, radio]. Todas fuera de la silueta de la bola
// (detrás de ella no se verían). Son 26 y no 14: fuera del haz casi no se ven,
// así que hacen falta más para que se noten las que se encienden.
const POLVO = [
    [58, 40, 2.5],  [150, 60, 3.5],  [268, 44, 2.5],  [392, 74, 4],
    [524, 54, 3],   [648, 102, 3.5], [726, 56, 2.5],  [812, 140, 3],
    [96, 118, 2.5], [206, 150, 3],   [338, 128, 2.5], [452, 168, 3],
    [584, 186, 2.5], [40, 196, 3],   [124, 256, 3],   [232, 212, 4],
    [302, 264, 3],  [398, 236, 2.5], [472, 252, 3.5], [628, 260, 3],
    [764, 248, 2.5], [176, 330, 3.5], [92, 410, 3],   [30, 520, 2.5],
    [796, 380, 3],  [262, 300, 2.5]
];

// Haz de luz (coordenadas del cartel). Su línea central pasa por (120, 0) con
// dirección (500, 1100); el barrido CSS gira ±3,5° alrededor de PIVOTE_HAZ.
const HAZ_X = 120;
const HAZ_Y = 0;
const HAZ_DIR = Math.hypot(500, 1100);
const HAZ_NX = 1100 / HAZ_DIR;           // normal unitaria a la línea central
const HAZ_NY = -500 / HAZ_DIR;
const ANCHO_HAZ = 190;                   // a esta distancia de la línea central, la mota ya está apagada
const PIVOTE_HAZ = { x: 30, y: -200 };   // el mismo que transform-origin en style.css
const GIRO_HAZ = 3.5 * Math.PI / 180;
const PERIODO_HAZ = 22000;               // ms, el de la animación barrido

// La bola se inclina hacia el cursor. A partir de 5° el círculo se delata como elipse
const MAX_GRADOS = 3;
const PERSPECTIVA = 1800;                // px

// El titular tiembla cuando la tormenta pasa de este umbral (tormenta va de 1 a TORMENTA_MAX)
const UMBRAL_TEMBLOR = 1.35;
const AMPLITUD_TEMBLOR = 2.2;            // px por unidad de tormenta: ±2,75 px como máximo
const CADENCIA_TEMBLOR = 50;             // ms entre sacudidas: deja trabajar a la transición de 120 ms

// Movimiento reducido: la nieve queda quieta, sin agitado ni gotas
const menosMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)');

/* -------------------------------------------------------------------------
   Elementos del DOM
   ------------------------------------------------------------------------- */
const escenario = document.getElementById('escenario');
const bola = document.getElementById('bola');
const canvas = document.getElementById('escarcha');
const ctx = canvas.getContext('2d');
const canvasHumedad = document.getElementById('humedad');
const ctxHumedad = canvasHumedad.getContext('2d');
const ctxNieveFondo = document.getElementById('nieve-fondo').getContext('2d');
const canvasNieveMedia = document.getElementById('nieve-media');
const ctxNieveMedia = canvasNieveMedia.getContext('2d');
const ctxNieveCerca = document.getElementById('nieve-cerca').getContext('2d');
const escenaInterior = document.getElementById('escena-interior');
const escenaVector = document.getElementById('escena-vector');
const canvasEscena = document.getElementById('escena-refractada');
const resplandor = document.getElementById('resplandor');
const caustica = document.getElementById('caustica');
const inclinable = document.getElementById('bola-inclinable');
const grupoBrillo = document.getElementById('brillo');
const hazParallax = document.getElementById('haz-parallax');
const hazLuz = document.getElementById('haz-luz');
const palabras = [...document.querySelectorAll('.titular .palabra')];
const sombraLarga = document.getElementById('sombra-larga');
const grupoPolvo = document.getElementById('polvo');
const titular = document.querySelector('.titular');
const palabrasEscarcha = [...document.querySelectorAll('.titular .l2 .palabra')];   // HI JUGA
const cordill = document.getElementById('cordill-ioio');
const ctxNeuFons = document.getElementById('neu-fons').getContext('2d');

/* -------------------------------------------------------------------------
   Estado
   ------------------------------------------------------------------------- */
let escala = 1;                 // ¡TODAS las coordenadas del ratón se dividen por ella!

let ratonDentro = false;
let cursorBola = null;          // posición del ratón dentro de .bola (o null si está fuera)
let ultimoTrazo = null;         // último punto ya dibujado en la escarcha
let trazoPendiente = false;     // hay movimiento nuevo que dibujar en el próximo frame
let ultimoTrazoMs = -Infinity;  // cuándo se limpió por última vez (para la pausa)

let muestraAnterior = null;     // para calcular la velocidad del cursor
let velocidad = 0;
let ultimoAgitado = 0;

let mascaraSucia = true;        // hay que recomponer el canvas visible
let acumMedida = 0;             // ms desde la última medición de la escarcha
let sumaInicial = 0;            // alfa total con la escarcha completa (se mide UNA vez)
let pctEscarcha = 100;          // % de escarcha que queda (resplandor y color del titular)
let ultimoColorTitular = '';    // para tocar el DOM solo cuando el color cambia
let acumuladoBorde = 0;         // niveles de alfa pendientes de aplicar en el reescarchado
let acumuladoCentro = 0;
let acumuladoHumedad = 0;       // ms acumulados para la siguiente tanda de los cristales
let desvanecidoHumedad = 0;     // suma de tandas desde el último trazo (2,5 = desvanecidos del todo)

const gotas = [];

let inclinacion = 0;            // deriva lateral de la nieve (la bola "se ladea")
let tormenta = 1;               // multiplicador global de la nieve tras agitar
let refuerzos = 0;              // visibilidad de los copos de refuerzo (0–1)
let finTormenta = 0;

const cursorCartel = { x: CENTRO_CARTEL_X, y: CENTRO_CARTEL_Y };   // objetivo (cartel)
const cursorSuave = { x: CENTRO_CARTEL_X, y: CENTRO_CARTEL_Y };    // seguido con suavizado

let ultimaInclinacion = '';     // para no reescribir el transform de la bola si no cambia
let temblando = false;
let ultimoTemblor = 0;

let ultimoFrame = performance.now();

/* -------------------------------------------------------------------------
   Utilidades
   ------------------------------------------------------------------------- */
function distancia(x1, y1, x2, y2) {
    return Math.hypot(x2 - x1, y2 - y1);
}

function limitar(valor, min, max) {
    return Math.min(Math.max(valor, min), max);
}

function aleatorio(min, max) {
    return min + Math.random() * (max - min);
}

function interpolar([min, max], t) {
    return min + (max - min) * t;
}

function crearCanvas(lado, opciones) {
    const c = document.createElement('canvas');
    c.width = lado;
    c.height = lado;
    return { canvas: c, ctx: c.getContext('2d', opciones) };
}

/* -------------------------------------------------------------------------
   Escalado: el cartel se escala entero y se centra en la ventana
   ------------------------------------------------------------------------- */
function ajustarEscala() {
    escala = Math.min(window.innerWidth / ANCHO, window.innerHeight / ALTO);
    const desplX = (window.innerWidth - ANCHO * escala) / 2;
    const desplY = (window.innerHeight - ALTO * escala) / 2;
    escenario.style.transform = `translate(${desplX}px, ${desplY}px) scale(${escala})`;
    return escala;
}

/* -------------------------------------------------------------------------
   Escarcha

   Se trabaja con una máscara de cobertura fuera de pantalla:
   · mascara: blanca, solo importa su alfa = cuánta escarcha hay en cada
     píxel. Aquí se borra (brocha) y aquí se reescarcha.
   · #escarcha (visible): textura de escarcha recortada por la máscara.

   ¿Por qué no reescarchar con source-over directamente sobre la textura,
   ni siquiera por tandas? Porque source-over crece en proporción a lo que
   falta (255 − alfa): en cuanto ese incremento baja de medio nivel, el
   redondeo de 8 bits lo deja a 0 y la escarcha se queda atascada en torno
   al 94 %. Las zonas limpiadas quedarían marcadas para siempre. Sumando
   con 'lighter' sobre la máscara blanca, el incremento es constante, se
   acumula en niveles enteros y la escarcha llega al 100 %.
   ------------------------------------------------------------------------- */
const { canvas: mascara, ctx: ctxMascara } = crearCanvas(LADO_BOLA, { willReadFrequently: true });

// Fragmento de hielo: círculo claro con un brillo arriba a la izquierda (la luz del cartel)
function dibujarCristal(c, x, y, r) {
    c.fillStyle = `rgba(237, 228, 212, ${0.3 + Math.random() * 0.3})`;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
    if (r > 1.4) {
        c.fillStyle = 'rgba(255, 255, 255, 0.7)';
        c.beginPath();
        c.arc(x - r * 0.3, y - r * 0.35, r * 0.22, 0, Math.PI * 2);
        c.fill();
    }
}

// Textura de escarcha (se crea una vez)
function crearTexturaEscarcha() {
    const { canvas: textura, ctx: t } = crearCanvas(LADO_BOLA);

    t.fillStyle = '#DCE3E0';
    t.fillRect(0, 0, LADO_BOLA, LADO_BOLA);

    // Volumen: más claro en el centro, algo más denso en el borde del cristal
    const radial = t.createRadialGradient(CENTRO, CENTRO, 60, CENTRO, CENTRO, RADIO_BOLA);
    radial.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
    radial.addColorStop(1, 'rgba(110, 128, 118, 0.20)');
    t.fillStyle = radial;
    t.fillRect(0, 0, LADO_BOLA, LADO_BOLA);

    // Más densa abajo, donde se acumula
    const vertical = t.createLinearGradient(0, 0, 0, LADO_BOLA);
    vertical.addColorStop(0, 'rgba(255, 255, 255, 0.06)');
    vertical.addColorStop(1, 'rgba(255, 255, 255, 0.14)');
    t.fillStyle = vertical;
    t.fillRect(0, 0, LADO_BOLA, LADO_BOLA);

    // Grano cristalino
    for (let i = 0; i < 7000; i++) {
        const tam = Math.random() < 0.8 ? 1 : 2;
        t.fillStyle = Math.random() < 0.55
            ? 'rgba(255, 255, 255, 0.40)'
            : 'rgba(120, 140, 132, 0.16)';
        t.fillRect(Math.random() * LADO_BOLA, Math.random() * LADO_BOLA, tam, tam);
    }

    // Cristales de hielo que crecen desde el borde hacia dentro
    t.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    t.lineWidth = 0.9;
    t.lineCap = 'round';
    t.beginPath();
    for (let i = 0; i < 170; i++) {
        const angulo = Math.random() * Math.PI * 2;
        const r0 = RADIO_BOLA - Math.random() * 120;
        const largo = aleatorio(12, 42);
        const x0 = CENTRO + Math.cos(angulo) * r0;
        const y0 = CENTRO + Math.sin(angulo) * r0;
        const dir = angulo + Math.PI + aleatorio(-0.45, 0.45);
        const x1 = x0 + Math.cos(dir) * largo;
        const y1 = y0 + Math.sin(dir) * largo;
        t.moveTo(x0, y0);
        t.lineTo(x1, y1);
        for (const lado of [-1, 1]) {
            const k = aleatorio(0.3, 0.7);
            const bx = x0 + (x1 - x0) * k;
            const by = y0 + (y1 - y0) * k;
            const bDir = dir + lado * 0.75;
            const bLargo = largo * aleatorio(0.2, 0.4);
            t.moveTo(bx, by);
            t.lineTo(bx + Math.cos(bDir) * bLargo, by + Math.sin(bDir) * bLargo);
        }
    }
    t.stroke();

    // Condensación: más cristalitos abajo. Los grandes "absorben" la
    // escarcha de alrededor y dejan un halo más limpio.
    for (let i = 0; i < 1400; i++) {
        const x = Math.random() * LADO_BOLA;
        const y = LADO_BOLA * Math.sqrt(Math.random());   // sesgo hacia abajo
        const r = 0.4 + Math.random() ** 2.5 * 2;
        if (r > 1.6) {
            const halo = t.createRadialGradient(x, y, r * 0.9, x, y, r * 1.9);
            halo.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
            halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
            t.save();
            t.globalCompositeOperation = 'destination-out';
            t.fillStyle = halo;
            t.fillRect(x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
            t.restore();
        }
        dibujarCristal(t, x, y, r);
    }

    return textura;
}

// Máscara radial con tramado: transparente en el centro, opaca en el borde.
// Hace que la escarcha se cierre desde el borde hacia dentro. El ruido por
// píxel evita que el redondeo de 8 bits la convierta en anillos.
function crearMascaraBorde() {
    const { canvas: c, ctx: t } = crearCanvas(LADO_BOLA);
    const imagen = t.createImageData(LADO_BOLA, LADO_BOLA);
    const datos = imagen.data;
    for (let y = 0; y < LADO_BOLA; y++) {
        for (let x = 0; x < LADO_BOLA; x++) {
            const r = distancia(x + 0.5, y + 0.5, CENTRO, CENTRO) / RADIO_BOLA;
            const g = limitar((r - 0.35) / 0.65, 0, 1);
            const i = (y * LADO_BOLA + x) * 4;
            datos[i] = datos[i + 1] = datos[i + 2] = 255;
            datos[i + 3] = Math.round(limitar(g * aleatorio(0.55, 1.45), 0, 1) * 255);
        }
    }
    t.putImageData(imagen, 0, 0);
    return c;
}

// Brocha con calvas: degradado radial con agujeros aleatorios.
// Al estamparla a lo largo del trazo deja vetas, como al limpiar con la mano.
function construirBrocha(radio) {
    const { canvas: c, ctx: s } = crearCanvas(radio * 2);

    const g = s.createRadialGradient(radio, radio, 0, radio, radio, radio);
    g.addColorStop(0, 'rgba(0, 0, 0, 0.9)');
    g.addColorStop(0.6, 'rgba(0, 0, 0, 0.8)');
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    s.fillStyle = g;
    s.fillRect(0, 0, radio * 2, radio * 2);

    // calvas: puntos donde la brocha limpia menos → vetas
    s.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < radio * 0.5; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * radio * 0.9;
        s.fillStyle = `rgba(0, 0, 0, ${0.25 + Math.random() * 0.4})`;
        s.beginPath();
        s.arc(radio + Math.cos(a) * d, radio + Math.sin(a) * d, 0.4 + Math.random() * 1.2, 0, Math.PI * 2);
        s.fill();
    }
    return c;
}

const texturaEscarcha = crearTexturaEscarcha();
const mascaraBorde = crearMascaraBorde();
const brocha = construirBrocha(RADIO_BROCHA);   // se construye una sola vez

// Escarcha al 100 %
function pintarEscarcha() {
    ctxMascara.globalCompositeOperation = 'source-over';
    ctxMascara.fillStyle = '#fff';
    ctxMascara.fillRect(0, 0, LADO_BOLA, LADO_BOLA);
    mascaraSucia = true;
}

// Canvas visible = textura recortada por la máscara
function componerEscarcha() {
    ctx.save();
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(texturaEscarcha, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mascara, 0, 0);
    ctx.restore();
}

// Estampa la brocha a lo largo del segmento y deja cristales a los lados
function limpiarEscarcha(xAnterior, yAnterior, x, y) {
    const r = RADIO_BROCHA;
    const dist = distancia(xAnterior, yAnterior, x, y);
    const paso = Math.max(1.5, r * 0.18);
    const n = Math.max(1, Math.ceil(dist / paso));
    const nx = dist ? -(y - yAnterior) / dist : 0;   // normal al trazo
    const ny = dist ? (x - xAnterior) / dist : 0;

    ctxMascara.save();
    ctxMascara.globalCompositeOperation = 'destination-out';
    for (let i = 1; i <= n; i++) {
        const px = xAnterior + (x - xAnterior) * i / n;
        const py = yAnterior + (y - yAnterior) * i / n;
        ctxMascara.drawImage(brocha, px - r, py - r);

        if (!dist) continue;   // el primer toque no tiene dirección: sin cristales
        for (let k = 0; k < 2; k++) {
            if (Math.random() > 0.8) continue;
            const lado = Math.random() < 0.5 ? -1 : 1;
            const d = r * (0.9 + Math.random() * 0.16);
            dibujarCristal(
                ctxHumedad,
                px + nx * lado * d + (Math.random() - 0.5) * 3,
                py + ny * lado * d + (Math.random() - 0.5) * 3,
                0.4 + Math.random() ** 2.5 * 2
            );
        }
    }
    ctxMascara.restore();
    mascaraSucia = true;
}

// Reescarchado progresivo: tras la pausa, lo limpio se vuelve a empañar
function reescarchar(dt, ahora) {
    if (ahora - ultimoTrazoMs < PAUSA_TRAS_TRAZO) return;

    const segundos = ratonDentro ? SEG_REESCARCHADO : SEG_REESCARCHADO_FUERA;

    // Cristales del borde del trazo: se desvanecen por tandas con la escarcha que vuelve
    acumuladoHumedad += dt;
    if (acumuladoHumedad >= TANDA && desvanecidoHumedad < 2.5) {
        const k = Math.min(1, (acumuladoHumedad / 1000) * 2.5 / segundos);
        desvanecidoHumedad += k;
        if (desvanecidoHumedad >= 2.5) {
            // Ya ha pasado el tiempo completo: se quitan los restos que el redondeo deja
            ctxHumedad.clearRect(0, 0, LADO_BOLA, LADO_BOLA);
        } else {
            ctxHumedad.save();
            ctxHumedad.globalCompositeOperation = 'destination-out';
            ctxHumedad.globalAlpha = k;
            ctxHumedad.fillStyle = '#000';   // opaco: si no, hereda el color del último cristal
            ctxHumedad.fillRect(0, 0, LADO_BOLA, LADO_BOLA);
            ctxHumedad.restore();
        }
        acumuladoHumedad = 0;
    }

    // Escarcha: niveles de alfa (0–255) acumulados y aplicados en enteros.
    // Ritmo lineal: el centro vuelve del todo justo en `segundos`.
    const niveles = 255 * dt / (segundos * 1000);
    acumuladoCentro += niveles;
    acumuladoBorde += niveles * FACTOR_BORDE;

    const nivelesBorde = acumuladoBorde >= PASO_BORDE ? Math.floor(acumuladoBorde) : 0;
    const nivelesCentro = Math.floor(acumuladoCentro);
    if (nivelesBorde === 0 && nivelesCentro === 0) return;

    ctxMascara.save();
    ctxMascara.globalCompositeOperation = 'lighter';   // suma alfa, sin oscurecer
    if (nivelesBorde > 0) {
        ctxMascara.globalAlpha = Math.min(nivelesBorde / 255, 1);
        ctxMascara.drawImage(mascaraBorde, 0, 0);       // crece desde el borde
        acumuladoBorde -= nivelesBorde;
    }
    if (nivelesCentro > 0) {
        ctxMascara.globalAlpha = Math.min(nivelesCentro / 255, 1);
        ctxMascara.fillStyle = '#fff';
        ctxMascara.fillRect(0, 0, LADO_BOLA, LADO_BOLA); // empaña también el centro
        acumuladoCentro -= nivelesCentro;
    }
    ctxMascara.restore();
    mascaraSucia = true;
}

// ¿Ese píxel ya está limpio? (coordenadas del canvas, no de la página)
// La brocha nunca deja alfa 0 en una pasada y la escarcha vuelve sola:
// por eso se compara con UMBRAL_ALFA y nunca con === 0.
function estaDestapado(x, y) {
    const alfa = ctxMascara.getImageData(Math.round(x), Math.round(y), 1, 1).data[3];
    return alfa < UMBRAL_ALFA;
}

// Cuánta escarcha queda. Contar los 590 000 píxeles cada fotograma sería carísimo:
// se reduce la máscara a 64 × 64 y se suma el alfa ahí (el reescalado promedia, que es
// justo lo que hace falta). willReadFrequently solo en este canvas pequeño.
// Se mide la máscara y no el canvas visible: el visible es la textura (opaca)
// recortada por ella, así que da lo mismo, y la máscara no lleva pintadas las gotas.
const LADO_MUESTRA = 64;
const { ctx: ctxMuestra } = crearCanvas(LADO_MUESTRA, { willReadFrequently: true });

// Solo cuentan los píxeles del círculo: la máscara es un cuadrado y sus esquinas,
// fuera del cristal, no se pueden limpiar nunca. Si contaran, el contador no bajaría
// del ~21 % y el estado final (≤ 8 %) sería inalcanzable.
const indicesCirculo = [];
(function prepararIndices() {
    const c = LADO_MUESTRA / 2;
    for (let y = 0; y < LADO_MUESTRA; y++) {
        for (let x = 0; x < LADO_MUESTRA; x++) {
            if (distancia(x + 0.5, y + 0.5, c, c) <= c - 1) {
                indicesCirculo.push((y * LADO_MUESTRA + x) * 4 + 3);
            }
        }
    }
})();

function sumaAlfa() {
    ctxMuestra.clearRect(0, 0, LADO_MUESTRA, LADO_MUESTRA);
    ctxMuestra.drawImage(mascara, 0, 0, LADO_MUESTRA, LADO_MUESTRA);
    const datos = ctxMuestra.getImageData(0, 0, LADO_MUESTRA, LADO_MUESTRA).data;
    let suma = 0;
    for (const i of indicesCirculo) suma += datos[i];
    return suma;
}

// ~5 veces por segundo sobra. Normalizado contra la lectura INICIAL real (sumaInicial),
// no contra un máximo teórico: así arranca exactamente en 100.
function medirEscarcha(dt) {
    acumMedida += dt;
    if (acumMedida < CADENCIA_MEDIDA) return false;
    acumMedida = 0;
    pctEscarcha = Math.round(sumaAlfa() / sumaInicial * 100);
    return true;
}

/* -------------------------------------------------------------------------
   Gotas de deshielo: el cristal se templa donde pasa la mano y, de vez en
   cuando, una gota resbala a tirones abriendo un reguero en la escarcha.
   ------------------------------------------------------------------------- */
function quizaCrearGota(x, y, dt) {
    if (menosMovimiento.matches || gotas.length >= MAX_GOTAS) return;
    if (y > CENTRO) return;                          // solo en la mitad superior
    if (Math.random() > dt * 0.00025) return;        // ~1 gota cada 4 s limpiando
    gotas.push({
        x, y,
        r: aleatorio(2.2, 3.6),
        v: 0,                                        // px/s
        pausa: aleatorio(300, 900),                  // se forma antes de caer
        vida: aleatorio(4000, 7000),
        semilla: Math.random() * 10
    });
}

function actualizarGotas(dt) {
    for (let i = gotas.length - 1; i >= 0; i--) {
        const g = gotas[i];
        g.vida -= dt;

        // Avanza, se para y vuelve a arrancar: eso es lo que la hace parecer agua
        if (g.pausa > 0) {
            g.pausa -= dt;
            g.v *= 0.8;
        } else {
            g.v = Math.min(g.v + 0.26 * dt, 90 + g.r * 30);
            if (Math.random() < dt * 0.0009) g.pausa = 150 + Math.random() * 800;
        }

        const ox = g.x;
        const oy = g.y;
        g.y += g.v * dt / 1000;
        g.x += Math.sin(g.y * 0.04 + g.semilla) * g.v * (dt / 1000) * 0.12;

        if (g.v > 1) {   // abre reguero en la escarcha
            ctxMascara.save();
            ctxMascara.globalCompositeOperation = 'destination-out';
            ctxMascara.strokeStyle = 'rgba(0, 0, 0, 0.6)';
            ctxMascara.lineCap = 'round';
            ctxMascara.lineWidth = g.r * 2.4;
            ctxMascara.beginPath();
            ctxMascara.moveTo(ox, oy);
            ctxMascara.lineTo(g.x, g.y);
            ctxMascara.stroke();
            ctxMascara.restore();
            g.r = Math.max(1.2, g.r - dt * 0.00012);
        }

        if (g.vida <= 0 || distancia(g.x, g.y, CENTRO, CENTRO) > RADIO_BOLA - 12) {
            gotas.splice(i, 1);
        }
    }
    if (gotas.length) mascaraSucia = true;
}

// La cabeza de cada gota se pinta sobre la escarcha ya compuesta
function dibujarGotas() {
    for (const g of gotas) {
        ctx.fillStyle = 'rgba(237, 228, 212, 0.55)';
        ctx.beginPath();
        ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(g.x - g.r * 0.3, g.y - g.r * 0.35, g.r * 0.3, 0, Math.PI * 2);
        ctx.fill();
    }
}

/* -------------------------------------------------------------------------
   Juguetes y sombras de contacto
   ------------------------------------------------------------------------- */
const juguetes = JOGUINES.map((datos) => ({
    ...datos,
    el: document.getElementById(datos.id),
    sombraEl: datos.sombra ? document.getElementById(datos.sombra) : null,
    ox: 0,                               // desplazamiento actual
    oy: 0,
    giro: 0,                             // rotate, en grados
    elevacion: 0,                        // 0 → ELEVACION_HOVER, suavizada: sombra y cordel
    activo: false,
    ultimoTransform: '',
    // Arrastre: dónde lo ha dejado el usuario respecto a su base (px, coordenadas de
    // la bola), su velocidad al soltarlo (px/ms) y cuánto de su animación se ve (0–1:
    // mientras está cogido, nada; al soltarlo, vuelve poco a poco)
    bx: 0,
    by: 0,
    vx: 0,
    vy: 0,
    amp: 1,
    giroCogido: 0,                       // el giro que tenía al cogerlo; se endereza solo
    inclinacio: 0                        // se ladea al arrastrarlo, según la velocidad
}));

// Arrastre de juguetes
const LIMITE_ARRASTRE = 340;             // px del centro de la bola: 45 de aire hasta el cristal
// Techo: la tinta de HI JUGA acaba en y = 565 del cartel y el cristal sigue por
// detrás del titular. Un juguete lanzado hacia arriba se quedaría escondido tras las
// letras, así que el titular hace de techo (y = 572 del cartel → 287 en la bola)
const TECHO_ARRASTRE = 572 - (CENTRO_CARTEL_Y - RADIO_BOLA);
const SEGUIMIENTO = 45;                  // ms: el juguete va un pelín detrás del cursor (pesa)
const ROZAMIENTO = 320;                  // ms: al soltarlo, la inercia se apaga con esta constante
const REBOTE = 0.45;                     // lo que conserva de la velocidad al chocar con el cristal
const VEL_MAX = 2.2;                     // px/ms: un lanzamiento muy brusco no lo dispara
let arrastrado = null;                   // el juguete cogido (o null)
const agarre = { dx: 0, dy: 0 };         // del cursor al centro del juguete al cogerlo
let cursorBolaActual = '';               // el cursor de .bola: grab / grabbing / normal

// Suma de dos senos: uno lento y amplio, otro rápido y pequeño.
// p = [amplitud lenta, periodo lento (ms), amplitud rápida, periodo rápido (ms)]
function osc(p, t, fase) {
    return Math.sin(t / p[1] * 2 * Math.PI + fase) * p[0]
         + Math.sin(t / p[3] * 2 * Math.PI + fase * 2.3) * p[2];
}

// Su derivada: la velocidad de osc() en px/ms. Exacta, sin restar dos fotogramas
// (así no tiembla aunque el intervalo entre fotogramas varíe)
function velocidadOsc(p, t, fase) {
    return Math.cos(t / p[1] * 2 * Math.PI + fase) * p[0] * 2 * Math.PI / p[1]
         + Math.cos(t / p[3] * 2 * Math.PI + fase * 2.3) * p[2] * 2 * Math.PI / p[3];
}

// Animaciones propias: van encima de la deriva y sobrescriben lo que toque
const ANIMACIONES = {
    // La pelota rueda: el giro SALE del recorrido (ángulo = distancia / radio).
    // Si se pusiera el giro por su cuenta, parecería que patina, y el ojo lo nota.
    // Con ±41 px de recorrido y radio 87 gira ±27°. No tocar el giro por separado:
    // si sube la amplitud de x, el giro sube solo, que es lo correcto.
    rodar(j) {
        j.giro = (j.ox / RADIO_PELOTA) * (180 / Math.PI);
    },

    // El tren avanza y retrocede, traquetea sobre las ruedas y se inclina con la
    // velocidad: se encabrita al arrancar y se hunde al frenar, sin coreografiarlo.
    // Es lo que separa un rectángulo que se desliza de un tren con inercia.
    // La velocidad es la derivada exacta de osc() (velocidadOsc), no la resta de dos
    // fotogramas: no depende del intervalo entre fotogramas (no tiembla) y no hay un
    // valor anterior que inicializar (no da un giro absurdo en el primer fotograma).
    tren(j, t) {
        j.oy = Math.sin(t / BOTE_TREN) * 2.5;
        j.giro = -velocidadOsc(j.x, t, j.fase) * 140;     // ±3° como mucho
    },

    // El robot: lo que lo hace robot no es el recorrido, es que NO interpola.
    // Ocho pasos adelante y ocho atrás: la x cambia de golpe al cambiar de paso (sin
    // transition, a propósito). El balanceo y el saltito sí son continuos dentro de
    // cada paso, y eso basta para que no parezca que va a tirones por error.
    robot(j, t) {
        const n = Math.floor(t / PASO_ROBOT);
        const f = (t % PASO_ROBOT) / PASO_ROBOT;          // 0 → 1 dentro del paso
        const ciclo = n % 16;
        const paso = ciclo < 8 ? ciclo : 15 - ciclo;      // 0…7, 7…0, ida y vuelta

        j.ox = paso * SALT_ROBOT - 3.5 * SALT_ROBOT;            // ±28 px a saltos de 8
        j.giro = (n % 2 ? 1 : -1) * 7 * Math.sin(f * Math.PI);  // bascula a cada paso (sobre los pies)
        j.oy = -Math.abs(Math.sin(f * Math.PI)) * 4;            // se eleva al pasar
    },

    // El ioiò sube y baja con el cordel. La caída es más rápida que la subida (42 % del
    // ciclo bajando, 58 % subiendo), y Math.pow(·, 0.7) lo frena al llegar abajo,
    // que es lo que hace un ioiò de verdad. Tres vueltas por ciclo.
    ioio(j, t) {
        const f = (t % CICLE_IOIO) / CICLE_IOIO;
        const caiguda = f < 0.42 ? f / 0.42 : 1 - (f - 0.42) / 0.58;
        j.oy = Math.pow(caiguda, 0.7) * CAIGUDA_IOIO;
        j.giro = f * 1080;
    }
};

function animar(j, t) {
    j.ox = j.x ? osc(j.x, t, j.fase) : 0;
    j.oy = j.y ? osc(j.y, t, j.fase + 1.7) : 0;
    j.giro = j.rot ? osc(j.rot, t, j.fase + 0.9) : 0;
    if (j.propia) ANIMACIONES[j.propia](j, t);
}

// Con dos juguetes solapados bajo el cursor, gana el más cercano: solo uno activo.
// Se usa la posición VIVA (base + animación): con hasta ±67 px de recorrido (la
// pelota), la base dejaría la zona sensible fuera del objeto.
// La zona es una elipse; "cercanía" es la distancia normalizada (0 = en el centro,
// 1 = en el borde de su elipse), así un juguete grande no le gana a uno pequeño
// solo por serlo.
// No incluye la subida del hover: si la zona subiera con el juguete, al subir
// dejaría de estar bajo el cursor, bajaría y volvería a subir, en bucle.
function jugueteBajoCursor() {
    if (arrastrado) return arrastrado;   // mientras está cogido, es el único activo
    if (!cursorBola) return null;
    let elegido = null;
    let mejor = Infinity;
    for (const j of juguetes) {
        const cx = j.cx + j.bx + j.ox * j.amp;
        const cy = j.cy + j.by + j.oy * j.amp;
        const d = Math.hypot((cursorBola.x - cx) / j.rx, (cursorBola.y - cy) / j.ry);
        if (d < 1 && d < mejor && estaDestapado(cx, cy)) {
            mejor = d;
            elegido = j;
        }
    }
    return elegido;
}

/* -------------------------------------------------------------------------
   Arrastrar los juguetes
   Se coge con mousedown sobre un juguete ya destapado, sigue al cursor y al
   soltarlo (mouseup) sale con la velocidad que llevaba, frena y rebota contra
   el cristal. Nunca sale de la bola: el límite se calcula con lo que ocupa de
   verdad cada juguete, más lo que su animación lo aleja de la base, para que
   tampoco se salga cuando vuelva a moverse solo. Se queda donde lo dejas.
   ------------------------------------------------------------------------- */

// ¿Cabe el juguete con su centro en (x, y), coordenadas de la bola?
// Redondos (pelota, ioiò): un disco. El resto: las cuatro esquinas de su caja.
// En los dos casos, ampliado con lo que se mueve su animación hacia cada lado.
function cabeEnLaBola(j, x, y) {
    const c = j.caja;
    const izquierda = x - c.mx, derecha = x + c.mx;
    const arriba = y - c.arriba, abajo = y + c.abajo;
    if (c.r) {
        // el punto del rectángulo [izquierda..derecha] × [arriba..abajo] más lejano del centro
        const px = Math.abs(izquierda - CENTRO) > Math.abs(derecha - CENTRO) ? izquierda : derecha;
        const py = Math.abs(arriba - CENTRO) > Math.abs(abajo - CENTRO) ? arriba : abajo;
        return distancia(px, py, CENTRO, CENTRO) + c.r <= LIMITE_ARRASTRE;
    }
    for (const ex of [izquierda - c.w / 2, derecha + c.w / 2]) {
        for (const ey of [arriba - c.h / 2, abajo + c.h / 2]) {
            if (distancia(ex, ey, CENTRO, CENTRO) > LIMITE_ARRASTRE) return false;
        }
    }
    return true;
}

// Lleva el juguete a (x, y) sin salir del cristal. Primero el techo: no sube por
// encima del titular. Después, si no cabe, se acerca el punto al centro de la bola
// hasta que quepa (bisección): así resbala por la pared en vez de quedarse pegado.
// Devuelve 'techo', 'cristal' o null, según con qué haya chocado.
function moverDentro(j, x, y) {
    let choca = null;
    const c = j.caja;
    const yMin = TECHO_ARRASTRE + c.arriba + (c.r || c.h / 2);
    if (y < yMin) {
        y = yMin;
        choca = 'techo';
    }
    if (!cabeEnLaBola(j, x, y)) {
        choca = 'cristal';
        let dentro = 0;
        let fuera = 1;
        for (let i = 0; i < 12; i++) {
            const m = (dentro + fuera) / 2;
            if (cabeEnLaBola(j, CENTRO + (x - CENTRO) * m, CENTRO + (y - CENTRO) * m)) dentro = m;
            else fuera = m;
        }
        x = CENTRO + (x - CENTRO) * dentro;
        y = CENTRO + (y - CENTRO) * dentro;
    }
    j.bx = x - j.cx;
    j.by = y - j.cy;
    return choca;
}

function coger(j, x, y) {
    // La animación se "congela" donde está: su desplazamiento pasa a la base, así el
    // juguete no salta al cogerlo. El giro que tenía se endereza poco a poco
    j.bx += j.ox * j.amp;
    j.by += j.oy * j.amp;
    // (llevado a −180…180°: el ioiò acumula hasta tres vueltas y, si no, daría
    // vueltas de más al enderezarse)
    const giro = j.giro * j.amp + j.giroCogido;
    j.giroCogido = ((giro % 360) + 540) % 360 - 180;
    j.amp = 0;
    j.vx = j.vy = 0;
    agarre.dx = j.cx + j.bx - x;
    agarre.dy = j.cy + j.by - y;
    arrastrado = j;
    j.el.classList.add('cogida');
    // Al frente: pasa a ser el último juguete del DOM (justo antes de la nieve media),
    // así al soltarlo se queda delante de los demás, como algo que dejas encima
    j.el.parentNode.insertBefore(j.el, canvasNieveMedia);
}

function soltar() {
    if (!arrastrado) return;
    const j = arrastrado;
    if (menosMovimiento.matches) j.vx = j.vy = 0;          // sin inercia: se queda donde lo dejas
    arrastrado = null;
    j.el.classList.remove('cogida');
}

// Un fotograma de arrastre o de inercia para el juguete j
function moverArrastre(j, dt, k) {
    if (j === arrastrado) {
        // Sigue al cursor (en todo el cartel: si el cursor sale de la bola, el juguete
        // se queda pegado al cristal por dentro)
        const objetivoX = cursorCartel.x - (CENTRO_CARTEL_X - CENTRO) + agarre.dx;
        const objetivoY = cursorCartel.y - (CENTRO_CARTEL_Y - CENTRO) + agarre.dy;
        const x0 = j.cx + j.bx;
        const y0 = j.cy + j.by;
        const s = 1 - Math.exp(-dt / SEGUIMIENTO);
        moverDentro(j, x0 + (objetivoX - x0) * s, y0 + (objetivoY - y0) * s);
        // Velocidad real (la que lleva al soltarlo), suavizada
        const v = 1 - Math.exp(-dt / 60);
        j.vx += (limitar((j.cx + j.bx - x0) / Math.max(dt, 1), -VEL_MAX, VEL_MAX) - j.vx) * v;
        j.vy += (limitar((j.cy + j.by - y0) / Math.max(dt, 1), -VEL_MAX, VEL_MAX) - j.vy) * v;
    } else if (Math.abs(j.vx) + Math.abs(j.vy) > 0.002) {
        // Inercia: avanza, frena y rebota contra el cristal
        const x = j.cx + j.bx + j.vx * dt;
        const y = j.cy + j.by + j.vy * dt;
        const choque = moverDentro(j, x, y);
        if (choque === 'techo' && j.vy < 0) {
            j.vy = -j.vy * REBOTE;                        // rebota contra el titular
        } else if (choque === 'cristal') {
            // Rebote: se invierte la componente que va hacia el cristal y pierde fuerza
            const nx = j.cx + j.bx - CENTRO;
            const ny = j.cy + j.by - CENTRO;
            const n = Math.hypot(nx, ny) || 1;
            const vn = (j.vx * nx + j.vy * ny) / n;
            if (vn > 0) {
                j.vx -= (1 + REBOTE) * vn * nx / n;
                j.vy -= (1 + REBOTE) * vn * ny / n;
            }
        }
        const f = Math.exp(-dt / ROZAMIENTO);
        j.vx *= f;
        j.vy *= f;
    } else {
        j.vx = j.vy = 0;
    }

    // Se ladea hacia donde va (como algo que cuelga de la mano) y, al soltarlo, la
    // animación vuelve poco a poco y el giro que tenía al cogerlo se endereza
    j.inclinacio += (limitar(j.vx * 22, -18, 18) - j.inclinacio) * k;
    j.giroCogido *= 1 - k;
    if (j !== arrastrado) j.amp += (1 - j.amp) * (1 - Math.exp(-dt / 500));
}

function actualizarJuguetes(ahora, dt, quieto) {
    const k = 1 - Math.exp(-dt / 70);   // suavizado de la sombra y el cordel al hover (~0,2 s)

    for (const j of juguetes) {
        // Con movimiento reducido quedan quietos en su base; el hover sigue funcionando
        // porque la detección usa base + desplazamiento, y el desplazamiento vale 0
        if (quieto) {
            j.ox = j.oy = j.giro = 0;
        } else {
            animar(j, ahora);
        }
    }

    const elegido = jugueteBajoCursor();

    // El cursor dice lo que se puede hacer: mano abierta sobre un juguete que se puede
    // coger, mano cerrada mientras se arrastra
    const cursorNuevo = arrastrado ? 'grabbing' : elegido ? 'grab' : '';
    if (cursorNuevo !== cursorBolaActual) {
        cursorBolaActual = cursorNuevo;
        bola.style.cursor = cursorNuevo;
    }

    for (const j of juguetes) {
        // Hover: solo se pone o quita la clase; la subida la anima el CSS (220 ms)
        const activo = j === elegido;
        if (activo !== j.activo) {
            j.activo = activo;
            j.el.classList.toggle('activo', activo);
        }
        j.elevacion += ((j.activo ? ELEVACION_HOVER : 0) - j.elevacion) * k;

        moverArrastre(j, dt, k);

        // Posición: la base, más dónde lo ha dejado el usuario (bx, by), más su
        // animación (que se apaga mientras está cogido)
        const dx = j.bx + j.ox * j.amp;
        const dy = j.by + j.oy * j.amp;
        const giro = j.giro * j.amp + j.giroCogido + j.inclinacio;

        // Animación: en el div exterior, sin transición
        const transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) `
            + `rotate(${giro.toFixed(1)}deg)`;
        if (transform !== j.ultimoTransform) {
            j.ultimoTransform = transform;
            j.el.style.transform = transform;
        }

        // Sombra de contacto (solo los posados): sigue al juguete en horizontal y NUNCA
        // rota, porque una sombra sobre el suelo no gira con la pieza (si rotara, se
        // delataría al instante). Cuando el juguete sube, se ensancha y se aclara.
        // Lo que se desplaza por el suelo (pelota, robot, tren) se lleva la sombra
        // entera; el oso, que solo deriva, a media amplitud. (Con media amplitud para
        // todos, la sombra de la pelota se quedaba 33 px atrás al rodar.)
        // Si el usuario lo levanta (by < 0), la sombra se queda en el suelo, debajo, y
        // se aclara con la altura; si lo baja, la sombra baja con él
        if (j.sombraEl) {
            const altura = Math.abs(j.oy * j.amp) + j.elevacion + Math.max(0, -j.by);
            j.sombraEl.style.transform =
                `translate(${(j.bx + j.ox * j.amp * j.sigue).toFixed(1)}px, ${Math.max(0, j.by).toFixed(1)}px) `
                + `scale(${(1 + Math.min(altura, 80) * 0.004).toFixed(3)}, 1)`;
            j.sombraEl.style.opacity = Math.max(0.1, 0.4 - altura * 0.012).toFixed(3);
        }
    }

    // El cordel del ioiò: cuelga recto desde arriba hasta el eje, que se mueve con él
    // (también cuando se arrastra). Si el ioiò sube tanto que el cordel no tendría
    // sitio bajo el titular, se esconde
    const ioio = juguetes.find((j) => j.propia === 'ioio');
    const ioioX = ioio.cx + 39 + ioio.bx + ioio.ox * ioio.amp;
    const ioioY = ioio.cy + 285 + ioio.by + ioio.oy * ioio.amp - ioio.elevacion;
    cordill.setAttribute('x1', ioioX.toFixed(1));
    cordill.setAttribute('x2', ioioX.toFixed(1));
    cordill.setAttribute('y2', ioioY.toFixed(1));
    cordill.style.opacity = ioioY > 600 ? '' : '0';
}

/* -------------------------------------------------------------------------
   Color de HI JUGA ligado a la escarcha
   Medido sobre la build: la escarcha es #C6C9BE y el árbol destapado #664435.
   Ningún color plano aguanta los dos (el crema da 1,27:1 sobre la escarcha),
   así que el color va del verde casi negro (bola empañada) al crema (bola
   limpia) según el porcentaje de escarcha que queda.
   Solo dentro de la bola: fuera, sobre el muro, HI JUGA es crema siempre
   (degradado radial recortado a la letra, ver style.css).
   ------------------------------------------------------------------------- */

// Dónde cae la bola respecto a cada palabra de HI JUGA. El degradado se mide desde
// la caja de la palabra y en sus coordenadas, que están estiradas por el scaleY del
// titular: por eso la y y el radio vertical se dividen por esa escala. Se usan
// offsetLeft / offsetTop, que no cambian con el temblor ni con el escalado del cartel.
function prepararTitular() {
    const estilo = getComputedStyle(titular);
    const k = new DOMMatrix(estilo.transform).d || 1;            // scaleY (1,1)
    const izquierda = parseFloat(estilo.left);
    const arriba = parseFloat(estilo.top);
    for (const p of palabrasEscarcha) {
        p.style.setProperty('--bola-x', `${(CENTRO_CARTEL_X - izquierda - p.offsetLeft).toFixed(1)}px`);
        p.style.setProperty('--bola-y', `${((CENTRO_CARTEL_Y - arriba) / k - p.offsetTop).toFixed(1)}px`);
        p.style.setProperty('--bola-rx', `${RADIO_BOLA}px`);
        p.style.setProperty('--bola-ry', `${(RADIO_BOLA / k).toFixed(1)}px`);
    }
}

// Mezcla lineal entre los dos colores. Solo toca el DOM si el color cambia; la
// transición del CSS (--color-escarcha, 0,3 s) lo funde entre medida y medida
function colorTitular() {
    const t = limitar(1 - pctEscarcha / 100, 0, 1);              // 0 = empañada, 1 = limpia
    const c = COLOR_EMPANADA.map((v, i) => Math.round(v + (COLOR_LIMPIA[i] - v) * t));
    const color = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    if (color !== ultimoColorTitular) {
        ultimoColorTitular = color;
        titular.style.setProperty('--color-escarcha', color);
    }
}

/* -------------------------------------------------------------------------
   Nieve
   · Sprites pre-renderizados una sola vez: halo (iamjamie) + estrella de
     seis puntas (iautomation), con 8 rotaciones para girar sin coste.
   · Tres niveles, un canvas cada uno: lejos detrás de los juguetes, media
     delante y cerca por encima de la sombra interior, desenfocada.
     Dentro de cada nivel, cada copo tiene su propia z.
   · Al dibujar, cada copo se refracta: cerca del borde se aprieta y encoge.
   ------------------------------------------------------------------------- */

// Barra redondeada (con reserva para navegadores sin roundRect)
function barra(s, x, y, w, h, radio) {
    s.beginPath();
    if (s.roundRect) s.roundRect(x, y, w, h, radio);
    else s.rect(x, y, w, h);
    s.fill();
}

function crearSpriteCopo(lado, conPuas, giro = 0) {
    const { canvas: c, ctx: s } = crearCanvas(lado);
    const cen = lado / 2;

    // halo suave: da cuerpo al copo
    const halo = s.createRadialGradient(cen, cen, 0, cen, cen, cen);
    halo.addColorStop(0, 'rgba(255, 255, 255, 0.50)');
    halo.addColorStop(0.5, 'rgba(255, 255, 255, 0.12)');
    halo.addColorStop(1, 'rgba(255, 255, 255, 0)');
    s.fillStyle = halo;
    s.fillRect(0, 0, lado, lado);

    // estrella de seis puntas: un brazo repetido girando 60°
    const brazo = lado * 0.40;
    const grosor = Math.max(1, lado * 0.11);
    s.translate(cen, cen);
    s.rotate(giro);
    s.fillStyle = '#F4F7F0';

    for (let i = 0; i < 6; i++) {
        s.save();
        s.rotate(i * Math.PI / 3);
        barra(s, 0, -grosor / 2, brazo, grosor, grosor / 2);

        if (conPuas) {   // dos púas por brazo, cerca de la punta
            for (const lad of [-1, 1]) {
                s.save();
                s.translate(brazo * 0.58, 0);
                s.rotate(lad * Math.PI / 4);
                barra(s, 0, -grosor * 0.4, brazo * 0.36, grosor * 0.8, grosor * 0.4);
                s.restore();
            }
        }
        s.restore();
    }
    return c;
}

// Copo lejano: solo halo (una estrella a 2 px es ruido)
function crearSpriteHalo(lado) {
    const { canvas: c, ctx: s } = crearCanvas(lado);
    const cen = lado / 2;
    const halo = s.createRadialGradient(cen, cen, 0, cen, cen, cen);
    halo.addColorStop(0, 'rgba(244, 247, 240, 0.95)');
    halo.addColorStop(0.45, 'rgba(244, 247, 240, 0.45)');
    halo.addColorStop(1, 'rgba(244, 247, 240, 0)');
    s.fillStyle = halo;
    s.fillRect(0, 0, lado, lado);
    return c;
}

const spritesCerca = Array.from({ length: PASOS }, (_, i) => crearSpriteCopo(36, true, (i / PASOS) * GIRO));
const spritesMedia = Array.from({ length: PASOS }, (_, i) => crearSpriteCopo(16, false, (i / PASOS) * GIRO));
const spritesLejos = [crearSpriteHalo(8)];

// Altura de una curva de Bézier cuadrática para cada x entera de la bola.
// Puntos en coordenadas del cartel (como en la especificación); se pasan a la bola.
function crearPerfil(segmentos) {
    const alturas = new Float32Array(LADO_BOLA + 1).fill(Infinity);
    for (const [p0, p1, p2] of segmentos) {
        for (let i = 0; i <= 800; i++) {
            const t = i / 800;
            const u = 1 - t;
            const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0] - 39;
            const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1] - 285;
            const xi = Math.round(x);
            if (xi >= 0 && xi <= LADO_BOLA) alturas[xi] = Math.min(alturas[xi], y);
        }
    }
    return alturas;
}

// Nieve lejana: se posa en el suelo nevado de la FOTO, justo detrás de los juguetes.
// Ya no hay montículo ni suelo vectoriales: esta curva sigue la nieve de fondo.webp
// (y ≈ 900 en la foto → ≈ 837 en el cartel; baja un poco en el centro, como el cristal)
const perfilSuelo = crearPerfil([
    [[20, 835], [424, 855], [828, 835]]
]);
// Nieve media y cercana: se posa en la duna delantera. M 20 880 Q 424 944 828 880
const perfilDuna = crearPerfil([
    [[20, 880], [424, 944], [828, 880]]
]);

function alturaSuelo(x, perfil) {
    const dx = x - CENTRO;
    const fondoCristal = CENTRO + Math.sqrt(Math.max(RADIO_BOLA ** 2 - dx * dx, 0)) - 10;
    return Math.min(perfil[limitar(Math.round(x), 0, LADO_BOLA)], fondoCristal);
}

// radio = radio de la estrella (punta a punta / 2); refuerzos = copos que solo se ven al agitar.
// Cada nivel en su canvas: lejos detrás de los juguetes, media delante, y cerca por
// encima de la sombra interior, grande y desenfocada (blur en style.css), pegada al cristal.
const NIVELES = [
    { cantidad: 150, refuerzos: 60, radio: [1.5, 2.5], opacidad: [0.22, 0.28], velocidad: 0.5,
      ctx: ctxNieveFondo, perfil: perfilSuelo, sprites: spritesLejos, reaccionaCursor: false },
    { cantidad: 110, refuerzos: 60, radio: [4, 6],     opacidad: [0.45, 0.55], velocidad: 1,
      ctx: ctxNieveMedia, perfil: perfilDuna,  sprites: spritesMedia, reaccionaCursor: true },
    { cantidad: 30,  refuerzos: 30, radio: [10, 13],   opacidad: [0.45, 0.65], velocidad: 1.8,
      ctx: ctxNieveCerca, perfil: perfilDuna,  sprites: spritesCerca, reaccionaCursor: true }
];
const CONTEXTOS_NIEVE = [ctxNieveFondo, ctxNieveMedia, ctxNieveCerca];

function crearCopo(nivel, refuerzo) {
    const z = Math.random();   // profundidad dentro del nivel: tamaño, opacidad y velocidad
    const copo = {
        nivel,
        refuerzo,
        r: interpolar(nivel.radio, z),
        opacidad: interpolar(nivel.opacidad, z),
        vTerminal: interpolar(VEL_CAIDA, z) * nivel.velocidad,
        profundidad: (nivel.velocidad / 1.8) * (0.7 + 0.3 * z),   // 0–1 en toda la bola
        fase: Math.random() * Math.PI * 2,
        vFase: aleatorio(0.0006, 0.0014),
        rot: Math.random() * GIRO,
        vrot: aleatorio(-VROT_MAX, VROT_MAX),
        x: 0, y: 0, vx: 0, vy: 0,
        alfa: 1,
        posada: false
    };
    // Posición inicial dentro del cristal y por encima de su suelo
    do {
        copo.x = aleatorio(40, 730);
        copo.y = aleatorio(40, 600);
    } while (distancia(copo.x, copo.y, CENTRO, CENTRO) > RADIO_BOLA - 20 ||
             copo.y > alturaSuelo(copo.x, nivel.perfil) - 10);
    copo.vy = copo.vTerminal;
    return copo;
}

const copos = [];
for (const nivel of NIVELES) {
    for (let i = 0; i < nivel.cantidad; i++) copos.push(crearCopo(nivel, false));
    for (let i = 0; i < nivel.refuerzos; i++) copos.push(crearCopo(nivel, true));
}

function renacerCopo(copo) {
    copo.x = aleatorio(70, 700);
    const techo = CENTRO - Math.sqrt(RADIO_BOLA ** 2 - (copo.x - CENTRO) ** 2);
    copo.y = techo + aleatorio(20, 70);
    copo.vx = 0;
    copo.vy = copo.vTerminal;
    copo.alfa = 0;
    copo.posada = false;
}

// Impulso a la nieve y tormenta. Escala con el nivel: los copos cercanos se mueven más.
function agitar(intensidad, dirX, dirY, origen) {
    if (menosMovimiento.matches) return;
    finTormenta = performance.now() + DURACION_TORMENTA;

    const fuerza = Math.min(intensidad, 4) * 0.12;
    for (const copo of copos) {
        let peso = copo.nivel.velocidad;
        if (origen) {
            const d = distancia(copo.x, copo.y, origen.x, origen.y);
            peso *= 0.35 + 0.65 * Math.max(0, 1 - d / 500);
        }
        copo.posada = false;
        copo.alfa = Math.max(copo.alfa, 0.7);
        copo.vx += (aleatorio(-1, 1) * fuerza + dirX * fuerza * 0.8) * peso;
        copo.vy += (-aleatorio(0.3, 1.2) * fuerza + dirY * fuerza * 0.8) * peso;
        copo.vx = limitar(copo.vx, -1.2, 1.2);
        copo.vy = limitar(copo.vy, -1.2, 1.2);
    }
}

// Tormenta, refuerzos e inclinación: valores globales suavizados
function actualizarClimaNieve(dt, ahora) {
    const f = dt / 16.7;
    const agitando = ahora < finTormenta;
    tormenta += ((agitando ? TORMENTA_MAX : 1) - tormenta) * SUAVIZADO_TORMENTA * f;
    refuerzos += ((agitando ? 1 : 0) - refuerzos) * SUAVIZADO_TORMENTA * f;

    // Mover el cursor es como ladear la bola: la nieve deriva hacia ese lado, con inercia
    const objetivo = cursorBola ? (cursorBola.x / LADO_BOLA - 0.5) * 0.9 : 0;
    inclinacion += (objetivo - inclinacion) * SUAVIZADO_INCLINACION * f;
}

function actualizarNieve(dt) {
    const f = dt / 16.7;
    const relajacion = 1 - Math.exp(-dt / 700);   // vuelta suave a la caída lenta

    for (const copo of copos) {
        if (copo.posada) {
            copo.alfa -= dt / DURACION_FUNDIDO;   // se funde en el suelo
            if (copo.alfa <= 0) renacerCopo(copo);
            continue;
        }
        if (copo.alfa < 1) copo.alfa = Math.min(1, copo.alfa + dt / 1500);

        copo.vx += (0 - copo.vx) * relajacion;
        copo.vy += (copo.vTerminal * tormenta - copo.vy) * relajacion;
        copo.fase += copo.vFase * dt;
        copo.rot += copo.vrot * dt;

        copo.x += (copo.vx + Math.sin(copo.fase) * BALANCEO * copo.nivel.velocidad) * dt
                + inclinacion * copo.profundidad * tormenta * f;
        copo.y += copo.vy * dt;

        // Repulsión: la nieve se aparta del dedo (solo media y cerca)
        if (copo.nivel.reaccionaCursor && cursorBola) {
            const dx = copo.x - cursorBola.x;
            const dy = copo.y - cursorBola.y;
            const d = Math.hypot(dx, dy);
            if (d > 0.01 && d < RADIO_EMPUJE) {
                const empuje = (RADIO_EMPUJE - d) * 0.1 * f;
                copo.x += (dx / d) * empuje;
                copo.y += (dy / d) * empuje;
            }
        }

        // Rebote suave contra el cristal
        const dx = copo.x - CENTRO;
        const dy = copo.y - CENTRO;
        const d = Math.hypot(dx, dy);
        const limite = RADIO_BOLA - copo.r - 4;
        if (d > limite) {
            const nx = dx / d;
            const ny = dy / d;
            copo.x = CENTRO + nx * limite;
            copo.y = CENTRO + ny * limite;
            const vn = copo.vx * nx + copo.vy * ny;
            if (vn > 0) {
                copo.vx -= 1.5 * vn * nx;
                copo.vy -= 1.5 * vn * ny;
            }
        }

        // Se posa al tocar su suelo
        const suelo = alturaSuelo(copo.x, copo.nivel.perfil);
        if (copo.vy >= 0 && copo.y >= suelo) {
            copo.y = suelo;
            copo.posada = true;
        }
    }
}

// Refracción de un copo: dónde se VE y cuánto encoge cerca del borde.
// Solo se usa al dibujar: la posición real (copo.x, copo.y) no se toca,
// porque es la que usan el rebote contra el cristal y el suelo.
function refractarPunto(x, y) {
    const dx = x - CENTRO;
    const dy = y - CENTRO;
    const d = Math.hypot(dx, dy);
    const u = d / RADIO_BOLA;
    if (u < U0 || d < 0.01) return { x, y, k: 1 };

    const t = Math.min((u - U0) / (1 - U0), 1);
    const uu = U0 + (1 - U0) * Math.pow(t, 1 / P_COPOS);   // empuja hacia el borde
    const k = 1 - 0.45 * t;                                  // y encoge
    return { x: CENTRO + (dx / d) * uu * RADIO_BOLA, y: CENTRO + (dy / d) * uu * RADIO_BOLA, k };
}

function dibujarNieve() {
    for (const c of CONTEXTOS_NIEVE) c.clearRect(0, 0, LADO_BOLA, LADO_BOLA);

    for (const copo of copos) {
        const visible = copo.refuerzo ? refuerzos : 1;
        if (visible < 0.01) continue;                 // los refuerzos ocultos ni se dibujan
        const alfa = copo.opacidad * copo.alfa * visible;
        if (alfa <= 0) continue;

        const sprites = copo.nivel.sprites;
        const idx = sprites.length > 1
            ? Math.floor((((copo.rot % GIRO) + GIRO) % GIRO) / GIRO * PASOS) % PASOS
            : 0;
        const p = refractarPunto(copo.x, copo.y);
        const tam = copo.r * 2.5 * p.k;               // el brazo de la estrella mide 0,4 del sprite
        const c = copo.nivel.ctx;
        c.globalAlpha = alfa * (0.35 + 0.65 * p.k);   // cerca del borde también se apaga
        c.drawImage(sprites[idx], p.x - tam / 2, p.y - tam / 2, tam, tam);
    }
    for (const c of CONTEXTOS_NIEVE) c.globalAlpha = 1;
}

/* -------------------------------------------------------------------------
   Refracción de la escena por anillos (se ejecuta UNA vez al cargar)

   En vez de recorrer 590 000 píxeles, la escena se dibuja 28 veces, cada
   vez recortada a un anillo y escalada un poco menos que 1 respecto al
   centro: el píxel a radio r muestra lo que había a r / s, más afuera.
   Así el contenido se comprime contra el filo, como en una lente esférica.
   La escarcha NO se refracta: está sobre el cristal, no dentro.
   ------------------------------------------------------------------------- */
// Discos anidados de FUERA hacia DENTRO, en vez de anillos con agujero:
// cada disco tapa por completo al anterior, así que no queda ninguna rendija
// entre bordes suavizados por donde se cuele el fondo (los aros finos que
// salían con clip('evenodd'), incluso con el solape de 0,6 px).
// Requisito: el origen tiene que ser OPACO (ver pintarFondoCristal), o las
// partes semitransparentes de la escena se acumularían 29 veces.
function refractarEscena(origen, destino) {
    const d = destino.getContext('2d');
    const cx = origen.width / 2;
    const cy = origen.height / 2;
    d.clearRect(0, 0, destino.width, destino.height);

    for (let i = PASOS_REFRACCION - 1; i >= 0; i--) {
        const t0 = i / PASOS_REFRACCION;
        const t1 = (i + 1) / PASOS_REFRACCION;
        // el disco exterior sobresale 2 px: el recorte de .bola hace el filo final
        const radio = RADIO_BOLA * (U0 + (1 - U0) * t1) + (i === PASOS_REFRACCION - 1 ? 2 : 0);
        const t = (t0 + t1) / 2;
        const s = 1 - (1 - COMPRESION) * Math.pow(t, 0.8);

        d.save();
        d.beginPath();
        d.arc(cx, cy, radio, 0, Math.PI * 2);
        d.clip();
        d.translate(cx, cy);
        d.scale(s, s);
        d.translate(-cx, -cy);
        d.drawImage(origen, 0, 0);
        d.restore();
    }

    // zona central: se copia tal cual, encima de todo
    d.save();
    d.beginPath();
    d.arc(cx, cy, RADIO_BOLA * U0, 0, Math.PI * 2);
    d.clip();
    d.drawImage(origen, 0, 0);
    d.restore();
}

// Fondo opaco del origen: el MISMO degradado que el background de .bola-inclinable
// en style.css (616 px, centro al 34 % / 27 %), pasado a este canvas de 1040
// (la bola empieza en 135, 135). Si se cambia allí, hay que cambiarlo aquí.
// La foto lo tapa casi entero; sigue haciendo falta porque refractarEscena()
// necesita un origen opaco.
function pintarFondoCristal(o) {
    const desfase = (LADO_ESCENA - LADO_BOLA) / 2;
    const fx = desfase + LADO_BOLA * 0.34;
    const fy = desfase + LADO_BOLA * 0.27;
    const degradado = o.createRadialGradient(fx, fy, 0, fx, fy, 616);
    degradado.addColorStop(0, '#3B3428');      // --interior-luz
    degradado.addColorStop(0.52, '#241F18');   // --interior-medio
    degradado.addColorStop(1, '#15120E');      // --interior-borde
    o.fillStyle = degradado;
    o.fillRect(0, 0, LADO_ESCENA, LADO_ESCENA);
}

function cargarImagen(src) {
    return new Promise((resolver, rechazar) => {
        const imagen = new Image();
        imagen.onload = () => resolver(imagen);
        imagen.onerror = rechazar;
        imagen.src = src;
    });
}

// Compone la escena estática en un canvas de 1040 × 1040 y la refracta:
//   fondo del cristal → foto del árbol, difuminada → duna delantera (SVG, nítida)
// Si alguna imagen falla, se compone con lo que haya cargado.
async function cargarEscena() {
    const texto = new XMLSerializer().serializeToString(escenaVector);
    const urlDuna = URL.createObjectURL(new Blob([texto], { type: 'image/svg+xml;charset=utf-8' }));

    const [foto, duna] = await Promise.allSettled([
        cargarImagen(FONDO.src),
        cargarImagen(urlDuna)
    ]);
    URL.revokeObjectURL(urlDuna);

    const { canvas: origen, ctx: o } = crearCanvas(LADO_ESCENA);
    pintarFondoCristal(o);   // origen opaco, imprescindible para refractarEscena()

    if (foto.status === 'fulfilled') {
        // El difuminado va SOLO a la foto: la duna y los juguetes quedan nítidos
        // delante, como con poca profundidad de campo. Se hace una vez, al cargar,
        // no en cada fotograma: no cuesta nada durante la animación.
        const img = foto.value;
        o.filter = DIFUMINADO_FONDO;
        o.drawImage(img, FONDO.x, FONDO.y, img.naturalWidth * FONDO.escala, img.naturalHeight * FONDO.escala);
        o.filter = 'none';
    }

    if (duna.status === 'fulfilled') {
        o.drawImage(duna.value, 0, 0, LADO_ESCENA, LADO_ESCENA);
    }

    refractarEscena(origen, canvasEscena);
    escenaInterior.classList.add('refractada');
}

/* -------------------------------------------------------------------------
   Ambiente: polvo, haz de luz, brillo del cristal, sombra larga,
   inclinación de la bola y temblor del titular
   ------------------------------------------------------------------------- */
const motas = POLVO.map(([x, y, r]) => {
    const circulo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circulo.setAttribute('class', 'mota');
    circulo.setAttribute('r', r);
    circulo.setAttribute('cx', x);
    circulo.setAttribute('cy', y);
    circulo.setAttribute('opacity', '0.2');
    grupoPolvo.appendChild(circulo);
    return {
        circulo, x, y, r,
        amplitud: aleatorio(5, 12),
        velocidad: aleatorio(0.00035, 0.0008),
        fase: Math.random() * Math.PI * 2
    };
});

// Ángulo actual del barrido CSS, en radianes. Se lee el tiempo de la propia
// animación, así el polvo y el haz van siempre a la par. La curva ease-in-out
// se aproxima con un coseno: la diferencia no se aprecia.
// Con movimiento reducido no hay animación y el haz se queda quieto (0°).
function anguloHaz() {
    const animacion = hazLuz.getAnimations ? hazLuz.getAnimations()[0] : null;
    if (!animacion || animacion.currentTime === null) return 0;
    const fase = (animacion.currentTime % PERIODO_HAZ) / PERIODO_HAZ;
    return -GIRO_HAZ * Math.cos(fase * Math.PI * 2);   // −3,5° al empezar, +3,5° a mitad
}

// 0 = la mota está fuera del haz, 1 = está en su línea central.
// (x, y) en coordenadas del cartel; el punto se lleva al sistema del haz
// deshaciendo su parallax (desplX, desplY) y su giro (angulo).
function factorHaz(x, y, angulo, desplX, desplY) {
    const dx = x - desplX - PIVOTE_HAZ.x;
    const dy = y - desplY - PIVOTE_HAZ.y;
    const cos = Math.cos(angulo);
    const sin = Math.sin(angulo);
    const hx = PIVOTE_HAZ.x + dx * cos + dy * sin;
    const hy = PIVOTE_HAZ.y - dx * sin + dy * cos;

    const d = Math.abs((hx - HAZ_X) * HAZ_NX + (hy - HAZ_Y) * HAZ_NY);
    const desvanecido = limitar(1 - hy / 1100, 0, 1);   // el haz se apaga hacia la repisa
    return Math.max(0, 1 - d / ANCHO_HAZ) * desvanecido;
}

// La bola se ladea hasta MAX_GRADOS hacia el cursor (suavizado).
// Va en .bola-inclinable, nunca en .bola: así el área que recibe el ratón no se mueve.
function inclinarBola(x, y) {
    const ry = limitar((x - CENTRO_CARTEL_X) / 424, -1, 1) * MAX_GRADOS;
    const rx = -limitar((y - CENTRO_CARTEL_Y) / 600, -1, 1) * MAX_GRADOS;

    // Con perspectiva, el lado que se aleja encoge (hasta ~5 px a 3°) y dejaría una
    // media luna sin escarcha dentro del recorte circular. Se compensa con la escala
    // justa para que ese lado vuelva a llegar al radio: 1 en reposo, ~1,016 a tope.
    const theta = Math.hypot(rx, ry) * Math.PI / 180;
    const compensar = (PERSPECTIVA + RADIO_BOLA * Math.sin(theta)) / (PERSPECTIVA * Math.cos(theta));

    const transform = `perspective(${PERSPECTIVA}px) rotateX(${rx.toFixed(2)}deg) `
        + `rotateY(${ry.toFixed(2)}deg) scale(${compensar.toFixed(4)})`;
    if (transform !== ultimaInclinacion) {
        ultimaInclinacion = transform;
        inclinable.style.transform = transform;
    }
}

// El titular dice que nadie juega nunca con esta bola: cuando alguien la agita,
// las letras lo acusan. Palabra a palabra, para que se lea como intencionado
// y no como un fallo de renderizado. Sube y baja con la misma tormenta de la nieve.
function temblarTitular(ahora) {
    if (tormenta > UMBRAL_TEMBLOR) {
        if (ahora - ultimoTemblor < CADENCIA_TEMBLOR) return;
        ultimoTemblor = ahora;
        const amplitud = (tormenta - 1) * AMPLITUD_TEMBLOR;
        for (const p of palabras) {
            const tx = (Math.random() - 0.5) * amplitud;
            const ty = (Math.random() - 0.5) * amplitud;
            p.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px)`;
        }
        temblando = true;
    } else if (temblando) {
        for (const p of palabras) p.style.transform = '';
        temblando = false;
    }
}

function actualizarAmbiente(ahora, dt) {
    // El cursor suavizado evita saltos bruscos en los efectos de fondo
    const k = 1 - Math.exp(-dt / 180);
    cursorSuave.x += (cursorCartel.x - cursorSuave.x) * k;
    cursorSuave.y += (cursorCartel.y - cursorSuave.y) * k;

    const nx = limitar((cursorSuave.x - CENTRO_CARTEL_X) / RADIO_BOLA, -1, 1);
    const ny = limitar((cursorSuave.y - CENTRO_CARTEL_Y) / RADIO_BOLA, -1, 1);

    // Haz de luz: ±12 px, contrario al cursor (el barrido lo hace CSS en #haz-luz)
    const hazX = -nx * 12;
    const hazY = -ny * 12;
    hazParallax.setAttribute('transform', `translate(${hazX.toFixed(1)} ${hazY.toFixed(1)})`);

    // Polvo: deriva continua + parallax de 5 px. Se enciende al cruzar el haz
    const angulo = anguloHaz();
    for (const m of motas) {
        const x = m.x + Math.sin(ahora * m.velocidad + m.fase) * m.amplitud - nx * 5;
        const y = m.y + Math.cos(ahora * m.velocidad * 0.7 + m.fase) * m.amplitud * 0.5 - ny * 5;
        const f = factorHaz(x, y, angulo, hazX, hazY);
        m.circulo.setAttribute('cx', x.toFixed(1));
        m.circulo.setAttribute('cy', y.toFixed(1));
        m.circulo.setAttribute('opacity', (0.20 + f * 0.62).toFixed(2));
        m.circulo.setAttribute('r', (m.r * (1 + f * 0.35)).toFixed(2));
    }

    inclinarBola(cursorSuave.x, cursorSuave.y);
    temblarTitular(ahora);

    // Brillo: se mueve en sentido CONTRARIO al cursor, máximo 20 px
    grupoBrillo.setAttribute('transform', `translate(${(-nx * 20).toFixed(1)} ${(-ny * 20).toFixed(1)})`);

    // Sombra larga: se alarga y gira según la posición del cursor
    sombraLarga.setAttribute('rx', (252 * (1 + Math.abs(nx) * 0.14)).toFixed(1));
    sombraLarga.setAttribute('transform',
        `translate(${(-nx * 18).toFixed(1)} 0) rotate(${(-nx * 2.5).toFixed(2)} 486 1104)`);
}

/* -------------------------------------------------------------------------
   Nevada de fondo (pluja)
   Copos que caen como lluvia sobre el muro, detrás de la bola: constantes,
   casi rectos y con un poco de viento. Es fondo: discreta, sin interacción.
   · El copo es el mismo sprite de seis puntas que la nieve de dentro
     (crearSpriteCopo), con 8 rotaciones pre-renderizadas para girar sin coste.
   · Cada copo tiene una profundidad: los cercanos son más grandes, más
     rápidos y algo más visibles. Eso da sensación de espacio sin paralaje.
   · Los que caen detrás de la bola ni se dibujan: la bola los tapa.
   · Con movimiento reducido se pinta una vez y se queda quieta.
   ------------------------------------------------------------------------- */
const spritesPluja = Array.from({ length: PASOS }, (_, i) => crearSpriteCopo(28, true, (i / PASOS) * GIRO));
const DESVIO_VENT = ALTO * PLUJA.VENT;          // lo que se desplaza en horizontal al cruzar el cartel
let plujaPintada = false;

// Si dentroDelCartel, nace en cualquier altura (al cargar); si no, justo por encima
function crearCopoPluja(dentroDelCartel) {
    const z = Math.random();
    const mida = interpolar(PLUJA.MIDA, z);
    return {
        x: aleatorio(-DESVIO_VENT, ANCHO),           // nace también a la izquierda: el viento lo trae
        y: dentroDelCartel ? aleatorio(0, ALTO) : -mida,
        mida,
        v: interpolar(PLUJA.VEL, z),
        opacitat: interpolar(PLUJA.OPACITAT, z),
        rot: Math.random() * GIRO,
        vrot: aleatorio(-PLUJA.VROT, PLUJA.VROT)
    };
}

const copsPluja = Array.from({ length: PLUJA.N }, () => crearCopoPluja(true));

function pluja(dt, quieto) {
    if (quieto && plujaPintada) return;
    const c = ctxNeuFons;
    c.clearRect(0, 0, ANCHO, ALTO);
    for (const p of copsPluja) {
        if (!quieto) {
            p.y += p.v * dt;
            p.x += p.v * dt * PLUJA.VENT;
            p.rot += p.vrot * dt;
            if (p.y > ALTO + p.mida || p.x > ANCHO + p.mida) Object.assign(p, crearCopoPluja(false));
        }
        // Detrás de la bola no se ve: no se dibuja
        if (distancia(p.x, p.y, CENTRO_CARTEL_X, CENTRO_CARTEL_Y) < RADIO_BOLA - p.mida) continue;

        const idx = Math.floor((((p.rot % GIRO) + GIRO) % GIRO) / GIRO * PASOS) % PASOS;
        c.globalAlpha = p.opacitat;
        c.drawImage(spritesPluja[idx], p.x - p.mida / 2, p.y - p.mida / 2, p.mida, p.mida);
    }
    c.globalAlpha = 1;
    plujaPintada = true;
}

/* -------------------------------------------------------------------------
   Bucle principal (requestAnimationFrame): aquí, y solo aquí, se dibuja
   ------------------------------------------------------------------------- */
function bucle(ahora) {
    const dt = Math.min(ahora - ultimoFrame, 50);   // topado: sin saltos al volver de otra pestaña
    ultimoFrame = ahora;
    const quieto = menosMovimiento.matches;

    // Escarcha
    reescarchar(dt, ahora);

    if (trazoPendiente && cursorBola) {
        const desde = ultimoTrazo || cursorBola;
        limpiarEscarcha(desde.x, desde.y, cursorBola.x, cursorBola.y);
        ultimoTrazo = { x: cursorBola.x, y: cursorBola.y };
        ultimoTrazoMs = ahora;
        desvanecidoHumedad = 0;
        quizaCrearGota(cursorBola.x, cursorBola.y, dt);
    }
    trazoPendiente = false;

    if (!quieto && gotas.length) actualizarGotas(dt);

    if (mascaraSucia) {
        componerEscarcha();
        dibujarGotas();
        mascaraSucia = false;
    }

    actualizarJuguetes(ahora, dt, quieto);

    // ~5 veces por segundo: % de escarcha. El resplandor, la cáustica y el color de
    // HI JUGA siguen a lo limpio que esté la bola
    if (medirEscarcha(dt)) {
        const limpio = 1 - pctEscarcha / 100;
        resplandor.style.opacity = (RESPLANDOR_BASE + limpio * RESPLANDOR_EXTRA).toFixed(3);
        caustica.style.opacity = (CAUSTICA_BASE + limpio * CAUSTICA_EXTRA).toFixed(3);
        colorTitular();
    }

    // Nieve (con movimiento reducido, quieta)
    if (!quieto) {
        actualizarClimaNieve(dt, ahora);
        actualizarNieve(dt);
    }
    dibujarNieve();

    actualizarAmbiente(ahora, dt);
    pluja(dt, quieto);

    requestAnimationFrame(bucle);
}

/* -------------------------------------------------------------------------
   Eventos
   ------------------------------------------------------------------------- */

// 1. mouseenter: el cristal "nota" la mano y el reescarchado va lento
bola.addEventListener('mouseenter', () => {
    ratonDentro = true;
    ultimoTrazo = null;
    muestraAnterior = null;
    velocidad = 0;
    canvas.style.opacity = String(OPACIDAD_ESCARCHA_TOCADA);
});

// 2. mouseleave: el reescarchado se acelera y se apaga el hover
bola.addEventListener('mouseleave', () => {
    ratonDentro = false;
    cursorBola = null;            // en el próximo frame: ningún juguete activo
    ultimoTrazo = null;
    muestraAnterior = null;
    canvas.style.opacity = String(OPACIDAD_ESCARCHA);
});

// 3. mousemove: solo guarda datos; el dibujo lo hace bucle()
// Se mide contra .escenario (solo escalado) y se resta la posición de la bola
// en el cartel: es exacto haga lo que haga la inclinación 3D de las capas.
bola.addEventListener('mousemove', (e) => {
    const rect = escenario.getBoundingClientRect();
    const x = (e.clientX - rect.left) / escala - (CENTRO_CARTEL_X - RADIO_BOLA);   // − 39
    const y = (e.clientY - rect.top) / escala - (CENTRO_CARTEL_Y - RADIO_BOLA);    // − 285

    cursorBola = { x, y };
    trazoPendiente = true;
    detectarAgitado(x, y, e.timeStamp);
});

// 4. mousedown: si el cursor está sobre un juguete destapado, se coge.
// Se mira el juguete en el momento del clic (sin esperar al fotograma), con las
// mismas coordenadas que mousemove
bola.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const rect = escenario.getBoundingClientRect();
    const x = (e.clientX - rect.left) / escala - (CENTRO_CARTEL_X - RADIO_BOLA);
    const y = (e.clientY - rect.top) / escala - (CENTRO_CARTEL_Y - RADIO_BOLA);
    cursorBola = { x, y };
    cursorCartel.x = x + (CENTRO_CARTEL_X - RADIO_BOLA);
    cursorCartel.y = y + (CENTRO_CARTEL_Y - RADIO_BOLA);

    const j = jugueteBajoCursor();
    if (!j) return;
    e.preventDefault();          // que arrastrar no seleccione texto
    coger(j, x, y);
});

// 5. mouseup: se suelta, esté donde esté el cursor (en window, no en .bola: si el
// cursor ha salido de la bola arrastrando, también tiene que soltarlo)
window.addEventListener('mouseup', soltar);
window.addEventListener('blur', soltar);   // al cambiar de ventana a mitad de arrastre

// Velocidad del cursor → si es alta, la bola se agita
function detectarAgitado(x, y, t) {
    if (muestraAnterior) {
        const dt = t - muestraAnterior.t;
        const d = distancia(muestraAnterior.x, muestraAnterior.y, x, y);
        if (dt > 0) {
            velocidad = velocidad * 0.5 + (d / dt) * 0.5;   // px/ms, suavizada
            if (velocidad > UMBRAL_AGITADO && d > 0 && t - ultimoAgitado > 90) {
                agitar(velocidad,
                    (x - muestraAnterior.x) / d,
                    (y - muestraAnterior.y) / d,
                    { x, y });
                ultimoAgitado = t;
            }
        }
    }
    muestraAnterior = { x, y, t };
}

// Posición del cursor en todo el cartel, para el polvo, el haz, el brillo, la sombra
// y la inclinación de la bola
document.addEventListener('mousemove', (e) => {
    const rect = escenario.getBoundingClientRect();
    cursorCartel.x = (e.clientX - rect.left) / escala;
    cursorCartel.y = (e.clientY - rect.top) / escala;
});

// Si el ratón sale de la ventana, los efectos ambientales vuelven al centro
// (y la bola, suavemente, a 0°)
document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) {
        cursorCartel.x = CENTRO_CARTEL_X;
        cursorCartel.y = CENTRO_CARTEL_Y;
    }
});

window.addEventListener('resize', ajustarEscala);

/* -------------------------------------------------------------------------
   Arranque
   ------------------------------------------------------------------------- */
ajustarEscala();
pintarEscarcha();
sumaInicial = sumaAlfa();   // con la escarcha completa: el 100 % real
prepararTitular();
colorTitular();
document.fonts.ready.then(prepararTitular);   // con Anton ya cargada, las palabras cambian de sitio
cargarEscena();         // la escena se ve sin deformar hasta que la refracción está lista
requestAnimationFrame(bucle);
