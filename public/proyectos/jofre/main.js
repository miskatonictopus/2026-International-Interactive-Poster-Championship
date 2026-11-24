import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

/* ==========================================================================
   CONFIGURACIÓN
   ========================================================================== */

const POSTER_WIDTH = 848;
const POSTER_HEIGHT = 1200;
const VIEWPORT_MARGIN = 16;
const TITLE_WIDTH = 730;      // Ancho de la primera línea del título

const CAMERA_DISTANCE = 10;
const CAMERA_FOV = 30;
// Píxeles del cartel que ocupa una unidad 3D en el plano z = 0
const PX_PER_UNIT = POSTER_HEIGHT / (2 * CAMERA_DISTANCE * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV / 2)));

const SMOOTHING = 0.12;      // Suavizado de cada fotograma (0-1)
const HOVER_SCALE = 1.1;     // Cuánto crece un objeto bajo el cursor
const PARALLAX_DAY = 12;     // Desplazamiento máximo del «21»
const PARALLAX_MONTH = 22;   // Desplazamiento máximo de «de diciembre»
const SNOWFLAKES = 110;      // Copos de nieve en reposo
const SNOW_REPEL = 90;       // Radio en el que el cursor aparta la nieve
const MAX_TEXTURE = 1024;    // Las texturas enormes se reducen a este tamaño
const PARALLAX_MOON = 18;    // Desplazamiento máximo de la luna

// Nieve con física (matter.js): copos que se posan sobre el título, se derrumban y cubren el suelo
const PHYSICS_FLAKES = 380;  // Copos con física como máximo
const SNOW_GROUND_Y = 1196;  // El suelo: la nieve se amontona en el borde inferior
const AVALANCHE_LOAD = 10;   // Copos que aguanta una letra antes de derrumbarse
const SNOW_PUSH = 60;        // Radio en el que el cursor empuja la nieve posada

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const FILES = {
  lights: "3D/christmas_lights.glb",
  globe: "3D/snow_christmas_ball.glb",
  gifts: "3D/regalos_navidad__christmas_gifts.glb",
  bear: "3D/christmas_polar_bear.glb",
  cookies: "3D/christmas_ginger_bread_cookies.glb",
  ornaments: "3D/christmas_tree_balls.glb",
};

// Objetos colocados en píxeles del cartel para cuidar la composición.
// fit: medida que se ajusta a «size» · tag: punto donde aparece su etiqueta
const OBJECTS = {
  lights: {
    file: "lights", x: 424, y: 272, z: 0.2, size: 900, fit: "width", tilt: 0, follow: 0,
    label: "Luces", hint: "Clic: cambia el ritmo", tag: [424, 250],
  },
  globe: {
    file: "globe", x: 424, y: 566, z: -0.8, size: 250, fit: "height", tilt: 0, follow: 0.45,
    label: "Bola de nieve", hint: "Clic: agítala", tag: [424, 440],
  },
  gifts: {
    file: "gifts", x: 150, y: 768, z: 0.3, size: 200, fit: "width", tilt: 0.15, follow: 0.35,
    label: "Regalos", hint: "Clic: se abren y saltan", tag: [150, 690],
  },
  bear: {
    file: "bear", x: 738, y: 700, z: 0.3, size: 170, fit: "height", tilt: -0.3, follow: 0.35,
    label: "Sorpresa", hint: "Clic: ¡abre la caja!", tag: [700, 612],
  },
  // Las tres galletas de jengibre representan a los niños: están de pie sobre el título
  kid1: {
    file: "cookies", part: "Ginger_Bread_Cookie_01", x: 318, y: 752, z: 1.4, size: 92, fit: "height", tilt: 0.25, follow: 0.5,
    label: "Leo, 7 años", hint: "Sueña con un balón", tag: [318, 700],
  },
  kid2: {
    file: "cookies", part: "Ginger_Bread_Cookie_02", x: 424, y: 746, z: 1.4, size: 104, fit: "height", tilt: 0, follow: 0.5,
    label: "Aina, 5 años", hint: "Sueña con unos colores", tag: [424, 690],
  },
  kid3: {
    file: "cookies", part: "Ginger_Bread_Cookie_03", x: 530, y: 752, z: 1.4, size: 92, fit: "height", tilt: -0.25, follow: 0.5,
    label: "Pau, 9 años", hint: "Sueña con un libro", tag: [530, 700],
  },
};

const KIDS = ["kid1", "kid2", "kid3"];

// Bolas de Navidad que cuelgan del cable de la guirnalda (una por pieza del .glb)
const ORNAMENTS = [
  { part: "pTorus2", x: 72, length: 40, size: 56 },
  { part: "pTorus3", x: 152, length: 70, size: 62 },
  { part: "pTorus5", x: 230, length: 26, size: 50 },
  { part: "pTorus6", x: 618, length: 26, size: 50 },
  { part: "pTorus8", x: 696, length: 56, size: 62 },
  { part: "pTorus9", x: 776, length: 36, size: 56 },
]

const LIGHT_PATTERNS = ["Persecución", "Centelleo", "Alternas", "Fijas"];

// Notas (escala pentatónica) para las campanillas
const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];

/* ==========================================================================
   REFERENCIAS Y ESTADO
   ========================================================================== */

const stage = document.getElementById("stage");
const poster = document.getElementById("poster");
const sceneCanvas = document.getElementById("scene");
const snowCanvas = document.getElementById("snow");
const title = document.getElementById("title");
const dateDay = document.getElementById("dateDay");
const dateMonth = document.getElementById("dateMonth");
const brand = document.getElementById("brand");
const brandLogo = document.getElementById("brandLogo");
const loader = document.getElementById("loader");
const loaderText = document.getElementById("loaderText");
const seal = document.getElementById("seal");
const moon = document.getElementById("moon");
const soundToggle = document.getElementById("soundToggle");
const glow = document.getElementById("glow");
const wreathBow = document.getElementById("wreathBow");

let posterScale = 1;
let cursor = null;          // Posición del cursor en coordenadas del cartel
let hovered = null;         // Clave del objeto 3D bajo el cursor
let lightPattern = 0;
let titleLetters = [];
let cursorMotion = 0;       // Píxeles que se ha movido el cursor en este fotograma
let soundOn = true;
let lidsOpen = false;        // Las tapas se abren al pasar por el sello del donativo
let audio = null;

const pointer = { x: 0, y: 0 };        // Cursor normalizado (-1 a 1), suavizado
const parallax = { x: 0, y: 0 };
const wind = { value: 0, lastX: null };
const objects = {};
const garlandPoints = [];               // Puntos del cable de la guirnalda                     // Estado de cada objeto 3D
const bulbs = [];                       // Bombillas de la guirnalda
const clock = new THREE.Clock();

/* ==========================================================================
   UTILIDADES
   ========================================================================== */

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

// Curva de rebote para los saltos: 0 → 1 → 0
function hop(progress) {
  return Math.sin(Math.PI * progress);
}

function easeOutCubic(progress) {
  return 1 - Math.pow(1 - progress, 3);
}

// Traduce la posición del ratón a píxeles del cartel, aunque esté escalado
function toPosterCoordinates(event) {
  const rect = poster.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / posterScale,
    y: (event.clientY - rect.top) / posterScale,
  };
}

// Factor de perspectiva: un objeto más cerca de la cámara se ve más grande
function depthFactor(z) {
  return (CAMERA_DISTANCE - z) / CAMERA_DISTANCE;
}

// Convierte píxeles del cartel en coordenadas 3D a la profundidad z
function posterToWorld(x, y, z = 0) {
  const factor = depthFactor(z);
  return new THREE.Vector3(
    ((x - POSTER_WIDTH / 2) / PX_PER_UNIT) * factor,
    ((POSTER_HEIGHT / 2 - y) / PX_PER_UNIT) * factor,
    z
  );
}

/* ==========================================================================
   ESCALADO PROPORCIONAL
   ========================================================================== */

function fitPosterToWindow() {
  posterScale = Math.min(
    1,
    (window.innerWidth - VIEWPORT_MARGIN * 2) / POSTER_WIDTH,
    (window.innerHeight - VIEWPORT_MARGIN * 2) / POSTER_HEIGHT
  );
  poster.style.transform = `scale(${posterScale})`;
  stage.style.width = `${POSTER_WIDTH * posterScale}px`;
  stage.style.height = `${POSTER_HEIGHT * posterScale}px`;
}

/* ==========================================================================
   ESCENA 3D
   ========================================================================== */

const renderer = new THREE.WebGLRenderer({ canvas: sceneCanvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(POSTER_WIDTH, POSTER_HEIGHT, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(CAMERA_FOV, POSTER_WIDTH / POSTER_HEIGHT, 0.1, 100);
camera.position.set(0, 0, CAMERA_DISTANCE);

scene.add(new THREE.HemisphereLight(0xfff1dc, 0x0b2a20, 0.9));
const keyLight = new THREE.DirectionalLight(0xffe2b0, 2.2);
keyLight.position.set(3, 5, 6);
scene.add(keyLight);
// Luz frontal que dibuja reflejos en las bolas
const glintLight = new THREE.DirectionalLight(0xffffff, 1.4);
glintLight.position.set(-4, 3, 8);
scene.add(glintLight);
// Luz cálida que sigue al cursor, como una vela
const cursorLight = new THREE.PointLight(0xffb45c, 0, 6, 1.5);
cursorLight.position.set(0, 0, 2.5);
scene.add(cursorLight);

const raycaster = new THREE.Raycaster();

// Textura de un punto de luz difuminado, para los halos de las bombillas
function makeGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,255,255,0.45)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const glowTexture = makeGlowTexture();
// Hilo dorado del que cuelgan las bolas
const stringMaterial = new THREE.MeshStandardMaterial({ color: 0xd9b56a, metalness: 0.8, roughness: 0.35 });

/* ---------- Preparar los modelos ---------- */

// Saca una pieza de un .glb conservando su posición, giro y escala
function extractPart(root, name) {
  root.updateMatrixWorld(true);
  const part = root.getObjectByName(name);
  const holder = new THREE.Group();
  part.matrixWorld.decompose(holder.position, holder.quaternion, holder.scale);
  part.removeFromParent();
  part.position.set(0, 0, 0);
  part.quaternion.identity();
  part.scale.set(1, 1, 1);
  holder.add(part);
  return holder;
}

// Las galletas traen texturas de 4096 px: se reducen para no saturar la tarjeta gráfica
function downscaleTextures(root) {
  const done = new Set();
  root.traverse((child) => {
    if (!child.isMesh) return;
    ["map", "normalMap", "roughnessMap", "metalnessMap"].forEach((slot) => {
      const texture = child.material[slot];
      if (!texture || done.has(texture)) return;
      done.add(texture);
      const image = texture.image;
      if (!image || Math.max(image.width, image.height) <= MAX_TEXTURE) return;

      const ratio = MAX_TEXTURE / Math.max(image.width, image.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(image.width * ratio);
      canvas.height = Math.round(image.height * ratio);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      texture.image = canvas;
      texture.needsUpdate = true;
      if (image.close) image.close();
    });
  });
}

// Centra el objeto en su origen y devuelve su tamaño
function centerObject(orient) {
  orient.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(orient);
  const size = box.getSize(new THREE.Vector3());
  orient.position.sub(box.getCenter(new THREE.Vector3()));
  return size;
}

// Etiqueta HTML que aparece al pasar el cursor por un objeto
function createTag(label, hint, [x, y]) {
  const tag = document.createElement("p");
  tag.className = "tag";
  tag.style.left = `${THREE.MathUtils.clamp(x, 110, POSTER_WIDTH - 110)}px`;
  tag.style.top = `${y}px`;
  const strong = document.createElement("strong");
  strong.textContent = label;
  const span = document.createElement("span");
  span.textContent = hint;
  tag.append(strong, span);
  poster.insertBefore(tag, document.querySelector(".message"));
  return tag;
}

// Coloca un objeto: lo orienta, lo centra y lo escala a su tamaño en el cartel
function placeObject(key, model, animations = []) {
  const config = OBJECTS[key];
  const orient = new THREE.Group();
  orient.add(model);

  // La guirnalda debe quedar en horizontal: su eje más largo pasa a ser X
  if (key === "lights") {
    const size = new THREE.Box3().setFromObject(orient).getSize(new THREE.Vector3());
    if (size.z > size.x && size.z >= size.y) orient.rotation.y = Math.PI / 2;
    else if (size.y > size.x) orient.rotation.z = Math.PI / 2;
  }
  const size = centerObject(orient);

  const wrapper = new THREE.Group();
  wrapper.add(orient);
  wrapper.userData.objectKey = key;
  const z = config.z || 0;
  const baseScale = (config.size / PX_PER_UNIT / (config.fit === "width" ? size.x : size.y)) * depthFactor(z);
  const home = posterToWorld(config.x, config.y, z);
  wrapper.position.copy(home);
  wrapper.scale.setScalar(baseScale);
  scene.add(wrapper);

  objects[key] = {
    key,
    config,
    wrapper,
    home,
    baseScale,
    scale: 0,              // Empieza en 0 para aparecer con un pequeño rebote
    yaw: config.tilt,
    action: null,          // { type, start, duration }
    tag: createTag(config.label, config.hint, config.tag),
    mixer: null,
  };

  if (animations.length) {
    const mixer = new THREE.AnimationMixer(model);
    animations.forEach((clip) => mixer.clipAction(clip).play());
    objects[key].mixer = mixer;
  }

  wrapper.updateMatrixWorld(true);
  if (key === "lights") {
    prepareBulbs(model);
    collectGarlandPoints(model);
  }
  if (key === "gifts") setupGiftBoxes(objects.gifts, model);
  if (key === "bear") setupSurpriseBox(objects.bear, model);
}

// Cada bombilla recibe su propio material y un halo para encenderla por separado
function prepareBulbs(model) {
  model.traverse((child) => {
    if (!child.isMesh || !child.material.emissive) return;
    const emissive = child.material.emissive;
    if (emissive.r + emissive.g + emissive.b < 0.1) return;

    child.material = child.material.clone();
    child.material.color.copy(emissive).multiplyScalar(0.6);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture,
      color: emissive.clone(),
      transparent: true,
      depthWrite: false,
      opacity: 0,
    }));
    halo.scale.setScalar(0.38);
    halo.raycast = () => {};
    scene.add(halo);

    bulbs.push({
      mesh: child,
      halo,
      material: child.material,
      x: child.getWorldPosition(new THREE.Vector3()).x,
      phase: Math.random() * Math.PI * 2,
      speed: 2 + Math.random() * 3,
    });
  });
  // Se ordenan de izquierda a derecha para el efecto de persecución
  bulbs.sort((a, b) => a.x - b.x);
}

/* ---------- Bolas de Navidad colgantes ---------- */

// Guarda puntos del cable para saber dónde colgar cada bola
function collectGarlandPoints(model) {
  const wire = model.getObjectByName("wire") || model;
  const point = new THREE.Vector3();
  wire.traverse((child) => {
    if (!child.isMesh) return;
    const position = child.geometry.attributes.position;
    const step = Math.max(1, Math.floor(position.count / 4000));
    for (let i = 0; i < position.count; i += step) {
      garlandPoints.push(point.fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld).clone());
    }
  });
}

// Punto del cable que queda a una x del cartel (en píxeles)
function findGarlandAnchor(x) {
  if (!garlandPoints.length) return null;
  const averageZ = garlandPoints.reduce((sum, point) => sum + point.z, 0) / garlandPoints.length;
  const worldX = ((x - POSTER_WIDTH / 2) / PX_PER_UNIT) * depthFactor(averageZ);
  const near = garlandPoints.filter((point) => Math.abs(point.x - worldX) < 0.03);
  if (!near.length) return null;
  const anchor = new THREE.Vector3();
  near.forEach((point) => anchor.add(point));
  return anchor.divideScalar(near.length);
}

// Altura en píxeles del cartel de un punto 3D
function worldToPosterY(point) {
  return POSTER_HEIGHT / 2 - (point.y / depthFactor(point.z)) * PX_PER_UNIT;
}

function createOrnament(config, index, gltfScene) {
  const key = `ornament${index}`;
  const holder = extractPart(gltfScene, config.part);

  // Gira la bola para que su enganche metálico quede arriba
  const orient = new THREE.Group();
  orient.add(holder);
  orient.updateMatrixWorld(true);
  let cap = null;
  let ball = null;
  holder.traverse((child) => {
    if (!child.isMesh) return;
    if (child.material.name.startsWith("metall")) cap = child;
    else ball = child;
  });
  if (cap && ball) {
    const capCenter = new THREE.Box3().setFromObject(cap).getCenter(new THREE.Vector3());
    const ballCenter = new THREE.Box3().setFromObject(ball).getCenter(new THREE.Vector3());
    const up = capCenter.sub(ballCenter).normalize();
    orient.quaternion.setFromUnitVectors(up, new THREE.Vector3(0, 1, 0));
  }
  const size = centerObject(orient);
  makeShiny(holder);

  const anchor = findGarlandAnchor(config.x);
  if (!anchor) return;
  anchor.z += 0.02;
  const anchorY = worldToPosterY(anchor);
  const factor = depthFactor(anchor.z);
  const length = (config.length / PX_PER_UNIT) * factor;
  const scale = ((config.size / PX_PER_UNIT) * factor) / size.y;
  const halfHeight = (size.y * scale) / 2;

  // El pivote está en la guirnalda: la bola se balancea como un péndulo
  const pivot = new THREE.Group();
  pivot.position.copy(anchor);
  pivot.userData.objectKey = key;

  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, length, 6), stringMaterial);
  string.position.y = -length / 2;

  const body = new THREE.Group();
  body.position.y = -length - halfHeight;
  const inner = new THREE.Group();
  inner.scale.setScalar(scale);
  inner.add(orient);
  body.add(inner);
  pivot.add(string, body);
  scene.add(pivot);

  // Destello de luz que aparece y desaparece sobre la bola
  const twinkle = createTwinkle();
  const ballCenter = new THREE.Vector3();
  const twinklePhase = Math.random() * Math.PI * 2;
  const twinkleSpeed = 1.2 + Math.random() * 1.4;

  const state = { angle: (Math.random() - 0.5) * 0.3, velocity: 0, spinVelocity: 0.4, scale: 0, flash: 0 };
  const gravity = 9.8 / (length + halfHeight);
  const centerY = anchorY + config.length + config.size / 2;

  objects[key] = {
    key,
    wrapper: pivot,
    state,
    tag: createTag("Bola de Navidad", "Mueve el cursor para mecerla", [config.x, anchorY - 8]),

    update(time, delta) {
      let acceleration = -gravity * Math.sin(state.angle) - 1.1 * state.velocity;
      // El cursor, al pasar cerca, empuja la bola en la dirección en que se mueve
      if (cursor) {
        const gap = Math.hypot(cursor.x - config.x, cursor.y - centerY);
        if (gap < 140) acceleration += cursorMotion * (1 - gap / 140) * 0.9;
      }
      if (REDUCED_MOTION) acceleration = -gravity * state.angle - 4 * state.velocity;

      state.velocity += acceleration * delta;
      state.angle = THREE.MathUtils.clamp(state.angle + state.velocity * delta, -1.1, 1.1);
      state.spinVelocity = lerp(state.spinVelocity, 0.4, 0.02);
      state.scale = lerp(state.scale, hovered === key ? 1.15 : 1, SMOOTHING);

      pivot.rotation.z = state.angle;
      body.rotation.y += state.spinVelocity * delta;
      body.scale.setScalar(state.scale);

      // El destello se coloca arriba a la izquierda de la bola, mirando a la cámara
      body.getWorldPosition(ballCenter);
      const radius = halfHeight * 0.8 * state.scale;
      twinkle.position.set(ballCenter.x - radius * 0.4, ballCenter.y + radius * 0.25, ballCenter.z + radius);
      state.flash = Math.max(state.flash * 0.95, hovered === key ? 1 : 0);
      const glint = REDUCED_MOTION ? 0.5 : Math.pow(Math.max(0, Math.sin(time * twinkleSpeed + twinklePhase)), 12);
      const strength = Math.max(glint, state.flash);
      twinkle.material.opacity = strength;
      twinkle.material.rotation = time * 0.6;
      twinkle.scale.setScalar(radius * (1.2 + strength * 1.6));
    },

    onClick() {
      state.velocity += (Math.random() < 0.5 ? -1 : 1) * 3.5;
      state.spinVelocity = 14;
      state.flash = 1.6;
      chime(NOTES[index % NOTES.length], 0, 0.09);
      sparkleBurst(config.x, centerY, 18);
    },
  };
}

/* ---------- Vidrio de la bola de nieve ---------- */

// El modelo se ve muy oscuro: el vidrio tiene transmisión con color negro y la
// peana y el anillo son metal puro, que refleja la noche. Se cambian sus materiales.
function brightenGlobe(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    const material = child.material;
    if (material.name === "default" || material.transmission > 0) {
      // Vidrio: transparente, claro y con reflejos
      child.material = new THREE.MeshPhysicalMaterial({
        color: 0xe6f2ff,
        emissive: 0x6f8fd0,
        emissiveIntensity: 0.12,
        transparent: true,
        opacity: 0.22,
        roughness: 0.04,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        envMapIntensity: 3,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      child.renderOrder = 1;
    } else if (material.name === "Material_47") {
      // Peana: rojo lacado
      child.material = new THREE.MeshPhysicalMaterial({
        color: 0xa3202c, metalness: 0.2, roughness: 0.25, clearcoat: 1, envMapIntensity: 1.6,
      });
    } else if (material.name === "02_-_Default") {
      // Anillo de la peana: dorado
      child.material = new THREE.MeshStandardMaterial({
        color: 0xf0bb52, metalness: 0.85, roughness: 0.22, envMapIntensity: 2.2,
      });
    } else if (material.name === "Material_60") {
      // Suelo de dentro: nieve blanca
      child.material = new THREE.MeshStandardMaterial({
        color: 0xf4f7ff, emissive: 0x9fb8e8, emissiveIntensity: 0.35, roughness: 0.9,
      });
    }
  });
}

// Luz cálida dentro de la bola, un halo detrás del vidrio y un destello en el cristal
function lightUpGlobe(object) {
  const { wrapper, baseScale } = object;
  wrapper.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(wrapper.children[0]);
  const height = (box.max.y - box.min.y) / baseScale;            // En unidades del modelo
  const bottom = (box.min.y - wrapper.position.y) / baseScale;
  const domeY = bottom + height * 0.58;                          // Centro de la cúpula
  const radius = height * 0.41;

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffd28a,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  halo.position.set(0, domeY, -radius * 0.2);
  halo.scale.setScalar(radius * 2.2);
  halo.raycast = () => {};

  const glint = new THREE.Sprite(new THREE.SpriteMaterial({
    map: twinkleTexture,
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
  }));
  glint.position.set(-radius * 0.5, domeY + radius * 0.45, radius * 0.8);
  glint.scale.setScalar(radius * 0.5);
  glint.renderOrder = 10;
  glint.raycast = () => {};

  const light = new THREE.PointLight(0xffd6a0, 6, height * baseScale * 1.4, 1.5);
  light.position.set(0, domeY, 0);

  wrapper.add(halo, glint, light);
  object.glowParts = { halo, glint, light, radius };
}

function updateGlobeGlow(time) {
  const globe = objects.globe;
  if (!globe || !globe.glowParts) return;
  const { halo, glint, light, radius } = globe.glowParts;
  const shaking = globe.action && globe.action.type === "shake";
  const boost = shaking || hovered === "globe" ? 1 : 0;
  const pulse = REDUCED_MOTION ? 0 : Math.sin(time * 1.6) * 0.08;

  halo.material.opacity = lerp(halo.material.opacity, 0.5 + pulse + boost * 0.35, 0.08);
  light.intensity = lerp(light.intensity, 6 + boost * 10, 0.08);
  // Destello que cruza el cristal de vez en cuando
  const sparkle = REDUCED_MOTION ? 0.5 : Math.pow(Math.max(0, Math.sin(time * 0.9)), 14);
  glint.material.opacity = Math.max(sparkle, boost * 0.8);
  glint.material.rotation = time * 0.5;
  glint.scale.setScalar(radius * (0.35 + glint.material.opacity * 0.45));
}

/* ---------- Brillo de las bolas ---------- */

// Superficie más pulida y reflejos más intensos
function makeShiny(root) {
  root.traverse((child) => {
    if (!child.isMesh) return;
    child.material = child.material.clone();
    child.material.roughness = 0.12;
    child.material.metalness = Math.max(child.material.metalness, 0.6);
    child.material.envMapIntensity = 2.4;
  });
}

// Estrella de luz de cuatro puntas para los destellos
function makeTwinkleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d");
  const glowGradient = context.createRadialGradient(64, 64, 0, 64, 64, 30);
  glowGradient.addColorStop(0, "rgba(255,255,255,1)");
  glowGradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = glowGradient;
  context.fillRect(0, 0, 128, 128);
  context.fillStyle = "rgba(255,255,255,0.95)";
  context.beginPath();
  for (let i = 0; i < 8; i++) {
    const radius = i % 2 === 0 ? 62 : 7;
    const angle = (i * Math.PI) / 4;
    context.lineTo(64 + Math.cos(angle) * radius, 64 + Math.sin(angle) * radius);
  }
  context.closePath();
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const twinkleTexture = makeTwinkleTexture();

function createTwinkle() {
  const twinkle = new THREE.Sprite(new THREE.SpriteMaterial({
    map: twinkleTexture,
    color: 0xfff4d6,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    opacity: 0,
  }));
  twinkle.raycast = () => {};
  twinkle.renderOrder = 10;
  scene.add(twinkle);
  return twinkle;
}

/* ---------- Cajas de regalo con tapa ---------- */

// Lee una componente de un vértice (sirve para atributos normales y entrelazados)
function readComponent(attribute, index, component) {
  return [attribute.getX, attribute.getY, attribute.getZ, attribute.getW][component].call(attribute, index);
}

function buildSubGeometry(geometry, triangles) {
  const result = new THREE.BufferGeometry();
  Object.entries(geometry.attributes).forEach(([name, attribute]) => {
    const size = attribute.itemSize;
    const array = new Float32Array(triangles.length * 3 * size);
    triangles.forEach((first, t) => {
      for (let v = 0; v < 3; v++) {
        for (let c = 0; c < size; c++) array[(t * 3 + v) * size + c] = readComponent(attribute, first + v, c);
      }
    });
    result.setAttribute(name, new THREE.BufferAttribute(array, size));
  });
  return result;
}

// Separa la parte de arriba de una caja (la tapa) del resto
function splitLid(mesh, upAxis, fraction) {
  const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  geometry.computeBoundingBox();
  const min = geometry.boundingBox.min.getComponent(upAxis);
  const max = geometry.boundingBox.max.getComponent(upAxis);
  const threshold = min + (max - min) * fraction;
  const position = geometry.attributes.position;

  const lid = [];
  const body = [];
  for (let first = 0; first < position.count; first += 3) {
    let isLid = true;
    for (let v = 0; v < 3; v++) {
      if (readComponent(position, first + v, upAxis) < threshold - 1e-6) isLid = false;
    }
    (isLid ? lid : body).push(first);
  }
  if (!lid.length || !body.length) return null;
  return { lid: buildSubGeometry(geometry, lid), body: buildSubGeometry(geometry, body) };
}

// Cada caja del .glb se divide en cuerpo y tapa; la tapa gira sobre una bisagra
function setupGiftBoxes(object, model) {
  const boxes = [];
  ["regalo01", "regalo02", "regalo03", "regalo04"].forEach((name, index) => {
    const box = model.getObjectByName(name);
    if (!box) return;
    const mesh = box.children.find((child) => child.isMesh);
    const ribbon = box.children.find((child) => !child.isMesh);
    if (!mesh) return;

    // En estas cajas el eje Z local apunta hacia arriba
    const parts = splitLid(mesh, 2, 0.85);
    if (!parts) return;
    mesh.geometry = parts.body;
    mesh.material = mesh.material.clone();
    mesh.material.side = THREE.DoubleSide;    // Para ver el interior al abrirla

    parts.lid.computeBoundingBox();
    const lidBox = parts.lid.boundingBox;
    const hinge = new THREE.Vector3((lidBox.min.x + lidBox.max.x) / 2, lidBox.min.y, lidBox.min.z);

    const lidPivot = new THREE.Group();
    lidPivot.position.copy(hinge);
    box.add(lidPivot);
    const lid = new THREE.Mesh(parts.lid, mesh.material);
    lid.position.copy(hinge).negate();
    lidPivot.add(lid);
    // El lazo se va con la tapa
    if (ribbon) {
      box.updateMatrixWorld(true);
      lidPivot.attach(ribbon);
    }

    boxes.push({
      box,
      lidPivot,
      baseQuaternion: box.quaternion.clone(),
      angle: 0,
      spin: 0,
      direction: index % 2 === 0 ? 1 : -1,
      phase: index * 1.7,
    });
  });

  // Las dos bolas del modelo también brillan
  ["Esfera01", "Esfera02"].forEach((name) => {
    const sphere = model.getObjectByName(name);
    if (sphere) makeShiny(sphere);
  });

  const spinAxis = new THREE.Vector3(0, 0, 1);
  const spinRotation = new THREE.Quaternion();

  object.animateParts = (time, delta) => {
    const open = hovered === "gifts" || lidsOpen;
    const action = object.action;
    const progress = action ? (time - action.start) / action.duration : -1;

    boxes.forEach((item, index) => {
      let target;
      if (progress >= 0 && progress < 1) {
        // Al hacer clic: las tapas se abren y se cierran varias veces
        target = 1.7 * Math.abs(Math.sin(progress * Math.PI * 3 + index * 0.6));
      } else if (open) {
        target = 1.9;
      } else {
        // En reposo, cada caja se abre y se cierra a su ritmo
        target = REDUCED_MOTION ? 0 : 1.2 * Math.pow(Math.max(0, Math.sin(time * 1.3 + item.phase)), 3);
      }
      item.angle = lerp(item.angle, target, 0.18);
      item.lidPivot.rotation.x = item.angle;

      // Cada caja gira sobre sí misma
      const speed = open ? 1.8 : 0.5;
      item.spin += delta * speed * item.direction * (REDUCED_MOTION ? 0 : 1);
      spinRotation.setFromAxisAngle(spinAxis, item.spin);
      item.box.quaternion.copy(item.baseQuaternion).multiply(spinRotation);
    });
  };
}

// Coloca el lazo con su base hundida un poco en la tapa, para que se vea pegado
function seatBowOnLid(bow, lid) {
  bow.parent.updateWorldMatrix(true, true);
  const lidBox = new THREE.Box3().setFromObject(lid);
  const bowBox = new THREE.Box3().setFromObject(bow);
  const lidCenter = lidBox.getCenter(new THREE.Vector3());
  const bowCenter = bowBox.getCenter(new THREE.Vector3());
  const sink = (bowBox.max.y - bowBox.min.y) * 0.15;

  // Desplazamiento en el mundo y su equivalente dentro del padre del lazo
  const shift = new THREE.Vector3(lidCenter.x - bowCenter.x, lidBox.max.y - sink - bowBox.min.y, lidCenter.z - bowCenter.z);
  const target = bow.getWorldPosition(new THREE.Vector3()).add(shift);
  bow.position.copy(bow.parent.worldToLocal(target));
}

// La caja sorpresa: la tapa se abre y el oso sale de un salto
function setupSurpriseBox(object, model) {
  const root = model.getObjectByName("GLTF_SceneRootNode");
  const lid = root && root.getObjectByName("Tapa_7");
  const box = root && root.getObjectByName("Caja_0");
  if (!lid || !box) return;

  root.updateMatrixWorld(true);

  // El lazo dorado («Christmas Gift.001» en el .glb) va pegado a la tapa
  // En el modelo está metido dentro de la caja: se coloca centrado y apoyado sobre la tapa
  const bow = root.children.find((child) => child.name.startsWith("Christmas"));
  if (bow) seatBowOnLid(bow, lid);

  // Todo lo que no es la caja, la tapa ni el lazo es el oso
  const bearGroup = new THREE.Group();
  root.add(bearGroup);
  [...root.children].forEach((child) => {
    if (child !== lid && child !== box && child !== bow && child !== bearGroup) bearGroup.attach(child);
  });

  // Bisagra en el borde trasero inferior de la tapa
  const lidMesh = lid.children.find((child) => child.isMesh);
  lidMesh.geometry.computeBoundingBox();
  const bounds = lidMesh.geometry.boundingBox;
  lid.updateMatrix();
  const hinge = new THREE.Vector3(0, bounds.min.y, bounds.min.z).applyMatrix4(lid.matrix);
  const lidPivot = new THREE.Group();
  lidPivot.position.copy(hinge);
  root.add(lidPivot);
  lidPivot.updateMatrixWorld(true);
  lidPivot.attach(lid);
  if (bow) lidPivot.attach(bow);

  const state = { angle: 0, lift: 0 };

  object.animateParts = (time) => {
    const action = object.action;
    const progress = action ? (time - action.start) / action.duration : -1;
    let angle;
    let lift;

    if (progress >= 0 && progress < 1) {
      // Clic: el oso salta y la tapa se abre mientras está en el aire
      lift = hop(progress) * 1.3;
      angle = Math.pow(hop(progress), 2) * 2;
    } else if (hovered === "bear" || lidsOpen) {
      lift = 0.35;
      angle = 0.75;
    } else {
      // En reposo, el oso se asoma de vez en cuando
      const peek = REDUCED_MOTION ? 0 : Math.pow(Math.max(0, Math.sin(time * 0.9)), 6);
      lift = peek * 0.3;
      angle = peek * 0.6;
    }
    state.angle = lerp(state.angle, angle, 0.2);
    state.lift = lerp(state.lift, lift, 0.2);
    lidPivot.rotation.x = -state.angle;
    bearGroup.position.y = state.lift;
  };
}

/* ---------- Carga ---------- */

function loadModels() {
  const manager = new THREE.LoadingManager();
  manager.onProgress = (url, loaded, total) => {
    loaderText.textContent = `Preparando la Navidad… ${Math.round((loaded / total) * 100)}%`;
  };
  // Los modelos van comprimidos con meshopt (EXT_meshopt_compression)
  const gltfLoader = new GLTFLoader(manager).setMeshoptDecoder(MeshoptDecoder);

  const names = Object.keys(FILES);
  const requests = names.map((name) => gltfLoader.loadAsync(FILES[name]));

  Promise.all(requests)
    .then((results) => {
      const gltfs = Object.fromEntries(names.map((name, index) => [name, results[index]]));
      brightenGlobe(gltfs.globe.scene);
      ["lights", "globe", "gifts", "bear"].forEach((name) => placeObject(name, gltfs[name].scene, gltfs[name].animations));
      lightUpGlobe(objects.globe);
      downscaleTextures(gltfs.cookies.scene);
      KIDS.forEach((key) => placeObject(key, extractPart(gltfs.cookies.scene, OBJECTS[key].part)));
      ORNAMENTS.forEach((config, index) => createOrnament(config, index, gltfs.ornaments.scene));
      loader.classList.add("is-done");
    })
    .catch((error) => {
      console.error(error);
      loader.classList.add("is-error");
      loaderText.textContent =
        `No se han podido cargar los modelos 3D (${error.message || error}). Abre el cartel con un servidor local (por ejemplo, Live Server en VS Code).`;
    });
}

/* ==========================================================================
   INTERACCIONES CON LOS OBJETOS 3D
   ========================================================================== */

// Devuelve la clave del objeto 3D que hay bajo un punto del cartel
function pickObject(x, y) {
  const ndc = new THREE.Vector2((x / POSTER_WIDTH) * 2 - 1, -(y / POSTER_HEIGHT) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const wrappers = Object.values(objects).map((object) => object.wrapper);
  const [hit] = raycaster.intersectObjects(wrappers, true);
  if (!hit) return null;

  let node = hit.object;
  while (node && !node.userData.objectKey) node = node.parent;
  return node ? node.userData.objectKey : null;
}

// Equivalente a mouseenter / mouseleave para los objetos 3D del lienzo
function enterObject(key) {
  objects[key].tag.classList.add("is-visible");
  sceneCanvas.style.cursor = "pointer";
}

function leaveObject(key) {
  objects[key].tag.classList.remove("is-visible");
  sceneCanvas.style.cursor = "";
}

function setHovered(key) {
  if (key === hovered) return;
  if (hovered) leaveObject(hovered);
  hovered = key;
  if (hovered) enterObject(hovered);
}

function startAction(key, type, duration, delay = 0) {
  const object = objects[key];
  if (!object) return;
  object.action = { type, start: clock.elapsedTime + delay, duration };
}

function shakeGlobe() {
  startAction("globe", "shake", 1.6);
  burstSnow(OBJECTS.globe.x, OBJECTS.globe.y - 60, 90);
  NOTES.forEach((note, index) => chime(note, index * 0.07, 0.05));
  glow.style.opacity = 1;
  glow.style.transform = "scale(1.15)";
  setTimeout(() => {
    glow.style.opacity = "";
    glow.style.transform = "";
  }, 900);
}

function nextLightPattern() {
  lightPattern = (lightPattern + 1) % LIGHT_PATTERNS.length;
  objects.lights.tag.querySelector("span").textContent = `Ritmo: ${LIGHT_PATTERNS[lightPattern]}`;
  startAction("lights", "swing", 1.2);
  chime(NOTES[lightPattern + 1]);
  // Las bolas que cuelgan de la guirnalda se balancean con ella
  Object.values(objects).forEach((object) => {
    if (object.state) object.state.velocity += (Math.random() - 0.5) * 3;
  });
}

// Los niños (galletas) saltan de alegría, uno detrás de otro
function cheerKids(type = "cheer") {
  KIDS.forEach((key, index) => startAction(key, type, type === "cheer" ? 1 : 0.6, index * 0.12));
}

function handleObjectClick(key) {
  const object = objects[key];
  if (object.onClick) {
    object.onClick();
    return;
  }
  if (key === "globe") shakeGlobe();
  if (key === "lights") nextLightPattern();
  if (key === "gifts") {
    startAction("gifts", "jump", 1.1);
    chime(392, 0, 0.07);
    chime(523.25, 0.12, 0.07);
    sparkleBurst(OBJECTS.gifts.x, OBJECTS.gifts.y - 40, 26);
  }
  if (key === "bear") {
    startAction("bear", "spin", 1.6);
    chime(261.63, 0, 0.08);
    chime(329.63, 0.15, 0.08);
    chime(392, 0.3, 0.08);
  }
  if (KIDS.includes(key)) {
    startAction(key, "cheer", 1);
    chime(NOTES[KIDS.indexOf(key) + 2], 0, 0.08);
    sparkleBurst(object.config.x, object.config.y - 40, 14);
  }
}

// Desplazamientos que añade cada acción según su progreso (0-1)
function actionOffsets(object, time) {
  const offset = { y: 0, spin: 0, roll: 0, scale: 1 };
  const action = object.action;
  if (!action) return offset;

  const progress = (time - action.start) / action.duration;
  if (progress < 0) return offset;          // Acción con retardo que aún no empieza
  if (progress >= 1) {
    object.action = null;
    return offset;
  }

  if (action.type === "shake") {
    const decay = 1 - progress;
    offset.roll = Math.sin(progress * 55) * 0.16 * decay;
    offset.y = Math.abs(Math.sin(progress * 30)) * 0.08 * decay;
  }
  if (action.type === "jump") {
    offset.y = hop(progress) * 0.9;
    offset.spin = easeOutCubic(progress) * Math.PI * 2;
    offset.scale = 1 + hop(progress) * 0.1;
  }
  if (action.type === "spin") {
    offset.y = hop(progress) * 0.35;
    offset.spin = easeOutCubic(progress) * Math.PI * 2;
  }
  if (action.type === "swing") {
    offset.roll = Math.sin(progress * 14) * 0.05 * (1 - progress);
  }
  if (action.type === "cheer") {
    // Dos saltitos con un pequeño balanceo
    offset.y = Math.abs(Math.sin(progress * Math.PI * 2)) * 0.45 * (1 - progress * 0.4);
    offset.roll = Math.sin(progress * Math.PI * 4) * 0.18;
  }
  if (action.type === "peek") {
    offset.y = hop(progress) * 0.18;
  }
  return offset;
}

function updateObjects(time, delta) {
  Object.values(objects).forEach((object) => {
    // Las bolas colgantes tienen su propia animación de péndulo
    if (object.update) {
      object.update(time, delta);
      return;
    }
    const { key, wrapper, config, home } = object;

    const grow = key === "lights" ? 1 : HOVER_SCALE;
    object.scale = lerp(object.scale, hovered === key ? grow : 1, SMOOTHING);
    // Los objetos giran un poco hacia el cursor
    object.yaw = lerp(object.yaw, config.tilt + pointer.x * config.follow, SMOOTHING);

    const offset = actionOffsets(object, time);
    const idle = REDUCED_MOTION || key === "lights" ? 0 : Math.sin(time * 1.2 + config.x) * 0.03;
    const roll = key === "lights" ? 0 : offset.roll;

    wrapper.position.set(home.x, home.y + offset.y + idle, home.z);
    wrapper.rotation.set(-pointer.y * config.follow * 0.3, object.yaw + offset.spin, roll);
    wrapper.scale.setScalar(object.baseScale * object.scale * offset.scale);
    if (object.animateParts) object.animateParts(time, delta);

    if (object.mixer) {
      // Al agitar la bola, la nieve de dentro se mueve más deprisa
      object.mixer.timeScale = object.action && object.action.type === "shake" ? 4 : 1;
      object.mixer.update(REDUCED_MOTION ? 0 : delta);
    }
  });
}

function updateBulbs(time) {
  const boost = hovered === "lights" ? 1.5 : 1;
  const count = bulbs.length;

  bulbs.forEach((bulb, index) => {
    let intensity = 2.2;
    if (lightPattern === 0) {
      const wave = Math.cos(Math.PI * 2 * (index / count * 3 - time * 0.7));
      intensity = 0.3 + 3 * Math.pow(Math.max(0, wave), 4);
    }
    if (lightPattern === 1) {
      intensity = 0.4 + 2.4 * (0.5 + 0.5 * Math.sin(time * bulb.speed + bulb.phase));
    }
    if (lightPattern === 2) {
      intensity = index % 2 === Math.floor(time * 1.5) % 2 ? 3 : 0.25;
    }
    const finalIntensity = (REDUCED_MOTION ? 2 : intensity) * boost;
    bulb.material.emissiveIntensity = finalIntensity;
    bulb.mesh.getWorldPosition(bulb.halo.position);
    bulb.halo.position.z += 0.05;
    bulb.halo.material.opacity = Math.min(1, finalIntensity / 3.5) * 0.9;
  });
}

/* ==========================================================================
   SELLO DEL DONATIVO: mouseenter / mouseleave / click
   ========================================================================== */

// Posición en el cartel del centro de un elemento HTML (aunque el cartel esté escalado)
function elementCenter(element, offsetY = 0) {
  const rect = element.getBoundingClientRect();
  const posterRect = poster.getBoundingClientRect();
  return {
    x: (rect.left + rect.width / 2 - posterRect.left) / posterScale,
    y: (rect.top + rect.height / 2 - posterRect.top) / posterScale + offsetY,
  };
}

// mouseenter: el sello crece, gira y se vuelve rojo; los regalos se abren y los niños se asoman
function highlightSeal() {
  seal.style.transform = "scale(1.12) rotate(6deg)";
  seal.style.backgroundColor = "var(--berry)";
  seal.style.color = "var(--snow)";
  seal.style.boxShadow = "0 0 0 6px rgba(224, 48, 63, 0.35), 0 0 46px rgba(255, 120, 120, 0.6), 0 10px 20px rgba(0, 0, 20, 0.5)";
  cheerKids("peek");
  lidsOpen = true;
  chime(NOTES[2], 0, 0.04);
}

// mouseleave: vuelve a su estado inicial
function resetSeal() {
  seal.style.transform = "";
  seal.style.backgroundColor = "";
  seal.style.color = "";
  seal.style.boxShadow = "";
  lidsOpen = false;
}

// click: estalla confeti, los regalos saltan y los niños lo celebran
function celebrateSeal() {
  const center = elementCenter(seal);
  confettiBurst(center.x, center.y, 60);
  sparkleBurst(center.x, center.y, 16);
  startAction("gifts", "jump", 1.1);
  cheerKids("cheer");
  KIDS.forEach((key) => sparkleBurst(OBJECTS[key].x, OBJECTS[key].y - 50, 10));
  [0, 2, 4, 5].forEach((note, index) => chime(NOTES[note], index * 0.08, 0.06));
}

/* ==========================================================================
   BRANDING: mouseenter / mouseleave
   ========================================================================== */

function highlightBrand() {
  brand.style.transform = "scale(1.08) rotate(-3deg)";
  brand.style.filter = "drop-shadow(0 0 22px rgba(240, 187, 82, 0.75))";
  brandLogo.style.transform = "translateY(-4px)";
}

function resetBrand() {
  brand.style.transform = "";
  brand.style.filter = "";
  brandLogo.style.transform = "";
}

/* ==========================================================================
   SONIDO: CAMPANILLAS CON WEB AUDIO
   ========================================================================== */

// Una nota de campana: un tono principal y dos armónicos que se apagan
function chime(frequency, delay = 0, volume = 0.07) {
  if (!soundOn) return;
  if (!audio) audio = new AudioContext();
  const start = audio.currentTime + delay;

  [1, 2.76, 5.4].forEach((ratio, index) => {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency * ratio;
    const length = 1.6 / (index + 1);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume / (index + 1), start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(start);
    oscillator.stop(start + length);
  });
}

function toggleSound() {
  soundOn = !soundOn;
  soundToggle.setAttribute("aria-pressed", soundOn);
  const label = soundOn ? "Sonido: sí" : "Sonido: no";
  soundToggle.setAttribute("aria-label", label);
  soundToggle.title = label;
  if (soundOn) chime(NOTES[3]);
}

/* ==========================================================================
   NIEVE Y DESTELLOS SOBRE EL CARTEL
   ========================================================================== */

const snowContext = snowCanvas.getContext("2d");
const flakes = [];
const sparkles = [];
const SPARKLE_COLORS = ["#f0bb52", "#ffe3a1", "#fff6e6", "#e0303f", "#3fae5a"];

function createFlake(x, y, burst) {
  return {
    x,
    y,
    radius: 1 + Math.random() * 2.6,
    vx: burst ? (Math.random() - 0.5) * 6 : 0,
    vy: burst ? -2 - Math.random() * 5 : 0.4 + Math.random() * 0.9,
    phase: Math.random() * Math.PI * 2,
    burst,
  };
}

function setupSnow() {
  const ratio = Math.min(window.devicePixelRatio, 2);
  snowCanvas.width = POSTER_WIDTH * ratio;
  snowCanvas.height = POSTER_HEIGHT * ratio;
  snowContext.scale(ratio, ratio);
  for (let i = 0; i < SNOWFLAKES; i++) {
    flakes.push(createFlake(Math.random() * POSTER_WIDTH, Math.random() * POSTER_HEIGHT, false));
  }
}

// Al agitar la bola, sale un estallido de copos
function burstSnow(x, y, amount) {
  for (let i = 0; i < amount; i++) flakes.push(createFlake(x + (Math.random() - 0.5) * 160, y, true));
}

function updateSnow(time) {
  snowContext.clearRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);
  snowContext.fillStyle = "rgba(246, 240, 227, 0.85)";
  wind.value *= 0.96;

  for (let i = flakes.length - 1; i >= 0; i--) {
    const flake = flakes[i];

    if (flake.burst) {
      flake.vy = Math.min(flake.vy + 0.12, 1.2);
      flake.vx *= 0.97;
    }
    flake.x += flake.vx + Math.sin(time + flake.phase) * 0.35 + wind.value * flake.radius * 0.4;
    flake.y += flake.vy * (REDUCED_MOTION ? 0.3 : 1);

    // El cursor aparta los copos cercanos
    if (cursor) {
      const dx = flake.x - cursor.x;
      const dy = flake.y - cursor.y;
      const gap = Math.hypot(dx, dy);
      if (gap < SNOW_REPEL && gap > 0) {
        const push = (1 - gap / SNOW_REPEL) * 3;
        flake.x += (dx / gap) * push;
        flake.y += (dy / gap) * push;
      }
    }

    if (flake.y > POSTER_HEIGHT + 10) {
      // Los copos del estallido desaparecen; los demás vuelven arriba
      if (flake.burst) {
        flakes.splice(i, 1);
        continue;
      }
      flake.y = -10;
      flake.x = Math.random() * POSTER_WIDTH;
    }
    if (flake.x < -10) flake.x = POSTER_WIDTH + 10;
    if (flake.x > POSTER_WIDTH + 10) flake.x = -10;

    snowContext.beginPath();
    snowContext.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
    snowContext.fill();
  }

  updateShootingStars();
  updateConfetti();
  drawPhysicsSnow();
  updateSparkles();
}

function createSparkle(x, y, speed, size) {
  const angle = Math.random() * Math.PI * 2;
  const velocity = Math.random() * speed;
  const life = 40 + Math.random() * 30;
  sparkles.push({
    x,
    y,
    vx: Math.cos(angle) * velocity,
    vy: Math.sin(angle) * velocity - speed * 0.3,
    size: size * (0.6 + Math.random() * 0.8),
    life,
    maxLife: life,
    color: SPARKLE_COLORS[Math.floor(Math.random() * SPARKLE_COLORS.length)],
    rotation: Math.random() * Math.PI,
  });
}

function sparkleBurst(x, y, amount) {
  for (let i = 0; i < amount; i++) createSparkle(x, y, 6, 7);
}

// Estrella de cuatro puntas
function drawSparkle({ x, y, size, rotation }) {
  snowContext.save();
  snowContext.translate(x, y);
  snowContext.rotate(rotation);
  snowContext.beginPath();
  for (let i = 0; i < 8; i++) {
    const radius = i % 2 === 0 ? size : size * 0.25;
    const angle = (i * Math.PI) / 4;
    snowContext.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  snowContext.closePath();
  snowContext.fill();
  snowContext.restore();
}

function updateSparkles() {
  for (let i = sparkles.length - 1; i >= 0; i--) {
    const sparkle = sparkles[i];
    sparkle.life -= 1;
    if (sparkle.life <= 0) {
      sparkles.splice(i, 1);
      continue;
    }
    sparkle.vx *= 0.94;
    sparkle.vy = sparkle.vy * 0.94 + 0.06;
    sparkle.x += sparkle.vx;
    sparkle.y += sparkle.vy;
    sparkle.rotation += 0.05;

    snowContext.globalAlpha = sparkle.life / sparkle.maxLife;
    snowContext.fillStyle = sparkle.color;
    drawSparkle(sparkle);
  }
  snowContext.globalAlpha = 1;
}

/* ==========================================================================
   CONFETI Y ESTRELLAS FUGACES
   ========================================================================== */

const confetti = [];
const shootingStars = [];
const CONFETTI_COLORS = ["#e0303f", "#f0bb52", "#3fae5a", "#f6f0e3", "#6fa8ff"];

// Trozos de papel que giran sobre sí mismos mientras caen
function confettiBurst(x, y, amount) {
  if (REDUCED_MOTION) amount = Math.ceil(amount / 4);
  for (let i = 0; i < amount; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
    const speed = 4 + Math.random() * 7;
    confetti.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      width: 5 + Math.random() * 5,
      height: 3 + Math.random() * 4,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.4,
      flip: Math.random() * Math.PI,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      life: 140 + Math.random() * 60,
    });
  }
}

function updateConfetti() {
  for (let i = confetti.length - 1; i >= 0; i--) {
    const piece = confetti[i];
    piece.vx = piece.vx * 0.97 + wind.value * 0.02;
    piece.vy = Math.min(piece.vy * 0.97 + 0.18, 2.4);
    piece.x += piece.vx + Math.sin(piece.flip) * 0.6;
    piece.y += piece.vy;
    piece.rotation += piece.spin;
    piece.flip += 0.15;
    piece.life -= 1;
    if (piece.life <= 0 || piece.y > POSTER_HEIGHT + 10) {
      confetti.splice(i, 1);
      continue;
    }
    snowContext.save();
    snowContext.globalAlpha = Math.min(1, piece.life / 30);
    snowContext.translate(piece.x, piece.y);
    snowContext.rotate(piece.rotation);
    // El coseno simula que el papel da la vuelta
    snowContext.scale(1, Math.cos(piece.flip));
    snowContext.fillStyle = piece.color;
    snowContext.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height);
    snowContext.restore();
  }
}

// De vez en cuando cruza el cielo una estrella fugaz
function updateShootingStars() {
  if (!REDUCED_MOTION && Math.random() < 0.004 && shootingStars.length < 2) {
    shootingStars.push({
      x: 120 + Math.random() * 600,
      y: 40 + Math.random() * 160,
      vx: (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 4),
      vy: 2.5 + Math.random() * 2,
      life: 1,
    });
  }
  for (let i = shootingStars.length - 1; i >= 0; i--) {
    const star = shootingStars[i];
    star.x += star.vx;
    star.y += star.vy;
    star.life -= 0.022;
    if (star.life <= 0) {
      shootingStars.splice(i, 1);
      continue;
    }
    const tail = snowContext.createLinearGradient(star.x, star.y, star.x - star.vx * 10, star.y - star.vy * 10);
    tail.addColorStop(0, `rgba(255, 246, 224, ${star.life})`);
    tail.addColorStop(1, "rgba(255, 246, 224, 0)");
    snowContext.strokeStyle = tail;
    snowContext.lineWidth = 2;
    snowContext.beginPath();
    snowContext.moveTo(star.x, star.y);
    snowContext.lineTo(star.x - star.vx * 10, star.y - star.vy * 10);
    snowContext.stroke();
  }
}

/* ==========================================================================
   NIEVE CON FÍSICA (matter.js): SE POSA SOBRE EL TÍTULO Y SE DERRUMBA
   ========================================================================== */

const physics = { engine: null, flakes: [], letters: [], frame: 0 };

// Cada letra del título se convierte en un cuerpo estático con la forma
// aproximada de su glifo, medida con canvas
function addLetterBodies() {
  const { Bodies, Composite } = window.Matter;
  const measure = document.createElement("canvas").getContext("2d");
  const posterRect = poster.getBoundingClientRect();

  titleLetters.forEach((letter) => {
    const character = letter.textContent.trim();
    if (!character) return;
    const style = getComputedStyle(letter);
    const fontSize = parseFloat(style.fontSize);
    measure.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
    const metrics = measure.measureText(character);
    const rect = letter.getBoundingClientRect();
    const left = (rect.left - posterRect.left) / posterScale;

    // Línea base real: un elemento vacío alineado a la base de la letra marca su altura
    const probe = document.createElement("span");
    probe.style.cssText = "display:inline-block;width:0;height:0;vertical-align:baseline";
    letter.appendChild(probe);
    const baseline = (probe.getBoundingClientRect().bottom - posterRect.top) / posterScale;
    probe.remove();

    const glyphTop = baseline - metrics.actualBoundingBoxAscent;
    const glyphLeft = left - metrics.actualBoundingBoxLeft;
    const glyphWidth = metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight;
    const glyphHeight = baseline - glyphTop;

    const body = Bodies.rectangle(
      glyphLeft + glyphWidth / 2,
      glyphTop + glyphHeight / 2,
      glyphWidth * 0.94,
      glyphHeight,
      { isStatic: true, friction: 1, chamfer: { radius: 4 } }
    );
    Composite.add(physics.engine.world, body);
    physics.letters.push({ left: glyphLeft, right: glyphLeft + glyphWidth, top: glyphTop });
  });
}

function setupSnowPhysics() {
  if (!window.Matter) return;    // Sin matter.js el cartel funciona igual, sin nieve acumulada
  const { Engine, Bodies, Composite } = window.Matter;
  physics.engine = Engine.create({ enableSleeping: true });
  physics.engine.gravity.y = 0.35;

  // Suelo: el borde inferior del cartel
  Composite.add(physics.engine.world, Bodies.rectangle(POSTER_WIDTH / 2, SNOW_GROUND_Y + 40, POSTER_WIDTH * 2, 80, { isStatic: true, friction: 1 }));
  addLetterBodies();
}

function spawnPhysicsFlake() {
  const { Bodies, Composite } = window.Matter;
  // Si ya hay demasiados copos, se retira el más antiguo del suelo
  if (physics.flakes.length >= PHYSICS_FLAKES) {
    const index = physics.flakes.findIndex((flake) => flake.position.y > SNOW_GROUND_Y - 40);
    if (index === -1) return;
    Composite.remove(physics.engine.world, physics.flakes[index]);
    physics.flakes.splice(index, 1);
  }
  const radius = 1.5 + Math.random() * 1.2;
  const flake = Bodies.circle(30 + Math.random() * (POSTER_WIDTH - 60), -10, radius, {
    friction: 0.9,
    frictionStatic: 0.7,
    frictionAir: 0.05 + Math.random() * 0.04,
    restitution: 0,
    density: 0.0008,
  });
  flake.plugin.phase = Math.random() * Math.PI * 2;
  physics.flakes.push(flake);
  Composite.add(physics.engine.world, flake);
}

function updateSnowPhysics(time) {
  if (!physics.engine) return;
  const { Engine, Body, Composite } = window.Matter;
  physics.frame += 1;
  if (physics.frame % (REDUCED_MOTION ? 10 : 5) === 0) spawnPhysicsFlake();

  for (let i = physics.flakes.length - 1; i >= 0; i--) {
    const flake = physics.flakes[i];
    // Los copos que caen se mecen con la brisa y el viento del cursor
    if (!flake.isSleeping && flake.velocity.y > 0.3) {
      const sway = Math.sin(time * 1.5 + flake.plugin.phase) * 0.000004 + wind.value * 0.0000015;
      Body.applyForce(flake, flake.position, { x: sway, y: 0 });
    }
    const { x, y } = flake.position;
    if (x < -20 || x > POSTER_WIDTH + 20 || y > POSTER_HEIGHT + 20) {
      Composite.remove(physics.engine.world, flake);
      physics.flakes.splice(i, 1);
    }
  }
  updateAvalanches();
  Engine.update(physics.engine, 1000 / 60);
}

// Copos quietos encima de una letra
function restingSnow(letter) {
  return physics.flakes.filter((flake) =>
    flake.speed < 0.4 &&
    flake.position.y < letter.top + 2 &&
    flake.position.y > letter.top - 80 &&
    flake.position.x > letter.left - 6 &&
    flake.position.x < letter.right + 6
  );
}

// La nieve de una letra se derrumba: cada copo resbala hacia el borde más cercano
function collapseSnow(letter, flakes) {
  const { Body, Sleeping } = window.Matter;
  const center = (letter.left + letter.right) / 2;
  flakes.forEach((flake) => {
    const side = flake.position.x < center ? -1 : 1;
    Sleeping.set(flake, false);
    Body.setVelocity(flake, { x: side * (0.6 + Math.random() * 1.8), y: -Math.random() * 0.8 });
  });
  burstSnow(center, letter.top, 6);
}

// Cada medio segundo: los montones demasiado altos se derrumban siempre
// y, de vez en cuando, uno cualquiera se viene abajo
function updateAvalanches() {
  if (physics.frame % 30 !== 0) return;
  const loads = physics.letters.map((letter) => ({ letter, flakes: restingSnow(letter) }));
  const heavy = loads.filter(({ flakes }) => flakes.length > AVALANCHE_LOAD);
  const loaded = loads.filter(({ flakes }) => flakes.length > 4);
  let chosen = null;
  if (heavy.length) chosen = heavy[Math.floor(Math.random() * heavy.length)];
  else if (loaded.length && Math.random() < 0.45) chosen = loaded[Math.floor(Math.random() * loaded.length)];
  if (chosen) collapseSnow(chosen.letter, chosen.flakes);
}

// Todos los copos con física en un solo trazado: es mucho más rápido
function drawPhysicsSnow() {
  if (!physics.flakes.length) return;
  // Copos algo translúcidos y con un halo azulado: la nieve posada se ve suave, no como bolas
  snowContext.save();
  snowContext.globalAlpha = 0.78;
  snowContext.fillStyle = "#eef4ff";
  snowContext.shadowColor = "rgba(170, 200, 255, 0.6)";
  snowContext.shadowBlur = 3;
  snowContext.beginPath();
  physics.flakes.forEach((flake) => {
    snowContext.moveTo(flake.position.x + flake.circleRadius, flake.position.y);
    snowContext.arc(flake.position.x, flake.position.y, flake.circleRadius, 0, Math.PI * 2);
  });
  snowContext.fill();
  snowContext.restore();
}

// Empuja la nieve que está dentro de un radio: el cursor la aparta o la lanza
function pushSnow(x, y, radius, strength, lift = 0) {
  if (!physics.engine) return;
  const { Body, Sleeping } = window.Matter;
  physics.flakes.forEach((flake) => {
    const dx = flake.position.x - x;
    const dy = flake.position.y - y;
    const gap = Math.hypot(dx, dy);
    if (gap > radius || gap === 0) return;
    const force = (1 - gap / radius) * strength;
    Sleeping.set(flake, false);
    Body.setVelocity(flake, {
      x: flake.velocity.x + (dx / gap) * force,
      y: flake.velocity.y + (dy / gap) * force - lift,
    });
  });
}

// Las letras se sacuden la nieve cuando saltan
function shakeSnowOffTitle() {
  if (!physics.engine) return;
  const { Body, Sleeping } = window.Matter;
  const top = title.offsetTop - 30;
  const bottom = title.offsetTop + title.offsetHeight;
  physics.flakes.forEach((flake) => {
    if (flake.position.y < top || flake.position.y > bottom) return;
    Sleeping.set(flake, false);
    Body.setVelocity(flake, { x: (Math.random() - 0.5) * 5, y: -3 - Math.random() * 5 });
  });
}

/* ==========================================================================
   TÍTULO: LETRAS QUE SALTAN
   ========================================================================== */

function splitIntoLetters(line) {
  const text = line.textContent;
  line.textContent = "";
  return Array.from(text, (character) => {
    const letter = document.createElement("span");
    letter.className = character === " " ? "letter letter-space" : "letter";
    letter.textContent = character === " " ? " " : character;
    line.appendChild(letter);
    return letter;
  });
}

// Las dos líneas del título usan el mismo tamaño: el que hace que la primera
// ocupe TITLE_WIDTH. offsetWidth no se ve afectado por el escalado del cartel
function fitTitle(lines) {
  lines.forEach((line) => {
    line.style.fontSize = "100px";
  });
  const size = Math.min(176, (100 * TITLE_WIDTH) / lines[0].offsetWidth);
  lines.forEach((line) => {
    line.style.fontSize = `${size}px`;
  });
}

// Las letras suben una tras otra, como una ola, alternando dorado y blanco
function celebrateTitle() {
  shakeSnowOffTitle();
  titleLetters.forEach((letter, index) => {
    letter.style.transitionDelay = `${index * 25}ms`;
    letter.style.transform = "translateY(-8px)";
    letter.style.color = index % 2 === 0 ? "var(--gold)" : "var(--snow)";
  });
}

function restTitle() {
  titleLetters.forEach((letter, index) => {
    letter.style.transitionDelay = `${index * 15}ms`;
    letter.style.transform = "";
    letter.style.color = "";
  });
}

/* ==========================================================================
   EVENTOS DEL CARTEL
   ========================================================================== */

// mousemove: escena 3D, nieve, bolas colgantes y detección de objetos
function handlePosterMove(event) {
  cursor = toPosterCoordinates(event);
  if (wind.lastX !== null) {
    wind.value += (cursor.x - wind.lastX) * 0.02;
    cursorMotion += cursor.x - wind.lastX;
  }
  wind.lastX = cursor.x;
  // Estela de destellos detrás del cursor
  if (!REDUCED_MOTION && Math.random() < 0.15) createSparkle(cursor.x, cursor.y, 1.2, 4);
  // El cursor aparta la nieve posada, con más fuerza cuanto más rápido se mueve
  pushSnow(cursor.x, cursor.y, SNOW_PUSH, Math.min(6, 1 + Math.abs(cursorMotion) * 0.15), 0.6);
  // Sobre textos y botones no se detectan objetos 3D
  const overInterface = event.target.closest("button, .title, .brand, .seal, .sleigh");
  setHovered(overInterface ? null : pickObject(cursor.x, cursor.y));
}

function handlePosterLeave() {
  cursor = null;
  wind.lastX = null;
  setHovered(null);
}

// Clic en la corona: el lazo salta y suenan dos campanillas
function popBow() {
  wreathBow.classList.remove("is-popping");
  wreathBow.getBoundingClientRect();    // Reinicia la animación aunque se repita el clic
  wreathBow.classList.add("is-popping");
  chime(NOTES[4]);
  chime(NOTES[5], 0.12);
}

function handlePosterClick(event) {
  if (event.target.closest("button")) return;
  const point = toPosterCoordinates(event);
  const key = pickObject(point.x, point.y);
  if (key) handleObjectClick(key);
  else {
    burstSnow(point.x, point.y, 25);
    sparkleBurst(point.x, point.y, 8);
    pushSnow(point.x, point.y, 120, 9, 3);
  }
}

/* ==========================================================================
   TRINEO DE PAPÁ NOEL
   ========================================================================== */

const sleigh = document.getElementById("sleigh");
const sleighShout = document.getElementById("sleighShout");
const SLEIGH_WIDTH = 190;
const SLEIGH_FLIGHT = 17;      // Segundos que tarda en cruzar el cielo
const SLEIGH_PAUSE = 7;        // Segundos que pasa fuera antes de volver a aparecer por la derecha
const JINGLE = [659.25, 659.25, 659.25, 0, 659.25, 659.25, 659.25, 0, 659.25, 783.99, 523.25, 587.33, 659.25];
const sleighState = { time: 0, speed: 1, hovered: false, liftStart: -10, shoutTimer: 0, cheered: false };

// Bocadillo de Papá Noel
function sleighSay(text, duration) {
  sleighShout.textContent = text;
  sleighShout.classList.add("is-visible");
  clearTimeout(sleighState.shoutTimer);
  sleighState.shoutTimer = setTimeout(() => sleighShout.classList.remove("is-visible"), duration);
}

// Recorrido: entra por la derecha, detrás del «21», y sale por la izquierda bajo el logotipo
function sleighPosition(progress) {
  return {
    x: lerp(POSTER_WIDTH + 30, -SLEIGH_WIDTH - 30, progress),
    y: 105 + progress * 150 + Math.sin(progress * Math.PI * 4) * 14,
  };
}

function updateSleigh(time, delta) {
  if (REDUCED_MOTION) {
    sleigh.style.transform = "translate(300px, 190px)";
    sleigh.querySelector("svg").pauseAnimations();
    return;
  }
  const targetSpeed = sleighState.hovered ? 0.35 : 1;
  sleighState.speed = lerp(sleighState.speed, targetSpeed, 0.03);
  sleighState.time = (sleighState.time + delta * sleighState.speed) % (SLEIGH_FLIGHT + SLEIGH_PAUSE);

  const progress = sleighState.time / SLEIGH_FLIGHT;
  if (progress > 1) {
    // Ha salido por la izquierda: desaparece hasta la siguiente pasada
    sleigh.style.visibility = "hidden";
    sleighState.cheered = false;
    return;
  }
  sleigh.style.visibility = "";
  // Nada más entrar, Papá Noel arrea a los renos
  if (!sleighState.cheered && progress > 0.1) {
    sleighState.cheered = true;
    sleighSay("¡Arre, arre!", 1600);
  }

  const { x, y } = sleighPosition(progress);
  const ahead = sleighPosition(Math.min(progress + 0.01, 1.01));
  // El trineo se inclina según suba o baje
  const angle = Math.atan2(ahead.y - y, x - ahead.x) * (180 / Math.PI) * -0.8;
  // Salto al hacer clic
  const since = time - sleighState.liftStart;
  const lift = since < 0.7 ? Math.sin((since / 0.7) * Math.PI) * 34 : 0;

  sleigh.style.transform = `translate(${x}px, ${y - lift}px) rotate(${angle}deg)`;

  // Estela de polvo de estrellas detrás del trineo
  if (Math.random() < 0.4) createSparkle(x + SLEIGH_WIDTH * 0.95, y - lift + 66, 0.8, 3.5);
}

function highlightSleigh() {
  sleighState.hovered = true;
  sleigh.classList.add("is-hovered");
}

function resetSleigh() {
  sleighState.hovered = false;
  sleigh.classList.remove("is-hovered");
}

// Clic en el trineo: Papá Noel saluda, suelta regalos (confeti) y suenan cascabeles
function celebrateSleigh(event) {
  event.stopPropagation();
  sleighState.liftStart = clock.elapsedTime;
  sleighSay("¡Jo, jo, jo!", 1800);

  const point = toPosterCoordinates(event);
  confettiBurst(point.x, point.y, 40);
  sparkleBurst(point.x, point.y, 16);
  JINGLE.forEach((note, index) => {
    if (note) chime(note, index * 0.16, 0.05);
  });
}

function handleKeyDown(event) {
  if (event.code !== "Space" || event.target.closest("button")) return;
  event.preventDefault();
  shakeGlobe();
}

/* ==========================================================================
   BUCLE DE ANIMACIÓN
   ========================================================================== */

function updatePointerAndParallax() {
  const targetX = cursor ? (cursor.x / POSTER_WIDTH - 0.5) * 2 : 0;
  const targetY = cursor ? (cursor.y / POSTER_HEIGHT - 0.5) * 2 : 0;
  pointer.x = lerp(pointer.x, targetX, SMOOTHING);
  pointer.y = lerp(pointer.y, targetY, SMOOTHING);
  parallax.x = lerp(parallax.x, targetX, SMOOTHING);
  parallax.y = lerp(parallax.y, targetY, SMOOTHING);

  // Efecto de profundidad: cada capa de la fecha se desplaza una distancia distinta
  dateDay.style.transform = `translate(${-parallax.x * PARALLAX_DAY}px, ${-parallax.y * PARALLAX_DAY}px)`;
  dateMonth.style.transform = `translate(${parallax.x * PARALLAX_MONTH}px, ${parallax.y * (PARALLAX_MONTH / 2)}px)`;
  moon.style.transform = `translate(${-parallax.x * PARALLAX_MOON}px, ${-parallax.y * (PARALLAX_MOON / 2)}px)`;

  // La cámara se desplaza un poco para dar profundidad a la escena
  camera.position.x = pointer.x * 0.35;
  camera.position.y = -pointer.y * 0.25;
  camera.lookAt(0, 0, 0);

  // Luz cálida bajo el cursor
  if (cursor) cursorLight.position.copy(posterToWorld(cursor.x, cursor.y)).setZ(2.5);
  cursorLight.intensity = lerp(cursorLight.intensity, cursor ? 4 : 0, SMOOTHING);
}

function animate() {
  const delta = Math.min(clock.getDelta(), 0.1);
  const time = clock.elapsedTime;

  updatePointerAndParallax();
  updateObjects(time, delta);
  updateBulbs(time);
  updateGlobeGlow(time);
  updateSleigh(time, delta);
  updateSnowPhysics(time);
  updateSnow(time);
  renderer.render(scene, camera);
  cursorMotion = 0;

  requestAnimationFrame(animate);
}

/* ==========================================================================
   INICIO
   ========================================================================== */

function init() {
  fitPosterToWindow();

  const titleLines = [...title.querySelectorAll(".title-line")];
  titleLines.forEach((line) => titleLetters.push(...splitIntoLetters(line)));
  fitTitle(titleLines);

  setupSnow();
  setupSnowPhysics();
  loadModels();

  window.addEventListener("resize", fitPosterToWindow);
  window.addEventListener("keydown", handleKeyDown);

  // Interacción 3 · mousemove
  poster.addEventListener("mousemove", handlePosterMove);
  poster.addEventListener("mouseleave", handlePosterLeave);
  poster.addEventListener("click", handlePosterClick);

  // Interacciones 1 y 2 · mouseenter / mouseleave
  title.addEventListener("mouseenter", celebrateTitle);
  title.addEventListener("mouseleave", restTitle);
  brand.addEventListener("mouseenter", highlightBrand);
  brand.addEventListener("mouseleave", resetBrand);
  seal.addEventListener("mouseenter", highlightSeal);
  seal.addEventListener("mouseleave", resetSeal);
  seal.addEventListener("click", celebrateSeal);

  soundToggle.addEventListener("click", toggleSound);
  document.getElementById("wreath").addEventListener("click", popBow);

  sleigh.addEventListener("mouseenter", highlightSleigh);
  sleigh.addEventListener("mouseleave", resetSleigh);
  sleigh.addEventListener("click", celebrateSleigh);

  animate();
}

// Las fuentes se esperan para que el título se ajuste con su tamaño real
document.fonts.ready.then(init);
