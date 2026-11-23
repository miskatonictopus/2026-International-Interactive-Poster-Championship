/* ==========================================================
   Cartel interactivo 2 · 21 de diciembre
   Fundación Itaca · Juguetes para niños en riesgo de exclusión
   Diseño: Aldring Corcho · Planeta FP

   Inspirado en el cartel del Taipei Golden Horse Film Festival 2021
   (Bito Studio): objetos 3D con desenfoque de profundidad. Aquí el mando
   de PlayStation y los juguetes son para jugar con ellos:

   1. mouseenter → el cursor entra en un juguete, un botón o el mando y
                   reaccionan (se agrandan o se levantan); en "Dona un
                   regalo" todos los juguetes saltan.
   2. mouseleave → recuperan su aspecto, se suelta lo que se arrastraba y
                   el mando vuelve a su sitio.
   3. mousemove  → arrastra un juguete (se puede lanzar) o gira el mando;
                   además enciende las casillas del fondo bajo el cursor.
   4. mousedown / mouseup → pulsar los botones del mando.

   En reposo el mando queda entero y quieto: el cartel se puede imprimir.
   ========================================================== */

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

const POSTER_W = 848;
const POSTER_H = 1200;
const MAX_PIXEL_RATIO = 1.5;
const IDLE_DELAY = 2.5;         // segundos sin tocar el mando para que vuelva a su sitio

const HINT_DEFAULT = "Arrastra · gira · pulsa";
const HINT_TOY = "Arrástralo y lánzalo";
const HINT_PIECE = "Púlsalo";
const HINT_BODY = "Arrastra para girar el mando";

/* ---------- Elementos del DOM ---------- */
const stage = document.getElementById("stage");
const poster = document.getElementById("poster");
const canvas = document.getElementById("sceneCanvas");
const cta = document.getElementById("cta");
const hint = document.getElementById("hint");

/* ---------- Estado ---------- */
const pointer = { x: 0, y: 0, inside: false };   // -1 a 1 en el cartel (para el paralaje)
const orbit = { x: 0, y: 0 };                    // paralaje suavizado
const state = { lastTime: 0 };

/* ==========================================================
   ESCALADO DEL CARTEL
   ========================================================== */
function fitPoster() {
  const margin = 32;
  const scale = Math.min(
    (window.innerWidth - margin) / POSTER_W,
    (window.innerHeight - margin) / POSTER_H,
    1
  );
  stage.style.width = `${POSTER_W * scale}px`;
  stage.style.height = `${POSTER_H * scale}px`;
  poster.style.transform = `scale(${scale})`;
}

/* ==========================================================
   ESCENA
   ========================================================== */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.setSize(POSTER_W, POSTER_H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();

/* ==========================================================
   FONDO: cuadrícula isométrica (Background Boxes)
   Una cuadrícula de casillas inclinada (skew), con una cruz en las esquinas.
   Al pasar el cursor, cada casilla se enciende de un color al azar y se apaga
   sola en 2 s. Se dibuja en un canvas 2D (no en miles de <div>) y se usa como
   fondo de la escena, así el desenfoque de profundidad lo afecta igual que al
   resto. Un velo radial la funde con el color de fondo hacia los bordes.
   ========================================================== */
const BOX_ZOOM = 3;                    // tamaño de las casillas respecto al original (3 = 300 %)
const BOX_W = 64 * BOX_ZOOM;          // ancho de casilla (px locales)
const BOX_H = 32 * BOX_ZOOM;          // alto de casilla
const BOX_PAD = 16;                    // margen de la cuadrícula
const BOX_FADE = 2;                    // segundos que tarda en apagarse una casilla
const BOX_BASE = "#0f172a";            // fondo (slate-900)
const BOX_LINE = "#475569";            // líneas (slate-600)
// Colores de Navidad: rojos, verdes y dorados, con un poco de blanco nieve y azul hielo
const BOX_COLORS = [
  [220, 38, 38], [239, 68, 68], [185, 28, 28], [248, 113, 113],        // rojos
  [22, 163, 74], [34, 197, 94], [74, 222, 128], [21, 128, 61],         // verdes
  [250, 204, 21], [234, 179, 8], [253, 224, 71],                       // dorados
  [241, 245, 249], [203, 213, 225], [147, 197, 253],                   // nieve y hielo
];

// Temas de color del fondo: el botón PS del mando va cambiando de uno a otro
const THEMES = [
  { name: "Navidad", colors: BOX_COLORS.map((c) => [...c]) },
  { name: "Hielo", colors: [[56, 189, 248], [14, 165, 233], [125, 211, 252], [2, 132, 199], [186, 230, 253], [241, 245, 249], [99, 102, 241], [165, 180, 252]] },
  { name: "Oro", colors: [[250, 204, 21], [234, 179, 8], [253, 224, 71], [245, 158, 11], [251, 191, 36], [180, 83, 9], [254, 243, 199], [217, 119, 6]] },
  { name: "Violeta", colors: [[168, 85, 247], [192, 132, 252], [217, 70, 239], [124, 58, 237], [236, 72, 153], [244, 114, 182], [99, 102, 241], [233, 213, 255]] },
];
let themeIndex = 0;

// Transformación del original: translate(-40%,-60%) skewX(-48deg) skewY(14deg) scale(0.675)
// sobre una capa del tamaño del cartel colocada en left 25 % / top -25 %
const BOX_SCALE = 0.675;
const BOX_TAN_X = Math.tan((-48 * Math.PI) / 180);
const BOX_TAN_Y = Math.tan((14 * Math.PI) / 180);
const BOX_ORIGIN = [POSTER_W / 2, POSTER_H / 2];                          // centro de la capa
const BOX_SHIFT = [
  POSTER_W * 0.25 + BOX_ORIGIN[0] - POSTER_W * 0.4,
  -POSTER_H * 0.25 + BOX_ORIGIN[1] - POSTER_H * 0.6,
];
// Matriz 2x2 de la transformación (cuadrícula → cartel) y su inversa
const BOX_M = [
  BOX_SCALE * (1 + BOX_TAN_X * BOX_TAN_Y), BOX_SCALE * BOX_TAN_X,
  BOX_SCALE * BOX_TAN_Y, BOX_SCALE,
];
const BOX_DET = BOX_M[0] * BOX_M[3] - BOX_M[1] * BOX_M[2];
const BOX_INV = [BOX_M[3] / BOX_DET, -BOX_M[1] / BOX_DET, -BOX_M[2] / BOX_DET, BOX_M[0] / BOX_DET];

const BOX_TEX_W = 512;
const BOX_TEX_H = Math.round((BOX_TEX_W * POSTER_H) / POSTER_W);
const BOX_K = BOX_TEX_W / POSTER_W;    // píxeles de textura por píxel de cartel

function makeCanvas() {
  const c = document.createElement("canvas");
  c.width = BOX_TEX_W;
  c.height = BOX_TEX_H;
  return c;
}
const boxesCanvas = makeCanvas();      // lo que ve la escena
const gridCanvas = makeCanvas();       // cuadrícula fija (se dibuja una vez)
const veilCanvas = makeCanvas();       // velo radial fijo
const boxesTexture = new THREE.CanvasTexture(boxesCanvas);
boxesTexture.colorSpace = THREE.SRGBColorSpace;
scene.background = boxesTexture;

const litBoxes = new Map();            // casillas encendidas: "i,j" → { i, j, color, start }
let lastBox = "";
let boxesDirty = true;

// Punto del cartel → casilla (i = columna, j = fila)
function boxAt(px, py) {
  const dx = px - BOX_SHIFT[0];
  const dy = py - BOX_SHIFT[1];
  const ux = BOX_INV[0] * dx + BOX_INV[1] * dy + BOX_ORIGIN[0];
  const uy = BOX_INV[2] * dx + BOX_INV[3] * dy + BOX_ORIGIN[1];
  return [Math.floor((ux - BOX_PAD) / BOX_W), Math.floor((uy - BOX_PAD) / BOX_H)];
}

// Pone el contexto en el espacio de la cuadrícula (casillas en px locales)
function gridSpace(ctx) {
  ctx.setTransform(
    BOX_K * BOX_M[0], BOX_K * BOX_M[2], BOX_K * BOX_M[1], BOX_K * BOX_M[3],
    BOX_K * (BOX_SHIFT[0] - (BOX_M[0] * BOX_ORIGIN[0] + BOX_M[1] * BOX_ORIGIN[1])),
    BOX_K * (BOX_SHIFT[1] - (BOX_M[2] * BOX_ORIGIN[0] + BOX_M[3] * BOX_ORIGIN[1]))
  );
}

// Rango de casillas que cubre el cartel (con un margen)
function visibleBoxes() {
  const corners = [[0, 0], [POSTER_W, 0], [0, POSTER_H], [POSTER_W, POSTER_H]].map(([x, y]) => boxAt(x, y));
  const is = corners.map((c) => c[0]);
  const js = corners.map((c) => c[1]);
  return [Math.min(...is) - 2, Math.max(...is) + 2, Math.min(...js) - 2, Math.max(...js) + 2];
}

// Cuadrícula fija: fondo, líneas y cruces en las esquinas pares
function drawBoxGrid() {
  const ctx = gridCanvas.getContext("2d");
  const [i0, i1, j0, j1] = visibleBoxes();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = BOX_BASE;
  ctx.fillRect(0, 0, BOX_TEX_W, BOX_TEX_H);

  gridSpace(ctx);
  ctx.strokeStyle = BOX_LINE;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let i = i0; i <= i1; i++) {
    ctx.moveTo(BOX_PAD + i * BOX_W, BOX_PAD + j0 * BOX_H);
    ctx.lineTo(BOX_PAD + i * BOX_W, BOX_PAD + j1 * BOX_H);
  }
  for (let j = j0; j <= j1; j++) {
    ctx.moveTo(BOX_PAD + i0 * BOX_W, BOX_PAD + j * BOX_H);
    ctx.lineTo(BOX_PAD + i1 * BOX_W, BOX_PAD + j * BOX_H);
  }
  ctx.stroke();

  ctx.lineWidth = 1.3;
  ctx.beginPath();
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      if (i % 2 || j % 2) continue;
      const x = BOX_PAD + i * BOX_W - 2;
      const y = BOX_PAD + j * BOX_H - 2;
      ctx.moveTo(x - 14, y); ctx.lineTo(x + 14, y);
      ctx.moveTo(x, y - 14); ctx.lineTo(x, y + 14);
    }
  }
  ctx.stroke();
}

// Velo: transparente en el centro y del color de fondo en las esquinas
function drawBoxVeil() {
  const ctx = veilCanvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, BOX_TEX_W, BOX_TEX_H);
  ctx.translate(BOX_TEX_W / 2, BOX_TEX_H / 2);
  ctx.scale((BOX_TEX_W / 2) * Math.SQRT2, (BOX_TEX_H / 2) * Math.SQRT2);
  const veil = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  veil.addColorStop(0, "rgba(15, 23, 42, 0)");
  veil.addColorStop(1, "rgba(15, 23, 42, 0.92)");
  ctx.fillStyle = veil;
  ctx.fillRect(-1, -1, 2, 2);
}

// Cuadrícula + casillas encendidas + velo
function drawBoxes(t) {
  const ctx = boxesCanvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(gridCanvas, 0, 0);
  ctx.drawImage(veilCanvas, 0, 0);

  // Las casillas encendidas van por encima del velo para que se vean vivas
  // también en los bordes
  gridSpace(ctx);
  const moved = [];
  litBoxes.forEach((box, key) => {
    const age = t - box.start;
    if (age < 0) return;                       // todavía no le toca encenderse (ola de color)
    let alpha;
    if (box.press) {
      // Botón mantenido: la casilla se queda encendida a tope mientras siga pulsado
      alpha = Math.min(1, age / 0.15) * (0.92 + 0.08 * Math.sin(t * 6 + box.i + box.j));
    } else if (box.hold) {
      // Luz que se queda: aparece despacio y "respira" un poco
      alpha = HOLD_ALPHA * Math.min(1, age / 0.6) * (0.85 + 0.15 * Math.sin(t * 1.4 + box.phase));
    } else {
      alpha = Math.min(1, (1 - age / BOX_FADE) * 1.15);
      if (alpha <= 0) { litBoxes.delete(key); return; }
    }
    if (box.hold && t - box.changed >= HOLD_CHANGE) {
      // Le toca moverse: esta casilla se apaga y su luz aparece en otra casilla
      box.hold = false;
      box.start = t - (1 - HOLD_ALPHA) * BOX_FADE;
      moved.push(box.color);
    }
    const c = box.color;
    ctx.fillStyle = `rgba(${c[0] | 0}, ${c[1] | 0}, ${c[2] | 0}, ${alpha})`;
    ctx.fillRect(BOX_PAD + box.i * BOX_W, BOX_PAD + box.j * BOX_H, BOX_W, BOX_H);
  });
  moved.forEach((color) => spawnHold(t, color, 0.4));
  boxesTexture.needsUpdate = true;
}

// El cursor entra en una casilla: se enciende de un color al azar
function enterBox(px, py, t) {
  const [i, j] = boxAt(px, py);
  const key = `${i},${j}`;
  if (key === lastBox) return;
  lastBox = key;
  litBoxes.set(key, { i, j, color: BOX_COLORS[Math.floor(Math.random() * BOX_COLORS.length)], start: t });
}

// Luces que se quedan encendidas cuando el cursor sale del cartel: algunas casillas
// de varios colores siguen brillando, solo en el fondo y lejos de los textos
const HOLD_ALPHA = 0.55;               // intensidad de las luces que se quedan
const HOLD_COUNT = 20;                // cuántas casillas se quedan
const HOLD_ZONE = [120, 850];          // franja del cartel (y) donde pueden quedarse: sin tocar los textos

const HOLD_CHANGE = 5;                 // cada cuántos segundos una luz salta a otra casilla

// Enciende una luz que se queda en una casilla libre del fondo
function spawnHold(t, color, fade) {
  for (let tries = 0; tries < 60; tries++) {
    const [i, j] = boxAt(Math.random() * POSTER_W, HOLD_ZONE[0] + Math.random() * (HOLD_ZONE[1] - HOLD_ZONE[0]));
    const key = `${i},${j}`;
    if (litBoxes.get(key)?.hold) continue;
    litBoxes.set(key, {
      i, j, color, start: t + Math.random() * fade, hold: true, phase: Math.random() * Math.PI * 2,
      changed: t + Math.random() * HOLD_CHANGE,      // cada luz se mueve en su propio momento
    });
    return;
  }
}

function holdLights(t) {
  // Las últimas casillas que encendió el cursor se quedan (hasta 4)...
  let kept = 0;
  litBoxes.forEach((box) => {
    const age = t - box.start;
    if (box.hold || age < 0 || age > 1.2 || kept >= 4) return;
    box.hold = true;
    box.phase = Math.random() * Math.PI * 2;
    box.start = t - 0.3;
    box.changed = t + Math.random() * HOLD_CHANGE;
    kept++;
  });

  // ...y se añaden otras repartidas por el fondo, cada una de un color distinto
  const colors = [...BOX_COLORS].sort(() => Math.random() - 0.5);
  for (let n = 0; n < HOLD_COUNT - kept; n++) spawnHold(t, colors[n % colors.length], 0.6);
}

// El cursor vuelve al cartel: las luces que se habían quedado se apagan poco a poco
function releaseLights(t) {
  litBoxes.forEach((box) => {
    if (!box.hold) return;
    box.hold = false;
    box.start = t - (1 - HOLD_ALPHA) * BOX_FADE;   // sigue desde su brillo actual
  });
}

// Ola de color al pulsar un botón: radio en casillas (ancho, alto) y segundos que tarda
// en llegar al borde. Con las casillas a 300 %, [3, 4] cubre la misma zona que antes [8, 12].
const WAVE_RADIUS = [3, 4];
const WAVE_SPEED = 0.6;

// Ola de color: enciende las casillas alrededor de un punto del cartel, de dentro a fuera
function lightArea(px, py, color, t, press = false) {
  const [ci, cj] = boxAt(px, py);
  const [rx, ry] = WAVE_RADIUS;
  for (let di = -rx; di <= rx; di++) {
    for (let dj = -ry; dj <= ry; dj++) {
      const d = Math.hypot(di / rx, dj / ry);
      if (d > 1) continue;
      litBoxes.set(`${ci + di},${cj + dj}`, { i: ci + di, j: cj + dj, color, start: t + d * WAVE_SPEED, press });
    }
  }
}

// Al soltar el botón, las casillas mantenidas se apagan poco a poco
function releasePressedBoxes(t) {
  litBoxes.forEach((box) => {
    if (!box.press) return;
    box.press = false;
    box.start = Math.max(box.start, t);
  });
}

drawBoxGrid();
drawBoxVeil();
drawBoxes(0);

/* ==========================================================
   LUZ, CÁMARA Y GRUPOS
   ========================================================== */
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
pmrem.dispose();

const camera = new THREE.PerspectiveCamera(30, POSTER_W / POSTER_H, 0.1, 45);

const keyLight = new THREE.DirectionalLight("#fff4dd", 2.2);
keyLight.position.set(-4, 6, 8);
scene.add(keyLight);

// Luz de contorno desde atrás y un lado: dibuja un borde claro en los juguetes y los separa del fondo
const rimLight = new THREE.DirectionalLight("#cfe2ff", 4.5);
rimLight.position.set(5, 3, -8);
scene.add(rimLight);

// Cámara fija, algo de paralaje con el ratón y desenfoque de profundidad suave
const HOME = { target: [0, -0.9, 0], dist: 23, pitch: 0.04, aperture: 0.0004 };

const figure = new THREE.Group();           // todo el conjunto, con una ligera inclinación
figure.rotation.set(0.16, -0.22, -0.05);
scene.add(figure);

const controllerPivot = new THREE.Group();  // el mando: gira cuando se arrastra
figure.add(controllerPivot);
const toyGroup = new THREE.Group();         // los juguetes
figure.add(toyGroup);

const lookAt = new THREE.Vector3();
function updateCamera(dt) {
  const k = 1 - Math.exp(-dt * 3);
  orbit.x += ((pointer.inside ? pointer.x : 0) - orbit.x) * k;
  orbit.y += ((pointer.inside ? pointer.y : 0) - orbit.y) * k;

  figure.updateMatrixWorld();
  lookAt.set(...HOME.target);
  figure.localToWorld(lookAt);
  const yaw = orbit.x * 0.1;
  const pitch = HOME.pitch - orbit.y * 0.06;
  camera.position.set(
    lookAt.x + Math.sin(yaw) * Math.cos(pitch) * HOME.dist,
    lookAt.y + Math.sin(pitch) * HOME.dist,
    lookAt.z + Math.cos(yaw) * Math.cos(pitch) * HOME.dist
  );
  camera.lookAt(lookAt);
}
updateCamera(1);

/* ==========================================================
   JUGUETES: flotan alrededor del mando, a distintas profundidades.
   Se pueden agarrar, mover y lanzar. Modelos de la carpeta modelos/
   (ver créditos en el README).
   ========================================================== */
// pos = posición respecto al mando (x, y, z), size = tamaño, spin = giro (rad/s)
const TOYS = [
  { file: "gbc", pos: [-3.4, 2.9, 1.0], size: 1.3, spin: [0.25, 0.4, 0.1] },
  { file: "ape", pos: [3.3, 2.6, -1.5], size: 1.5, spin: [0.1, -0.35, 0.05] },
  { file: "mario", pos: [-3.7, 0.3, 2.0], size: 1.1, spin: [0.05, 0.5, 0] },
  { file: "crash", pos: [3.6, 1.3, 2.5], size: 1.2, spin: [0, -0.45, 0.05] },
  { file: "clank", pos: [-2.6, -2.9, 2.0], size: 1.1, spin: [0.1, 0.4, 0] },
  { file: "steve", pos: [2.7, -2.7, 1.5], size: 1.0, spin: [0.15, -0.5, 0] },
  { file: "klonoa", pos: [-0.9, 3.5, -2.5], size: 1.0, spin: [0.4, 0.3, 0.2] },
  { file: "kanye", pos: [-4.6, -1.5, -2.0], size: 1.5, spin: [0.05, 0.3, 0] },
  { file: "rayman", pos: [4.5, -1.4, -1.5], size: 1.3, spin: [0, -0.35, 0.05] },
  { file: "dexter", pos: [0.4, -2.0, 3.5], size: 0.9, spin: [0.1, 0.45, 0] },
  { file: "daftpunk", pos: [-1.6, 3.0, 3.0], size: 0.9, spin: [0.2, 0.5, 0] },
  { file: "deadmau5", pos: [1.2, 3.0, 3.5], size: 0.9, spin: [0.2, -0.5, 0] },
  { file: "sly", pos: [-4.4, 2.0, -3.5], size: 1.5, spin: [0.1, 0.25, 0.15] },
  { file: "minecraft", pos: [4.2, -0.2, -3.0], size: 1.3, spin: [0.3, -0.25, 0.1] },
  { file: "zelda", pos: [-2.7, -2.3, 4.0], size: 0.8, spin: [0, 0.6, 0] },
  // Cinco más, en versión pequeña (los mismos modelos, para no añadir peso a la carga)
  { file: "mario", pos: [-1.4, -3.3, 0.8], size: 0.75, spin: [0.1, -0.5, 0] },
  { file: "steve", pos: [1.9, 3.5, -0.5], size: 0.75, spin: [0.1, 0.45, 0] },
  { file: "klonoa", pos: [4.2, 3.3, 2.0], size: 0.75, spin: [0.3, -0.35, 0.1] },
  { file: "dexter", pos: [-4.2, -3.5, 0.5], size: 0.75, spin: [0.1, 0.4, 0] },
  { file: "gbc", pos: [4.3, -2.3, 3.0], size: 0.75, spin: [0.2, -0.3, 0.1] },
];
const toys = [];

// Centra un modelo y lo escala para que su lado más largo mida "size"
function normalizeToy(source, size) {
  const box = new THREE.Box3().setFromObject(source);
  const dimensions = box.getSize(new THREE.Vector3());
  source.position.sub(box.getCenter(new THREE.Vector3()));
  const wrapper = new THREE.Group();
  wrapper.add(source);
  wrapper.scale.setScalar(size / Math.max(dimensions.x, dimensions.y, dimensions.z));
  return wrapper;
}

/* ---------- Adornos de Navidad: modelados con formas simples (sin archivos) ---------- */
function xmasMaterial(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...extra });
}
function xmasPart(geometry, material, position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.scale.set(...scale);
  return mesh;
}

function makeSantaHat() {
  const red = xmasMaterial(0xc8102e);
  const white = xmasMaterial(0xf5f5f0, { roughness: 0.9 });
  const g = new THREE.Group();
  g.add(xmasPart(new THREE.ConeGeometry(0.5, 1.1, 24), red, [0, 0, 0]));
  g.add(xmasPart(new THREE.TorusGeometry(0.5, 0.14, 12, 28), white, [0, -0.52, 0], [Math.PI / 2, 0, 0]));
  g.add(xmasPart(new THREE.SphereGeometry(0.17, 16, 12), white, [0, 0.58, 0]));
  return g;
}

function makeSanta() {
  const red = xmasMaterial(0xc8102e);
  const white = xmasMaterial(0xf5f5f0, { roughness: 0.9 });
  const black = xmasMaterial(0x15151a);
  const skin = xmasMaterial(0xf0b8a0);
  const gold = xmasMaterial(0xe0b030, { metalness: 0.6, roughness: 0.35 });
  const g = new THREE.Group();
  g.add(xmasPart(new THREE.CylinderGeometry(0.3, 0.5, 0.9, 20), red, [0, 0.6, 0]));          // cuerpo
  g.add(xmasPart(new THREE.CylinderGeometry(0.52, 0.52, 0.1, 20), white, [0, 0.17, 0]));     // borde del abrigo
  g.add(xmasPart(new THREE.CylinderGeometry(0.42, 0.45, 0.1, 20), black, [0, 0.55, 0]));     // cinturón
  g.add(xmasPart(new THREE.BoxGeometry(0.15, 0.13, 0.05), gold, [0, 0.55, 0.45]));           // hebilla
  [-1, 1].forEach((side) => {
    g.add(xmasPart(new THREE.CapsuleGeometry(0.11, 0.35, 6, 10), red, [side * 0.44, 0.7, 0], [0, 0, side * -0.5]));   // brazos
    g.add(xmasPart(new THREE.SphereGeometry(0.1, 10, 8), white, [side * 0.55, 0.5, 0]));                              // puños
    g.add(xmasPart(new THREE.BoxGeometry(0.2, 0.14, 0.3), black, [side * 0.18, 0.05, 0.05]));                         // botas
  });
  g.add(xmasPart(new THREE.SphereGeometry(0.27, 18, 14), skin, [0, 1.3, 0]));                // cabeza
  g.add(xmasPart(new THREE.SphereGeometry(0.28, 18, 14), white, [0, 1.12, 0.1], [0, 0, 0], [1, 0.85, 0.75]));   // barba
  g.add(xmasPart(new THREE.SphereGeometry(0.035, 8, 6), black, [-0.1, 1.36, 0.24]));         // ojos
  g.add(xmasPart(new THREE.SphereGeometry(0.035, 8, 6), black, [0.1, 1.36, 0.24]));
  g.add(xmasPart(new THREE.SphereGeometry(0.055, 10, 8), xmasMaterial(0xe08080), [0, 1.28, 0.27]));   // nariz
  g.add(xmasPart(new THREE.ConeGeometry(0.28, 0.55, 18), red, [0.03, 1.72, 0], [0, 0, -0.2]));        // gorro
  g.add(xmasPart(new THREE.TorusGeometry(0.27, 0.07, 10, 22), white, [0, 1.5, 0], [Math.PI / 2, 0, 0]));
  g.add(xmasPart(new THREE.SphereGeometry(0.09, 12, 10), white, [0.17, 1.98, 0]));
  return g;
}

function makeReindeer() {
  const fur = xmasMaterial(0x8b5a2b, { roughness: 0.85 });
  const light = xmasMaterial(0xc99a62, { roughness: 0.85 });
  const horn = xmasMaterial(0xe6d8b0);
  const nose = xmasMaterial(0xff2a2a, { emissive: 0xaa0000, emissiveIntensity: 0.6 });
  const scarf = xmasMaterial(0xc8102e);
  const black = xmasMaterial(0x15151a);
  const g = new THREE.Group();
  g.add(xmasPart(new THREE.SphereGeometry(0.5, 20, 14), fur, [0, 0.75, 0], [0, 0, 0], [1.35, 0.8, 0.8]));   // cuerpo
  g.add(xmasPart(new THREE.SphereGeometry(0.26, 16, 12), fur, [0.66, 1.1, 0]));                              // cabeza
  g.add(xmasPart(new THREE.SphereGeometry(0.15, 12, 10), light, [0.87, 1.03, 0], [0, 0, 0], [1.1, 0.9, 0.9]));  // hocico
  g.add(xmasPart(new THREE.SphereGeometry(0.075, 12, 10), nose, [1.0, 1.03, 0]));                            // nariz roja
  g.add(xmasPart(new THREE.TorusGeometry(0.2, 0.055, 10, 18), scarf, [0.5, 0.95, 0], [0, Math.PI / 2, 0.5])); // bufanda
  g.add(xmasPart(new THREE.SphereGeometry(0.09, 10, 8), xmasMaterial(0xf5f5f0), [-0.68, 0.85, 0]));          // cola
  [-1, 1].forEach((side) => {
    g.add(xmasPart(new THREE.SphereGeometry(0.03, 8, 6), black, [0.82, 1.17, side * 0.12]));                 // ojos
    g.add(xmasPart(new THREE.ConeGeometry(0.07, 0.2, 8), fur, [0.58, 1.34, side * 0.2], [side * 0.7, 0, 0]));  // orejas
    // cuernos: una vara y dos ramas
    g.add(xmasPart(new THREE.CylinderGeometry(0.022, 0.032, 0.5, 8), horn, [0.6, 1.5, side * 0.15], [side * 0.3, 0, 0.15]));
    g.add(xmasPart(new THREE.CylinderGeometry(0.018, 0.024, 0.28, 8), horn, [0.68, 1.55, side * 0.26], [side * 0.9, 0, -0.6]));
    g.add(xmasPart(new THREE.CylinderGeometry(0.018, 0.024, 0.24, 8), horn, [0.54, 1.66, side * 0.22], [side * 0.8, 0, 0.7]));
    [-1, 1].forEach((front) => g.add(xmasPart(new THREE.CylinderGeometry(0.06, 0.05, 0.55, 10), fur, [front * 0.4, 0.28, side * 0.2])));  // patas
  });
  return g;
}

function makeStar() {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 ? 0.24 : 0.55;
    const angle = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  const g = new THREE.Group();
  g.add(xmasPart(geometry, xmasMaterial(0xf2c230, { metalness: 0.5, roughness: 0.35, emissive: 0x3a2a00 }), [0, 0, -0.08]));
  return g;
}

// Adornos de Navidad (mismo comportamiento que los juguetes: se agarran, chocan y rebotan)
const XMAS = [
  { make: makeSanta, pos: [-2.5, -1.0, 3.0], size: 1.2, spin: [0, 0.5, 0] },
  { make: makeReindeer, pos: [3.1, -0.7, 3.4], size: 1.3, spin: [0, -0.45, 0] },
  { make: makeSantaHat, pos: [0.5, -2.4, 3.0], size: 0.95, spin: [0.1, 0.5, 0.15] },
  { make: makeStar, pos: [0.0, 2.4, 4.0], size: 0.85, spin: [0, 0.7, 0.1] },
];

// Hace que un juguete destaque sobre el fondo oscuro: más reflejos y un poco de luz propia
// (su propia textura brilla suavemente, así no se apaga en las zonas en sombra)
const TOY_PUNCH = 0.22;                // 0 = como antes; más = más luminosos
function punchUp(m) {
  if (m.envMapIntensity !== undefined) m.envMapIntensity = 1.8;
  if (m.map) { m.emissiveMap = m.map; m.emissive.set(0xffffff); }
  else if (m.color) m.emissive.copy(m.color);
  m.emissiveIntensity = TOY_PUNCH;
  m.needsUpdate = true;
}

// Crea el juguete (datos de física + brillo) a partir de un objeto 3D ya cargado o modelado
function addToy(def, index, object) {
  const holder = new THREE.Group();
  holder.add(normalizeToy(object, def.size));
  holder.position.set(...def.pos);
  holder.rotation.set(index, index * 2, 0);
  toyGroup.add(holder);
  const toy = {
    holder,
    size: def.size,
    home: new THREE.Vector3(...def.pos),   // sitio de reposo
    base: new THREE.Vector3(...def.pos),   // posición actual (sin el balanceo)
    vel: new THREE.Vector3(),              // velocidad al lanzarlo
    spin: def.spin,
    boost: new THREE.Vector3(),            // giro extra que se va apagando
    phase: index * 1.7,
    speed: 0.5 + (index % 4) * 0.12,
    scale: 1,
    hovered: false,
    returning: false,                      // vuelve solo a su sitio
    homing: false,                         // vuelta obligada (al salir el cursor): los choques no la cancelan
    shock: null,                           // onda que le va a llegar { at, color, dx, dy, strength }
    glow: 0,                               // brillo del color de la onda (se apaga solo)
    glowColor: new THREE.Color(),
    materials: [],
  };
  // Materiales que pueden brillar cuando les llega la onda de un botón
  object.traverse((o) => {
    if (!o.isMesh) return;
    [].concat(o.material).forEach((m) => {
      if (!m.emissive || toy.materials.includes(m)) return;
      punchUp(m);
      m.userData.baseEmissive = m.emissive.clone();
      m.userData.baseIntensity = m.emissiveIntensity;
      toy.materials.push(m);
    });
  });
  holder.userData.toy = toy;
  toys.push(toy);
}

function loadToys() {
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/");
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  TOYS.forEach((def, index) => {
    loader.load(`modelos/${def.file}.glb`, (gltf) => addToy(def, index, gltf.scene), undefined,
      (error) => console.warn(`No se pudo cargar ${def.file}`, error));
  });
  XMAS.forEach((def, i) => addToy(def, TOYS.length + i, def.make()));
}

// Rebotes: 1 sería un rebote perfecto (sin perder velocidad)
const WALL_BOUNCE = 0.9;               // contra los bordes del cartel
const TOY_BOUNCE = 0.9;                // entre juguetes
const TOY_DAMPING = 0.9;               // lo que frena el aire (menos = deslizan más)
const MAX_SPEED = 16;

// Un golpe: el juguete deja de volver solo a su sitio y gira un poco por el impacto
function bounce(toy) {
  if (!toy.homing) toy.returning = false;
  toy.boost.x += (Math.random() - 0.5) * 5;
  toy.boost.y += (Math.random() - 0.5) * 5;
}

// Límites visibles a la profundidad del juguete, para que no se salga del cartel
function clampToy(toy) {
  const distance = HOME.dist - toy.base.z;
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
  const halfW = halfH * (POSTER_W / POSTER_H);
  const margin = toy.size * 0.45;
  const limits = [halfW - margin, halfH - margin];
  const centerY = HOME.target[1];

  if (Math.abs(toy.base.x) > limits[0]) {
    toy.base.x = Math.sign(toy.base.x) * limits[0];
    if (Math.abs(toy.vel.x) > 0.5) bounce(toy);
    toy.vel.x *= -WALL_BOUNCE;
  }
  if (Math.abs(toy.base.y - centerY) > limits[1]) {
    toy.base.y = centerY + Math.sign(toy.base.y - centerY) * limits[1];
    if (Math.abs(toy.vel.y) > 0.5) bounce(toy);
    toy.vel.y *= -WALL_BOUNCE;
  }
}

// El mando como obstáculo: tres cajas (las dos empuñaduras y la parte central) en las
// coordenadas del propio mando, calculadas del modelo al cargarlo.
// c = centro, h = medias dimensiones
const COLLIDERS = [];                  // se rellena al cargar el mando (loadController)
const controllerInverse = new THREE.Quaternion();
const localPos = new THREE.Vector3();
const localVel = new THREE.Vector3();
const contact = new THREE.Vector3();
const hitNormal = new THREE.Vector3();

// Un juguete no atraviesa el mando: choca y rebota. Si lo arrastras contra él, sale por
// el lado por el que menos se ha metido, así que normalmente acaba encima (delante).
function collideToy(toy) {
  const radius = toy.size * 0.45;
  controllerInverse.copy(controllerPivot.quaternion).invert();
  localPos.copy(toy.base).applyQuaternion(controllerInverse);   // posición en coordenadas del mando
  let pushed = false;

  for (const { c, h } of COLLIDERS) {
    contact.set(
      THREE.MathUtils.clamp(localPos.x, c[0] - h[0], c[0] + h[0]),
      THREE.MathUtils.clamp(localPos.y, c[1] - h[1], c[1] + h[1]),
      THREE.MathUtils.clamp(localPos.z, c[2] - h[2], c[2] + h[2])
    );
    hitNormal.subVectors(localPos, contact);
    let distance = hitNormal.length();
    if (distance >= radius) continue;

    if (distance > 1e-4) {
      hitNormal.divideScalar(distance);                         // desde fuera: empuja hacia fuera
    } else {
      // El centro está dentro de la caja: sale por el eje con menos penetración
      const depth = [h[0] - Math.abs(localPos.x - c[0]), h[1] - Math.abs(localPos.y - c[1]), h[2] - Math.abs(localPos.z - c[2])];
      const axis = depth.indexOf(Math.min(...depth));
      hitNormal.set(0, 0, 0);
      hitNormal.setComponent(axis, Math.sign(localPos.getComponent(axis) - c[axis]) || 1);
      distance = -depth[axis];
    }
    localPos.addScaledVector(hitNormal, radius - distance);

    // Rebote: se le quita la velocidad que llevaba contra el mando
    localVel.copy(toy.vel).applyQuaternion(controllerInverse);
    const into = localVel.dot(hitNormal);
    if (into < 0) {
      localVel.addScaledVector(hitNormal, -(1 + 0.45) * into);
      toy.vel.copy(localVel).applyQuaternion(controllerPivot.quaternion);
    }
    pushed = true;
  }

  if (pushed) toy.base.copy(localPos).applyQuaternion(controllerPivot.quaternion);
}

// Choques entre juguetes: círculos en el plano del cartel (x, y). Solo chocan los que están
// a una profundidad parecida. El que está agarrado no se mueve: empuja a los demás.
const PAIR_DEPTH = 1.6;                // diferencia de profundidad máxima para chocar
function collideToys() {
  for (let a = 0; a < toys.length; a++) {
    for (let b = a + 1; b < toys.length; b++) {
      const A = toys[a];
      const B = toys[b];
      if (Math.abs(A.base.z - B.base.z) > PAIR_DEPTH + (A.size + B.size) * 0.3) continue;
      const dx = B.base.x - A.base.x;
      const dy = B.base.y - A.base.y;
      const minDist = (A.size + B.size) * 0.45 * (A.scale + B.scale) * 0.5;
      const distSq = dx * dx + dy * dy;
      if (distSq >= minDist * minDist) continue;

      const dist = Math.sqrt(distSq) || 1e-4;
      const nx = dist > 1e-3 ? dx / dist : 1;
      const ny = dist > 1e-3 ? dy / dist : 0;
      const grabA = drag.mode === "toy" && drag.toy === A;
      const grabB = drag.mode === "toy" && drag.toy === B;
      const massA = A.size * A.size;
      const massB = B.size * B.size;

      // Se separan (el agarrado no cede)
      const overlap = minDist - dist;
      const shareA = grabA ? 0 : grabB ? 1 : massB / (massA + massB);
      A.base.x -= nx * overlap * shareA;
      A.base.y -= ny * overlap * shareA;
      B.base.x += nx * overlap * (1 - shareA);
      B.base.y += ny * overlap * (1 - shareA);

      // Rebotan: se intercambia velocidad a lo largo de la línea que une los centros
      const vaN = (grabA ? drag.vel.x : A.vel.x) * nx + (grabA ? drag.vel.y : A.vel.y) * ny;
      const vbN = (grabB ? drag.vel.x : B.vel.x) * nx + (grabB ? drag.vel.y : B.vel.y) * ny;
      const closing = vaN - vbN;
      if (closing <= 0) continue;                      // ya se separan
      const j = ((1 + TOY_BOUNCE) * closing) / (1 / massA + 1 / massB);   // impulso entre dos libres
      const impulseA = grabA ? 0 : grabB ? (1 + TOY_BOUNCE) * closing : j / massA;
      const impulseB = grabB ? 0 : grabA ? (1 + TOY_BOUNCE) * closing : j / massB;
      A.vel.x -= nx * impulseA;
      A.vel.y -= ny * impulseA;
      B.vel.x += nx * impulseB;
      B.vel.y += ny * impulseB;
      if (closing > 0.6) { bounce(A); bounce(B); }
    }
  }
}

// Cada juguete gira, sube y baja un poco, y se mueve si lo han agarrado o lanzado
function updateToys(t, dt) {
  collideToys();
  toys.forEach((toy) => {
    const grabbed = drag.mode === "toy" && drag.toy === toy;

    if (grabbed) {
      toy.base.lerp(drag.target, 1 - Math.exp(-dt * 18));
      toy.returning = false;
    } else {
      toy.base.addScaledVector(toy.vel, dt);
      toy.vel.multiplyScalar(Math.exp(-dt * TOY_DAMPING));
      if (toy.vel.lengthSq() > MAX_SPEED * MAX_SPEED) toy.vel.setLength(MAX_SPEED);
      if (toy.returning) {
        toy.base.lerp(toy.home, 1 - Math.exp(-dt * 3));
        if (toy.base.distanceTo(toy.home) < 0.03) { toy.returning = false; toy.homing = false; }
      }
      clampToy(toy);
    }
    collideToy(toy);

    // Cuando la onda de un botón llega al juguete, lo empuja hacia fuera y lo ilumina
    if (toy.shock && t >= toy.shock.at) {
      const s = toy.shock;
      toy.vel.x += s.dx * 7 * s.strength;
      toy.vel.y += s.dy * 7 * s.strength;
      toy.boost.set((Math.random() - 0.5) * 8 * s.strength, (Math.random() - 0.5) * 8 * s.strength, (Math.random() - 0.5) * 4);
      toy.glowColor.setRGB(s.color[0] / 255, s.color[1] / 255, s.color[2] / 255);
      toy.glow = 1;
      toy.returning = !grabbed;                // después de la sacudida vuelve a su sitio
      toy.shock = null;
    }
    if (toy.glow > 0.004 || toy.materials.some((m) => m.emissiveIntensity !== m.userData.baseIntensity)) {
      toy.glow = toy.glow > 0.004 ? toy.glow * Math.exp(-dt * 2) : 0;
      toy.materials.forEach((m) => {
        m.emissive.copy(m.userData.baseEmissive).lerp(toy.glowColor, toy.glow);
        m.emissiveIntensity = THREE.MathUtils.lerp(m.userData.baseIntensity, 1.2, toy.glow);
      });
    }

    toy.boost.multiplyScalar(Math.exp(-dt * 1.5));
    toy.holder.rotation.x += (toy.spin[0] + toy.boost.x) * dt;
    toy.holder.rotation.y += (toy.spin[1] + toy.boost.y) * dt;
    toy.holder.rotation.z += (toy.spin[2] + toy.boost.z) * dt;
    toy.holder.position.set(toy.base.x, toy.base.y + Math.sin(t * toy.speed + toy.phase) * 0.22, toy.base.z);

    // Al pasar el cursor se agrandan un poco; agarrados, algo más
    const goal = grabbed ? 1.3 : toy.hovered ? 1.15 : 1;
    toy.scale += (goal - toy.scale) * (1 - Math.exp(-dt * 12));
    toy.holder.scale.setScalar(toy.scale);
  });
}

// Acciones de los botones sobre los juguetes
function nudgeToys(dx, dy) {
  toys.forEach((toy) => {
    toy.returning = false;
    toy.vel.x += dx * 5;
    toy.vel.y += dy * 5;
    toy.boost.z += dx * 2 - dy * 2;
  });
}

// La onda de un botón de acción sale del botón: cada juguete recibe un empujón hacia
// fuera (más fuerte cuanto más cerca) y se ilumina del color del botón cuando le llega
function shockToys(px, py, color, t) {
  toys.forEach((toy) => {
    toy.holder.getWorldPosition(tmp);
    tmp.project(camera);
    const dx = ((tmp.x + 1) / 2) * POSTER_W - px;
    const dy = ((1 - tmp.y) / 2) * POSTER_H - py;
    const distance = Math.hypot(dx, dy) || 1;
    toy.shock = {
      at: t + distance / 800,                  // la onda viaja a unos 800 px/s
      color,
      dx: dx / distance,
      dy: -dy / distance,                      // en pantalla Y crece hacia abajo
      strength: THREE.MathUtils.clamp(1.2 - distance / 900, 0.3, 1),
    };
  });
}

function resetToys() {
  toys.forEach((toy) => { toy.returning = true; toy.boost.y += 3; });
}

// Stick izquierdo: todos los juguetes giran a toda velocidad (el giro se va apagando solo)
function spinToys() {
  toys.forEach((toy) => {
    const dir = Math.random() < 0.5 ? -1 : 1;
    toy.boost.set((Math.random() - 0.5) * 10, dir * (14 + Math.random() * 8), (Math.random() - 0.5) * 10);
  });
}

// Stick derecho: los juguetes salen disparados hacia arriba y rebotan por el cartel (no vuelven solos a su sitio)
function launchToys() {
  toys.forEach((toy) => {
    toy.returning = false;
    toy.homing = false;
    toy.vel.y += 9 + Math.random() * 5;
    toy.vel.x += (Math.random() - 0.5) * 6;
    toy.boost.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, 0);
  });
}

function jumpToys() {
  toys.forEach((toy) => {
    toy.vel.y += 5 + Math.random() * 3;
    toy.vel.x += (Math.random() - 0.5) * 3;
    toy.boost.set((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, 0);
    toy.returning = true;   // después de saltar vuelven a su sitio
  });
}

/* ==========================================================
   EL MANDO: PlayStation 4 (DualShock 4), modelo 3D con texturas, separado en piezas
   Archivo: mando ps4/dualshock_4_ligero.glb (el original con las texturas pasadas a WebP).
   Autor: shaielwolf (Sketchfab) · licencia CC Attribution (CC BY). Ver README.
   ========================================================== */
const MODEL_URL = encodeURI("mando ps4/dualshock_4_ligero.glb");
const MODEL_SIZE = 7.2;                         // ancho del mando en unidades de la escena
const PRESS_COLORS = {                          // color de cada botón de acción
  triangle: [55, 176, 138],
  circle: [217, 69, 61],
  cross: [88, 120, 214],
  square: [198, 104, 166],
};
const pieces = [];                              // botones del mando (se pueden pulsar)
// Colores de la imagen de referencia: negro arriba que se funde en rojo brillante abajo, símbolos rojos
const PS_RED = "#e5121d";
const PS_BLACK = "#1a0206";   // granate muy oscuro (parte alta del mando)
const PS_GARNET = "#6e0a16"; // granate medio
const GLITTER_SIZE = 22;               // granos de escarcha por unidad (más = más finos)
const GLITTER_GLOW = 1.3;              // cuánto alumbra la escarcha
const glitterTime = { value: 0 };
const stickArea = { value: new THREE.Vector3(1, 0, 0.6) };   // centro (x, y) y radio de un stick: sale del modelo      // reloj compartido para que la escarcha parpadee

// Material de una parte del mando: conserva su textura (letras, símbolos, relieve) y cambia el color.
// mode: "body" = carcasa con degradado negro → rojo; "stick" = goma roja; "button" = botones negros con símbolos rojos.
// En todos, la escarcha son granos que brillan y parpadean (emisivos, así alumbran un poco).
function makeFrostMaterial(base, mode, bottomY, heightY, barZone, barMinZ) {
  const material = base.clone();
  material.customProgramCacheKey = () => "frost-" + mode;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = glitterTime;
    shader.uniforms.uRed = { value: new THREE.Color(PS_RED) };
    shader.uniforms.uBlack = { value: new THREE.Color(PS_BLACK) };
    shader.uniforms.uGarnet = { value: new THREE.Color(PS_GARNET) };
    shader.uniforms.uBottom = { value: bottomY };
    shader.uniforms.uHeight = { value: heightY };
    shader.uniforms.uBar = { value: barZone };
    shader.uniforms.uBarZ = { value: barMinZ };
    shader.uniforms.uStick = stickArea;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", ["#include <common>", "varying vec3 vFPos;"].join("\n"))
      .replace("#include <begin_vertex>", ["#include <begin_vertex>", "vFPos = position;"].join("\n"));
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", [
        "#include <common>", "uniform float uTime;", "uniform vec3 uRed;", "uniform vec3 uBlack;", "uniform vec3 uGarnet;", "uniform float uBottom;", "uniform float uHeight;", "uniform vec4 uBar;", "uniform float uBarZ;", "uniform vec3 uStick;", "varying vec3 vFPos;",
        "float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }",
        // grano de escarcha: un punto por celda, con su propio ritmo de parpadeo
        "float sparkle(vec3 p, float density, float speed) {",
        "  vec3 id = floor(p); float h = hash13(id);",
        "  vec3 c = vec3(hash13(id + 1.7), hash13(id + 3.1), hash13(id + 5.3)) * 0.6 + 0.2;",
        "  float grain = smoothstep(0.42, 0.1, length(fract(p) - c)) * step(1.0 - density, h);",
        "  return grain * (0.15 + 0.85 * pow(max(0.0, sin(uTime * (speed + h * 2.5) + h * 60.0)), 3.0));",
        "}",
        "float frostGlow = 0.0;", "float barMask = 0.0;",
      ].join("\n"))
      .replace("#include <map_fragment>", [
        "#include <map_fragment>",
        "float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));",
        "float mx = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));",
        mode === "body" ? [
          "float t = clamp((vFPos.y - uBottom) / uHeight, 0.0, 1.0);",
          "float fade = smoothstep(0.38, 0.74, t);",
          "vec3 grad = uRed;",                                                      // rojo total, sin degradado
          "float ink = smoothstep(0.2, 0.45, lum);",                                  // letras impresas (SHARE, OPTIONS…) se conservan
          "diffuseColor.rgb = mix(grad * (0.85 + 0.6 * lum), diffuseColor.rgb, ink);",
          "frostGlow = 0.5 + 0.5 * fade;",
        ].join("\n") : mode === "pad" ? [
          // uBar = (centro x, mitad del ancho, altura de la línea, grosor)
          "float across = 1.0 - smoothstep(0.15, 1.0, abs(vFPos.x - uBar.x) / uBar.y);",      // más intensa en el centro
          "float dy = vFPos.y - uBar.z;",
          "float line = exp(-pow(dy / uBar.w, 2.0)) + 0.18 * exp(-pow((dy + uBar.w * 3.0) / (uBar.w * 3.5), 2.0));",   // línea fina + halo suave debajo
          "barMask = clamp(line * across, 0.0, 1.0);",
          "diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.18, 1.0), barMask * 0.8);",
          "frostGlow = 0.0;",
        ].join("\n") : mode === "stick" ? [
          "diffuseColor.rgb = vec3(0.02, 0.02, 0.022) * (0.6 + 2.0 * lum);",                       // palanca toda negra (el relieve se sigue viendo)
          "frostGlow = 0.0;",
        ].join("\n") : [
          "float symbol = smoothstep(0.12, 0.3, mx);",                               // los símbolos y flechas de color pasan a rojo
          "diffuseColor.rgb = mix(diffuseColor.rgb * 0.8, uRed * 1.1, symbol);",
          "frostGlow = 0.0;",
        ].join("\n"),
      ].join("\n"))
      .replace("#include <roughnessmap_fragment>", ["#include <roughnessmap_fragment>", mode === "stick" ? "roughnessFactor = 0.55;" : "roughnessFactor = 0.28;"].join("\n"))
      .replace("#include <metalnessmap_fragment>", ["#include <metalnessmap_fragment>", "metalnessFactor = 0.05;"].join("\n"))
      .replace("#include <emissivemap_fragment>", [
        "#include <emissivemap_fragment>",
        "float fine = sparkle(vFPos * " + (GLITTER_SIZE * 2).toFixed(1) + ", 0.12, 1.7);",
        "float coarse = sparkle(vFPos * " + GLITTER_SIZE.toFixed(1) + ", 0.08, 1.1);",
        "totalEmissiveRadiance += vec3(0.0, 0.18, 1.0) * barMask * " + LIGHTBAR_GLOW.toFixed(2) + ";",
        "totalEmissiveRadiance += vec3(1.0, 0.93, 0.85) * (fine * 0.8 + coarse * 0.9) * frostGlow * " + GLITTER_GLOW.toFixed(2) + ";",
      ].join("\n"));
  };
  return material;
}

const LIGHTBAR_WIDTH = 0.025;          // grosor de la línea azul
const LIGHTBAR_DROP = 0.2;             // cuánto baja la línea desde el borde de arriba del panel táctil
const LIGHTBAR_GLOW = 0.9;             // cuánto brilla
const BACKGLOW_COLOR = "#c4202c";      // resplandor detrás del mando
const BACKGLOW_OPACITY = 0.45;
const PIECE_POP = 0.03;                         // cuánto sobresalen los botones en reposo

// Divide una malla en "cascarones": grupos de triángulos que comparten vértices.
// Así los botones, que vienen dentro de mallas grandes, se convierten en piezas independientes.
// Se conservan todos los atributos (normales y los distintos juegos de UV de las texturas).
function splitShells(geometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.attributes.position;
  const ids = new Map();
  const parent = [];
  const idOf = (i) => {
    const key = `${Math.round(position.getX(i) * 1e3)},${Math.round(position.getY(i) * 1e3)},${Math.round(position.getZ(i) * 1e3)}`;
    let id = ids.get(key);
    if (id === undefined) { id = parent.length; ids.set(key, id); parent.push(id); }
    return id;
  };
  const find = (a) => {
    while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; }
    return a;
  };
  const triangles = position.count / 3;
  const roots = [];
  for (let t = 0; t < triangles; t++) {
    const a = idOf(3 * t), b = idOf(3 * t + 1), c = idOf(3 * t + 2);
    parent[find(b)] = find(a);
    parent[find(c)] = find(a);
    roots.push(a);
  }
  const groups = new Map();
  for (let t = 0; t < triangles; t++) {
    const root = find(roots[t]);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(t);
  }
  return [...groups.values()].map((list) => {
    const shell = new THREE.BufferGeometry();
    for (const name of Object.keys(source.attributes)) {
      const attribute = source.attributes[name];
      const size = attribute.itemSize;
      const array = new Float32Array(list.length * 3 * size);
      list.forEach((t, n) => {
        for (let v = 0; v < 3; v++) for (let k = 0; k < size; k++) array[(n * 3 + v) * size + k] = attribute.array[(3 * t + v) * size + k];
      });
      shell.setAttribute(name, new THREE.BufferAttribute(array, size));
    }
    shell.computeBoundingBox();
    return shell;
  });
}

// Centros de la cruceta y de los botones de acción (coordenadas del modelo original)
const DPAD_CENTER = [-9.61, 12.93];
const FACE_CENTER = [9.61, 12.93];

// Qué botón es cada cascarón, según de qué malla viene, cuántos triángulos tiene y dónde está
// (coordenadas del modelo original: x a la derecha, y hacia arriba, z hacia la cámara)
function classifyShell(meshIndex, c, triangles) {
  const front = new THREE.Vector3(0, 0, -1);
  if (meshIndex === 4 && Math.abs(c.x) < 1 && c.y > 7 && c.y < 10) return { kind: "ps", axis: front, travel: 0.05, pop: PIECE_POP };   // botón PS (el del medio, entre los sticks)
  if (meshIndex === 3 && triangles > 800) return { kind: c.x < 0 ? "L" : "R", axis: front, travel: 0.12, pop: 0.02 };   // sticks
  if (triangles < 150 || triangles > 320 || c.y < 10) return null;                                                      // cuerpo: no se pulsa
  if (Math.abs(c.x) < 7.5 && c.y > 14.5) return { kind: c.x < 0 ? "select" : "start", axis: front, travel: 0.04, pop: PIECE_POP };     // Share / Options
  const center = c.x < 0 ? DPAD_CENTER : FACE_CENTER;
  const dx = c.x - center[0];
  const dy = c.y - center[1];
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const kind = c.x < 0
    ? (horizontal ? (dx < 0 ? "left" : "right") : (dy > 0 ? "up" : "down"))                                             // cruceta
    : (horizontal ? (dx < 0 ? "square" : "circle") : (dy > 0 ? "triangle" : "cross"));                                // botones de acción
  return { kind, axis: front, travel: 0.05, pop: PIECE_POP };
}

// Caja de los vértices de una geometría que cumplen una condición
function boxOf(geometry, keep) {
  const pos = geometry.attributes.position;
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (!keep || keep(v)) box.expandByPoint(v);
  }
  return box;
}

function loadController() {
  const draco = new DRACOLoader();
  draco.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/");
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);

  loader.load(
    MODEL_URL,
    (gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const meshes = [];
      gltf.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });

      // Cada malla se lleva a coordenadas del mundo y se divide en cascarones
      const shells = [];
      meshes.forEach((mesh, meshIndex) => {
        const baked = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
        splitShells(baked).forEach((geometry) => {
          const center = geometry.boundingBox.getCenter(new THREE.Vector3());
          const triangles = geometry.attributes.position.count / 3;
          shells.push({ geometry, material: mesh.material, meshIndex, info: classifyShell(meshIndex, center, triangles) });
        });
      });

      // Centrar el modelo y escalarlo al tamaño de la escena (el modelo ya viene de frente y en pie)
      const whole = new THREE.Box3();
      shells.forEach((s) => whole.union(s.geometry.boundingBox));
      const center = whole.getCenter(new THREE.Vector3());
      const scale = MODEL_SIZE / (whole.max.x - whole.min.x);
      shells.forEach((s) => {
        s.geometry.translate(-center.x, -center.y, -center.z);
        s.geometry.scale(scale, scale, scale);
        s.geometry.computeBoundingBox();
      });

      // Barra de luz azul: una franja pintada sobre la propia carcasa, justo encima del panel táctil
      const padShell = shells.filter((x) => x.meshIndex === 2).sort((p, q) => q.geometry.attributes.position.count - p.geometry.attributes.position.count)[0];
      const pb = padShell ? padShell.geometry.boundingBox : new THREE.Box3();
      const barZone = new THREE.Vector4((pb.min.x + pb.max.x) / 2, (pb.max.x - pb.min.x) / 2, pb.max.y - LIGHTBAR_DROP, LIGHTBAR_WIDTH);
      const barMinZ = -99;                       // la franja está en el borde de la carcasa de atrás, que queda detrás del panel
      const bottomY = (whole.min.y - center.y) * scale;
      const heightY = (whole.max.y - whole.min.y) * scale;
      const sticks = shells.filter((x) => x.info && (x.info.kind === "L" || x.info.kind === "R"));
      if (sticks.length) {
        const bb = new THREE.Box3();
        sticks.forEach((x) => bb.union(x.geometry.boundingBox));
        stickArea.value.set(Math.abs(sticks[0].geometry.boundingBox.getCenter(new THREE.Vector3()).x), (bb.min.y + bb.max.y) / 2, (bb.max.y - bb.min.y) / 2);
      }
      const BODY_MESHES = [0, 1, 5, 7];                 // carcasa delantera y trasera, gatillos y detalles
      const materials = new Map();
      shells.forEach((s) => {
        const mode = s.info && (s.info.kind === "L" || s.info.kind === "R") ? "stick" : BODY_MESHES.includes(s.meshIndex) ? "body" : s.meshIndex === 2 ? "pad" : s.meshIndex === 4 ? "button" : null;
        if (!mode) return;
        const key = mode + "|" + s.material.uuid;
        if (!materials.has(key)) materials.set(key, makeFrostMaterial(s.material, mode, bottomY, heightY, barZone, barMinZ));
        s.material = materials.get(key);
      });

      shells.forEach((s) => {
        const mesh = new THREE.Mesh(s.geometry, s.material);
        if (s.info) {
          const box = s.geometry.boundingBox;
          const piece = { mesh, center: box.getCenter(new THREE.Vector3()), ...s.info, press: 0, pressed: false, lift: 0, hovered: false };
          mesh.userData.piece = piece;
          pieces.push(piece);
        } else {
          mesh.userData.body = true;
        }
        controllerPivot.add(mesh);
      });

      // Resplandor suave detrás del mando para despegarlo del fondo oscuro
      {
        const c = document.createElement("canvas"); c.width = c.height = 256;
        const g = c.getContext("2d"); const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
        grad.addColorStop(0, "rgba(255,255,255,0.9)"); grad.addColorStop(0.5, "rgba(255,255,255,0.35)"); grad.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(MODEL_SIZE * 1.5, MODEL_SIZE * 1.1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: BACKGLOW_COLOR, transparent: true, opacity: BACKGLOW_OPACITY, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        glow.position.set(0, 0, -2.2);
        glow.raycast = () => {};
        controllerPivot.add(glow);
      }

      // Obstáculos para los juguetes: una caja por empuñadura y otra para la parte central,
      // medidas de la carcasa de atrás y un poco reducidas (las empuñaduras son curvas)
      const back = shells.find((s) => s.meshIndex === 1 && s.geometry.attributes.position.count > 10000);
      if (back) {
        const edge = 7.5 * scale;
        const shrink = 0.88;
        const toCollider = (box) => ({ c: box.getCenter(new THREE.Vector3()).toArray(), h: box.getSize(new THREE.Vector3()).multiplyScalar(0.5 * shrink).toArray() });
        COLLIDERS.length = 0;
        COLLIDERS.push(toCollider(boxOf(back.geometry, (v) => v.x < -edge)), toCollider(boxOf(back.geometry, (v) => v.x > edge)), toCollider(boxOf(back.geometry, (v) => Math.abs(v.x) <= edge)));
      }
    },
    undefined,
    (error) => console.warn("No se pudo cargar el modelo del mando.", error)
  );
}

// Giro del mando: se arrastra con el ratón, sigue con inercia y vuelve a su sitio
const MOVE_FACTOR = 0.3;          // el mando casi no se mueve: así es fácil pulsar los botones
const MAX_YAW = (Math.PI / 2) * MOVE_FACTOR;   // giro máximo a cada lado: unos 27°
const DRAG_SENSITIVITY = 0.012 * MOVE_FACTOR;  // radianes por píxel arrastrado
const MAX_PITCH = 1.2 * MOVE_FACTOR;     // inclinación máxima arriba y abajo: unos 21°
const REST_YAW = 0.22;            // giro en reposo (eje Y): el mando queda ligeramente girado
const ctrl = { yaw: REST_YAW, pitch: 0, vYaw: 0, vPitch: 0, touched: -Infinity };

function updateController(t, dt) {
  const dragging = drag.mode === "controller";
  if (!dragging) {
    ctrl.yaw += ctrl.vYaw * dt;
    ctrl.pitch += ctrl.vPitch * dt;

    // Con la inercia no pasa del límite: al llegar, se para
    if (Math.abs(ctrl.yaw) > MAX_YAW) { ctrl.yaw = Math.sign(ctrl.yaw) * MAX_YAW; ctrl.vYaw = 0; }
    if (Math.abs(ctrl.pitch) > MAX_PITCH) { ctrl.pitch = Math.sign(ctrl.pitch) * MAX_PITCH; ctrl.vPitch = 0; }
    const damping = Math.exp(-dt * 2.5);
    ctrl.vYaw *= damping;
    ctrl.vPitch *= damping;

    // Sin tocarlo, vuelve a la posición de reposo
    if (t - ctrl.touched > IDLE_DELAY) {
      const k = 1 - Math.exp(-dt * 2.2);
      ctrl.yaw += (REST_YAW - ctrl.yaw) * k;
      ctrl.pitch += (0 - ctrl.pitch) * k;
    }
  }
  controllerPivot.rotation.set(ctrl.pitch, ctrl.yaw, 0);
}

// Botones: se hunden al pulsarlos y se levantan un poco al pasar el cursor
function updatePieces(dt) {
  pieces.forEach((piece) => {
    piece.press += ((piece.pressed ? 1 : 0) - piece.press) * (1 - Math.exp(-dt * (piece.pressed ? 35 : 14)));
    piece.lift += ((piece.hovered && !piece.pressed ? 1 : 0) - piece.lift) * (1 - Math.exp(-dt * 14));
    // En reposo el botón sobresale "pop"; al pulsarlo se hunde hasta quedar casi a ras
    piece.mesh.position.copy(piece.axis).multiplyScalar(piece.press * (piece.travel + piece.pop) - piece.pop - piece.lift * 0.04);
  });
}

/* ==========================================================
   DESENFOQUE DE PROFUNDIDAD (postprocesado)
   ========================================================== */
const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
composer.setSize(POSTER_W, POSTER_H);
composer.addPass(new RenderPass(scene, camera));
const bokeh = new BokehPass(scene, camera, { focus: HOME.dist, aperture: HOME.aperture, maxblur: 0.03 });
composer.addPass(bokeh);
composer.addPass(new OutputPass());
let focus = HOME.dist;
let aperture = HOME.aperture;

/* ==========================================================
   INTERACCIÓN: qué hay bajo el cursor, agarrar, girar y pulsar
   ========================================================== */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const dragPlane = new THREE.Plane();
const tmp = new THREE.Vector3();
const hover = { toy: null, piece: null, body: false };
const drag = { mode: null, toy: null, piece: null, target: new THREE.Vector3(), offset: new THREE.Vector3(), vel: new THREE.Vector3(), last: new THREE.Vector3(), lastTime: 0, x: 0, y: 0 };

// Posición del ratón en píxeles del cartel (848 × 1200), aunque esté escalado
function posterPoint(event) {
  const rect = poster.getBoundingClientRect();
  return [((event.clientX - rect.left) / rect.width) * POSTER_W, ((event.clientY - rect.top) / rect.height) * POSTER_H];
}

function setRay(px, py) {
  ndc.set((px / POSTER_W) * 2 - 1, -(py / POSTER_H) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}

// Qué hay bajo el cursor: un juguete, un botón, el cuerpo del mando o nada
function pick(px, py) {
  setRay(px, py);
  const hits = raycaster.intersectObjects([controllerPivot, toyGroup], true);
  for (const hit of hits) {
    for (let o = hit.object; o; o = o.parent) {
      if (o.userData.piece) return { type: "piece", piece: o.userData.piece };
      if (o.userData.toy) return { type: "toy", toy: o.userData.toy };
      if (o.userData.body) return { type: "body" };
    }
  }
  return null;
}

/* ---------- mouseenter / mouseleave sobre cada objeto ---------- */
function enterTarget(hit) {
  if (hit.type === "toy") { hit.toy.hovered = true; hover.toy = hit.toy; hint.textContent = HINT_TOY; poster.style.cursor = "grab"; }
  if (hit.type === "piece") { hit.piece.hovered = true; hover.piece = hit.piece; hint.textContent = HINT_PIECE; poster.style.cursor = "pointer"; }
  if (hit.type === "body") { hover.body = true; hint.textContent = HINT_BODY; poster.style.cursor = "grab"; }
}

function leaveTargets() {
  if (hover.toy) hover.toy.hovered = false;
  if (hover.piece) hover.piece.hovered = false;
  hover.toy = null;
  hover.piece = null;
  hover.body = false;
  hint.textContent = HINT_DEFAULT;
  poster.style.cursor = "default";
}

function updateHover(px, py) {
  const hit = pick(px, py);
  const same = hit && ((hit.type === "toy" && hit.toy === hover.toy) || (hit.type === "piece" && hit.piece === hover.piece) || (hit.type === "body" && hover.body));
  if (same || (!hit && !hover.toy && !hover.piece && !hover.body)) return;
  leaveTargets();
  if (hit) enterTarget(hit);
}

/* ---------- Botones del mando ---------- */
// Punto del cartel (px) donde está una pieza
function pieceOnPoster(piece) {
  tmp.copy(piece.center);
  piece.mesh.localToWorld(tmp);
  tmp.project(camera);
  return [((tmp.x + 1) / 2) * POSTER_W, ((1 - tmp.y) / 2) * POSTER_H];
}

// Mientras un botón sigue pulsado, su efecto se repite cada tanto
const REPEAT_EVERY = { up: 0.12, down: 0.12, left: 0.12, right: 0.12, select: 0.6, start: 0.8, L: 0.6, R: 0.7, triangle: 0.7, circle: 0.7, cross: 0.7, square: 0.7 };
const held = { piece: null, next: 0 };

function repeatHeld(t) {
  if (!held.piece || t < held.next) return;
  held.next = t + (REPEAT_EVERY[held.piece.kind] || 1e9);
  applyPiece(held.piece, true);
}

function pressPiece(piece) {
  piece.pressed = true;
  ctrl.touched = state.lastTime;
  held.piece = piece;
  held.next = state.lastTime + (REPEAT_EVERY[piece.kind] || 1e9);
  applyPiece(piece, false);
}

function applyPiece(piece, repeat) {
  const kind = piece.kind;
  if (PRESS_COLORS[kind]) {
    const [px, py] = pieceOnPoster(piece);
    if (!repeat) lightArea(px, py, PRESS_COLORS[kind], state.lastTime, true);   // ola de color que dura lo que dure la pulsación
    shockToys(px, py, PRESS_COLORS[kind], state.lastTime);                       // y la onda llega a los juguetes
  } else if (kind === "up") nudgeToys(0, 1);
  else if (kind === "down") nudgeToys(0, -1);
  else if (kind === "left") nudgeToys(-1, 0);
  else if (kind === "right") nudgeToys(1, 0);
  else if (kind === "select") resetToys();
  else if (kind === "start") jumpToys();
  else if (kind === "L") spinToys();
  else if (kind === "R") launchToys();
  else if (kind === "ps" && !repeat) nextTheme(piece);
}

// Botón PS: cambia el tema de colores del fondo, y las casillas encendidas se pintan con el nuevo
function nextTheme(piece) {
  themeIndex = (themeIndex + 1) % THEMES.length;
  const colors = THEMES[themeIndex].colors;
  BOX_COLORS.splice(0, BOX_COLORS.length, ...colors);
  litBoxes.forEach((box) => { box.color = colors[Math.floor(Math.random() * colors.length)]; });
  const [px, py] = pieceOnPoster(piece);
  lightArea(px, py, colors[0], state.lastTime);
  hint.textContent = "Tema: " + THEMES[themeIndex].name;
  clearTimeout(nextTheme.timer);
  nextTheme.timer = setTimeout(() => { hint.textContent = HINT_DEFAULT; }, 1500);
}

function releasePiece(piece) {
  piece.pressed = false;
  if (held.piece === piece) held.piece = null;
  releasePressedBoxes(state.lastTime);
}

/* ---------- Agarrar un juguete ---------- */
function startToyDrag(toy, px, py) {
  drag.mode = "toy";
  drag.toy = toy;
  toy.returning = false;
  toy.homing = false;
  toy.vel.set(0, 0, 0);

  // Plano frente a la cámara que pasa por el juguete: el cursor lo arrastra sobre él
  camera.getWorldDirection(tmp);
  toy.holder.getWorldPosition(drag.offset);
  dragPlane.setFromNormalAndCoplanarPoint(tmp, drag.offset);
  setRay(px, py);
  const hit = raycaster.ray.intersectPlane(dragPlane, tmp);
  drag.offset.sub(hit || drag.offset);
  drag.target.copy(toy.base);
  drag.last.copy(toy.base);
  drag.vel.set(0, 0, 0);
  drag.lastTime = performance.now() * 0.001;
  hint.textContent = "Suéltalo para lanzarlo";
  poster.style.cursor = "grabbing";
}

function moveToyDrag(px, py) {
  setRay(px, py);
  if (!raycaster.ray.intersectPlane(dragPlane, tmp)) return;
  tmp.add(drag.offset);
  toyGroup.worldToLocal(tmp);
  drag.target.set(tmp.x, tmp.y, drag.toy.base.z);   // la profundidad no cambia
  const toy = drag.toy;
  const centerY = HOME.target[1];
  const distance = HOME.dist - toy.base.z;
  const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
  drag.target.x = THREE.MathUtils.clamp(drag.target.x, -(halfH * (POSTER_W / POSTER_H)), halfH * (POSTER_W / POSTER_H));
  drag.target.y = THREE.MathUtils.clamp(drag.target.y, centerY - halfH, centerY + halfH);

  // Velocidad del movimiento, para lanzarlo al soltar
  const now = performance.now() * 0.001;
  const dt = Math.max(now - drag.lastTime, 1 / 120);
  tmp.copy(drag.target).sub(drag.last).divideScalar(dt);
  drag.vel.lerp(tmp, 0.4);
  drag.last.copy(drag.target);
  drag.lastTime = now;
}

/* ---------- Girar el mando ---------- */
function startControllerDrag(px, py) {
  drag.mode = "controller";
  drag.x = px;
  drag.y = py;
  drag.lastTime = performance.now() * 0.001;
  ctrl.vYaw = 0;
  ctrl.vPitch = 0;
  ctrl.touched = state.lastTime;
  poster.style.cursor = "grabbing";
}

function moveControllerDrag(px, py) {
  const now = performance.now() * 0.001;
  const dt = Math.max(now - drag.lastTime, 1 / 120);
  const dYaw = THREE.MathUtils.clamp(ctrl.yaw + (px - drag.x) * DRAG_SENSITIVITY, -MAX_YAW, MAX_YAW) - ctrl.yaw;
  const dPitch = THREE.MathUtils.clamp(ctrl.pitch + (py - drag.y) * DRAG_SENSITIVITY, -MAX_PITCH, MAX_PITCH) - ctrl.pitch;
  ctrl.yaw += dYaw;
  ctrl.pitch += dPitch;
  ctrl.vYaw = THREE.MathUtils.lerp(ctrl.vYaw, dYaw / dt, 0.4);
  ctrl.vPitch = THREE.MathUtils.lerp(ctrl.vPitch, dPitch / dt, 0.4);
  ctrl.touched = state.lastTime;
  drag.x = px;
  drag.y = py;
  drag.lastTime = now;
}

/* ---------- Soltar ---------- */
function releaseAll() {
  if (drag.mode === "toy") {
    // Se lanza con la velocidad del movimiento (con un máximo)
    drag.toy.vel.copy(drag.vel).clampLength(0, 14);
    drag.toy.boost.set(drag.vel.y * 0.3, drag.vel.x * 0.3, 0);
  }
  if (drag.mode === "piece" && drag.piece) releasePiece(drag.piece);
  if (drag.mode === "controller") ctrl.touched = state.lastTime;
  drag.mode = null;
  drag.toy = null;
  drag.piece = null;
  poster.style.cursor = hover.toy || hover.body ? "grab" : hover.piece ? "pointer" : "default";
}

/* ==========================================================
   EVENTOS DEL RATÓN
   ========================================================== */
function handleMouseDown(event) {
  if (event.button !== 0) return;
  const [px, py] = posterPoint(event);
  const hit = pick(px, py);
  if (!hit) return;
  event.preventDefault();
  if (hit.type === "toy") startToyDrag(hit.toy, px, py);
  else if (hit.type === "piece") { drag.mode = "piece"; drag.piece = hit.piece; pressPiece(hit.piece); }
  else startControllerDrag(px, py);
}

let hoverAt = null;                    // último punto pendiente de comprobar (raycast)

// 3 · mousemove: arrastra, gira o resalta; y enciende la casilla del fondo
function handleMouseMove(event) {
  const [px, py] = posterPoint(event);
  pointer.x = (px / POSTER_W) * 2 - 1;
  pointer.y = (py / POSTER_H) * 2 - 1;
  pointer.inside = true;
  enterBox(px, py, performance.now() * 0.001);

  if (drag.mode === "toy") moveToyDrag(px, py);
  else if (drag.mode === "controller") moveControllerDrag(px, py);
  else if (!drag.mode) hoverAt = [px, py];       // se resuelve una vez por fotograma en animate()
}

// Un segundo después de sacar el cursor del cartel, todo vuelve a su posición original
const RETURN_DELAY = 1000;
let returnTimer = 0;
function sendHome() {
  toys.forEach((toy) => { toy.returning = true; toy.homing = true; toy.boost.y += 2; });
  ctrl.vYaw = 0;
  ctrl.vPitch = 0;
  ctrl.touched = -1e6;                           // el mando vuelve a reposo sin esperar
}

// 1 · mouseenter en el cartel
function handlePosterEnter() {
  pointer.inside = true;
  poster.classList.remove("is-idle");               // vuelven la ayuda y el nombre
  clearTimeout(returnTimer);
  hint.textContent = HINT_DEFAULT;
  releaseLights(state.lastTime);                 // las luces que se quedaron se apagan
}

// 2 · mouseleave: se suelta todo, se quita el resalte y algunas luces se quedan encendidas
function handlePosterLeave() {
  pointer.inside = false;
  poster.classList.add("is-idle");                  // en reposo se esconden: así se puede imprimir limpio
  releaseAll();
  leaveTargets();
  lastBox = "";
  holdLights(state.lastTime);
  clearTimeout(returnTimer);
  returnTimer = setTimeout(sendHome, RETURN_DELAY);
}

// "Dona un regalo": los juguetes saltan y la flecha avanza
function highlightCta() {
  jumpToys();
  cta.style.transform = "translateY(-4px) scale(1.07)";
  cta.querySelector(".cta__arrow").style.transform = "translateX(10px)";
}

function resetCta() {
  cta.style.transform = "none";
  cta.querySelector(".cta__arrow").style.transform = "translateX(0)";
}

loadToys();
loadController();

/* ==========================================================
   COLOR DE LOS TEXTOS SEGÚN LO QUE HAYA DETRÁS
   Cada pocos fotogramas se mira el brillo de la escena justo detrás de
   cada texto: si es oscuro, el texto pasa a claro, y al revés. Así no
   desaparece cuando el mando o el fondo se oscurecen.
   ========================================================== */
const TONE_LIGHT = "#f7f3ea";
const TONE_DARK = "#111111";
const TONE_HALO_DARK = "rgba(5, 8, 20, 0.7)";        // aureola del texto claro
const TONE_HALO_LIGHT = "rgba(247, 243, 234, 0.6)";  // aureola del texto oscuro
const TONE_W = 106;
const TONE_H = 150;
const TONE_EVERY = 10;                 // fotogramas entre mediciones
const toneCanvas = document.createElement("canvas");
toneCanvas.width = TONE_W;
toneCanvas.height = TONE_H;
const toneCtx = toneCanvas.getContext("2d", { willReadFrequently: true });
const toneItems = [...poster.querySelectorAll(".title, .poster__row, .dates, .credit-3d, .hint, .logo-slot")]
  .map((el) => ({ el, light: false }));
toneItems.forEach(({ el }) => el.classList.add("tone"));
let toneFrame = 0;

// Brillo medio (0 a 1) de la zona que ocupa un elemento
function brightnessBehind(el, posterRect) {
  const r = el.getBoundingClientRect();
  const x = THREE.MathUtils.clamp(Math.floor(((r.left - posterRect.left) / posterRect.width) * TONE_W), 0, TONE_W - 1);
  const y = THREE.MathUtils.clamp(Math.floor(((r.top - posterRect.top) / posterRect.height) * TONE_H), 0, TONE_H - 1);
  const w = THREE.MathUtils.clamp(Math.ceil((r.width / posterRect.width) * TONE_W), 1, TONE_W - x);
  const h = THREE.MathUtils.clamp(Math.ceil((r.height / posterRect.height) * TONE_H), 1, TONE_H - y);
  const data = toneCtx.getImageData(x, y, w, h).data;
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  return sum / (data.length / 4) / 255;
}

// Pone cada texto en claro u oscuro (con margen para que no parpadee)
function updateTextTone() {
  toneCtx.drawImage(canvas, 0, 0, TONE_W, TONE_H);
  const posterRect = poster.getBoundingClientRect();
  toneItems.forEach((item) => {
    const lum = brightnessBehind(item.el, posterRect);
    const light = item.light ? lum < 0.52 : lum < 0.4;
    if (light === item.light) return;
    item.light = light;
    item.el.style.setProperty("--ink", light ? TONE_LIGHT : TONE_DARK);
    item.el.style.setProperty("--halo", light ? TONE_HALO_DARK : TONE_HALO_LIGHT);
    item.el.querySelectorAll(".brand-logo").forEach((logo) => {
      // sobre fondo oscuro: "Planeta" en blanco y "FP" conserva su naranja (otro archivo del logo)
      logo.src = light ? "logo-planetafp-claro.png" : "logo-planetafp.png";
    });
  });
}

/* ==========================================================
   ANIMACIÓN
   ========================================================== */
const focusPoint = new THREE.Vector3();
let lastBoxDraw = 0;                   // el fondo se repinta como mucho a 30 fps

function animate(time) {
  const t = time * 0.001;
  const dt = Math.min(t - state.lastTime, 1 / 20);
  state.lastTime = t;

  updateCamera(dt);
  glitterTime.value = t;
  updateController(t, dt);
  updatePieces(dt);
  repeatHeld(t);
  updateToys(t, dt);

  // Un solo raycast por fotograma, por muchos mousemove que lleguen
  if (hoverAt) { if (!drag.mode && pointer.inside) updateHover(hoverAt[0], hoverAt[1]); hoverAt = null; }

  // Foco: al agarrar un juguete, el foco salta a él y lo demás se desenfoca
  let goalFocus = HOME.dist;
  let goalAperture = HOME.aperture;
  if (drag.mode === "toy") {
    drag.toy.holder.getWorldPosition(focusPoint);
    goalFocus = camera.position.distanceTo(focusPoint);
    goalAperture = 0.006;
  }
  const k = 1 - Math.exp(-dt * 6);
  focus += (goalFocus - focus) * k;
  aperture += (goalAperture - aperture) * k;
  bokeh.uniforms.focus.value = focus;
  bokeh.uniforms.aperture.value = aperture;
  // En reposo el desenfoque es casi nulo: se salta ese paso (ahorra un segundo render de la escena)
  bokeh.enabled = aperture > 0.0008;

  // Fondo: las casillas encendidas se apagan solas (si no hay ninguna, no se redibuja)
  if (litBoxes.size && t - lastBoxDraw >= 1 / 30) { lastBoxDraw = t; drawBoxes(t); }

  composer.render();
  if (++toneFrame % TONE_EVERY === 0) updateTextTone();
  requestAnimationFrame(animate);
}

/* ==========================================================
   INICIO
   ========================================================== */
poster.addEventListener("mouseenter", handlePosterEnter);
poster.addEventListener("mouseleave", handlePosterLeave);
poster.addEventListener("mousemove", handleMouseMove);
poster.addEventListener("mousedown", handleMouseDown);
window.addEventListener("mouseup", releaseAll);
cta.addEventListener("mouseenter", highlightCta);
cta.addEventListener("mouseleave", resetCta);
window.addEventListener("resize", fitPoster);

fitPoster();
hint.textContent = HINT_DEFAULT;
requestAnimationFrame(animate);
