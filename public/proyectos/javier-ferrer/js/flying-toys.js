// Juguetes flotando: adaptación a three.js "a pelo" del ejemplo "flying bananas"
// de pmndrs (https://github.com/pmndrs/examples/tree/main/examples/flying-bananas, MIT).
// En lugar de plátanos suben el osito, la oveja y el piano.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { MeshoptSimplifier } from 'meshoptimizer/simplifier';

// ---------------------------------------------------------------------------
// Ajustes
// ---------------------------------------------------------------------------
const SETTINGS = {
  background: '#fafafa', // color de fondo
  count: 90,             // cuántos juguetes
  depth: 16,             // profundidad del "túnel" de juguetes (menos = más cerca)
  speed: 1,              // velocidad de subida
  spread: 1,             // reparto a lo ancho (1 = de borde a borde del encuadre)
  // Juguetes y su proporción en la mezcla. "size" = su dimensión mayor.
  // "detail": fracción de triángulos que se conserva (el osito original tiene
  // 1,5 millones: sin simplificar, decenas de copias ahogarían la GPU).
  // "shine": intensidad propia de los reflejos del entorno (para que lo brillante
  // siga brillando aunque la luz ambiente general sea baja).
  // "facing": siempre de cara a la cámara (con un ligero balanceo); "front": giro
  // extra (rad) si la cara del modelo no mira hacia su +z.
  toys: [
    { url: 'public/3d/teddy.glb', weight: 0.25, size: 1.8, detail: 0.03, facing: true, front: 0 },
    { url: 'public/3d/oveja.glb', weight: 0.2, size: 1.4, facing: true, front: 0 },
    { url: 'public/3d/toy_piano.glb', weight: 0.15, size: 1.6 },
    { url: 'public/3d/round_bunny.glb', weight: 0.2, size: 1.5, detail: 0.3, facing: true, front: 0 },
    { url: 'public/3d/toy_racing_car.glb', weight: 0.2, size: 1.5, shine: 1.4 }
  ],
  // Desenfoque por profundidad: nítido a "focus" unidades de la cámara (los de
  // delante); los del fondo se desenfocan cuanto más lejos están.
  focus: 13,
  aperture: 0.0007,      // cuánto desenfoca al alejarse del foco
  maxBlur: 0.012,        // desenfoque máximo
  maxPixelRatio: 1.5
};

// Luz cenital: luz blanca desde arriba con sombras (los de arriba sombrean a los de abajo).
const TOP_LIGHT = {
  color: '#ffffff',
  intensity: 3.2,        // es la luz principal: sus sombras son las que se ven
  position: [1.5, 20, 6], // casi vertical, un poco hacia la cámara para ver el relieve
  shadows: true,         // sombras entre juguetes (más 3D, algo más de GPU)
  shadowStrength: 0.3,   // oscuridad de la sombra (0 = invisible, 1 = sombra plena)
  shadowSoftness: 6,     // radio del borde de la sombra
  ambient: 0.35,         // luz de entorno (menos = sombras más oscuras)
  fill: 0.6              // foco cálido de relleno (sin sombras: si sube, las borra)
};

// Cámara cinematográfica: movimiento lento de cámara al hombro/estabilizador,
// acercamiento inicial, paralaje con el ratón y acabado de lente.
const CINEMA = {
  intro: 4,              // s del acercamiento inicial (0 = sin intro)
  introDistance: 5,      // cuánto más atrás empieza la cámara
  drift: 0.22,           // deriva lateral/vertical
  dolly: 0.35,           // acercar/alejar lento
  roll: 0.012,           // balanceo (rad)
  tempo: 0.07,           // velocidad del movimiento (vueltas por segundo, aprox.)
  parallax: 0.35,        // cuánto sigue al ratón
  vignette: 0.22,        // oscurecimiento de esquinas (0 = nada)
  grain: 0.035,          // grano de película (0 = nada)
  aberration: 0.0018     // aberración cromática en los bordes (0 = nada)
};

// Choques y arrastre.
const PHYSICS = {
  radius: 0.9,           // tamaño de la esfera de choque (1 = media de sus medidas)
  bounce: 0.45,          // rebote entre juguetes
  relax: 1.2,            // rapidez con la que vuelven a flotar tras un golpe
  depthSpring: 0.6,      // fuerza que los devuelve a su profundidad
  spinKick: 0.6,         // cuánto giran al chocar
  follow: 14,            // rapidez con la que el arrastrado sigue al puntero
  throwScale: 0.6,       // fuerza del lanzamiento al soltar
  maxThrow: 14,          // velocidad máxima de lanzamiento
  substeps: 2
};

// Los que van de cara: cuánto se balancean y cómo vuelven a mirar a la cámara.
const FACING = {
  sway: [0.12, 0.3, 0.1], // balanceo tranquilo (rad): cabeceo, giro, inclinación
  swaySpeed: 0.5,
  stiffness: 6,          // fuerza con la que vuelven a mirar de frente tras un golpe
  damping: 2.5,
  maxTilt: 0.9           // giro máximo que puede darles un golpe (rad)
};

// Reparto de los objetos en profundidad (el primero, grande y delante).
const easing = x => Math.sqrt(1 - Math.pow(x - 1, 2));

// ---------------------------------------------------------------------------

const canvas = document.getElementById('toys-canvas');
const status = document.getElementById('status');
const WIDTH = 848, HEIGHT = 1200; // tamaño del cartel (se escala con CSS)

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, SETTINGS.maxPixelRatio));
renderer.setSize(WIDTH, HEIGHT, false);
renderer.toneMapping = THREE.NeutralToneMapping; // la aplica OutputPass; respeta mejor los colores

const scene = new THREE.Scene();
scene.background = backgroundForToneMapping(SETTINGS.background);

// El tone mapping oscurece los colores claros: buscamos el color que, una vez
// aplicado, da exactamente el de SETTINGS.background (como el fondo CSS).
function backgroundForToneMapping(hex) {
  const target = new THREE.Color(hex); // lineal
  const want = Math.max(target.r, target.g, target.b);
  let lo = 1, hi = 20;
  for (let i = 0; i < 40; i++) {
    const k = (lo + hi) / 2;
    const out = neutralToneMap(target.r * k, target.g * k, target.b * k);
    if (Math.max(...out) < want) lo = k; else hi = k;
  }
  return target.multiplyScalar((lo + hi) / 2);
}

// Khronos PBR Neutral, igual que THREE.NeutralToneMapping.
function neutralToneMap(r, g, b) {
  const start = 0.76, desaturation = 0.15;
  const x = Math.min(r, g, b);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  r -= offset; g -= offset; b -= offset;
  const peak = Math.max(r, g, b);
  if (peak < start) return [r, g, b];
  const d = 1 - start;
  const newPeak = 1 - d * d / (peak + d - start);
  const s = newPeak / peak;
  const k = 1 - 1 / (desaturation * (peak - newPeak) + 1);
  return [r * s * (1 - k) + newPeak * k, g * s * (1 - k) + newPeak * k, b * s * (1 - k) + newPeak * k];
}

const camera = new THREE.PerspectiveCamera(20, WIDTH / HEIGHT, 0.01, SETTINGS.depth + 15);
camera.position.set(0, 0, 10);

// Luz: foco cálido + entorno suave (el ejemplo usa el preset "sunset").
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = TOP_LIGHT.ambient;
const spot = new THREE.SpotLight('orange', TOP_LIGHT.fill, 0, Math.PI / 3, 1, 0);
spot.position.set(10, 20, 10);
scene.add(spot, new THREE.HemisphereLight('#fff1d6', '#ff9a3c', 0.6 * TOP_LIGHT.ambient / 0.9));

// Cenital. Su cámara de sombras abarca todo el volumen donde flotan los juguetes.
const topLight = new THREE.DirectionalLight(TOP_LIGHT.color, TOP_LIGHT.intensity);
topLight.position.set(...TOP_LIGHT.position);
topLight.target.position.set(0, 0, -SETTINGS.depth / 2);
scene.add(topLight, topLight.target);
if (TOP_LIGHT.shadows) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // con "radius" da bordes suaves
  topLight.castShadow = true;
  const shadow = topLight.shadow;
  shadow.mapSize.set(2048, 2048);
  shadow.radius = TOP_LIGHT.shadowSoftness;
  shadow.intensity = TOP_LIGHT.shadowStrength;
  shadow.bias = -0.0005;
  shadow.normalBias = 0.03;
  const half = SETTINGS.depth / 2 + 4;
  Object.assign(shadow.camera, { left: -6, right: 6, top: half, bottom: -half, near: 1, far: 45 });
  shadow.camera.updateProjectionMatrix();
}

// Postproceso: escena → desenfoque por profundidad → tono/color.
const composer = new EffectComposer(renderer);
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(WIDTH, HEIGHT);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new BokehPass(scene, camera, {
  focus: SETTINGS.focus, aperture: SETTINGS.aperture, maxblur: SETTINGS.maxBlur
}));
composer.addPass(new OutputPass());

// Acabado de lente: aberración cromática en los bordes, viñeta y grano.
const lens = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: CINEMA.vignette },
    grain: { value: CINEMA.grain },
    aberration: { value: CINEMA.aberration }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time, vignette, grain, aberration;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 c = vUv - 0.5;
      float d = length(c);
      vec2 offset = c * d * aberration * 4.0;
      vec3 color = vec3(
        texture2D(tDiffuse, vUv + offset).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - offset).b);
      color *= 1.0 - vignette * smoothstep(0.3, 0.85, d);
      color += (hash(vUv * 1000.0 + fract(time) * 100.0) - 0.5) * grain;
      gl_FragColor = vec4(color, 1.0);
    }`
});
composer.addPass(lens);

// Movimiento de cámara.
const cameraHome = camera.position.clone();
const cameraTarget = new THREE.Vector3(0, 0, -SETTINGS.depth / 2);
const parallax = { x: 0, y: 0, tx: 0, ty: 0 };
window.addEventListener('pointermove', event => {
  const bounds = canvas.getBoundingClientRect();
  parallax.tx = THREE.MathUtils.clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1);
  parallax.ty = THREE.MathUtils.clamp(1 - (event.clientY - bounds.top) / bounds.height * 2, -1, 1);
});

function moveCamera(t, dt) {
  const w = t * CINEMA.tempo * Math.PI * 2;
  const k = 1 - Math.exp(-2 * dt);
  parallax.x += (parallax.tx - parallax.x) * k;
  parallax.y += (parallax.ty - parallax.y) * k;
  // Acercamiento inicial con frenada suave.
  const intro = CINEMA.intro > 0 ? 1 - Math.min(1, t / CINEMA.intro) : 0;
  const approach = intro * intro * intro * CINEMA.introDistance;
  camera.position.set(
    cameraHome.x + Math.sin(w * 0.9) * CINEMA.drift + parallax.x * CINEMA.parallax,
    cameraHome.y + Math.sin(w * 0.63 + 1.3) * CINEMA.drift * 0.7 + parallax.y * CINEMA.parallax,
    cameraHome.z + Math.sin(w * 0.41) * CINEMA.dolly + approach
  );
  camera.lookAt(cameraTarget);
  camera.rotateZ(Math.sin(w * 0.53 + 0.7) * CINEMA.roll);
}

// ---------------------------------------------------------------------------
// Carga: cada juguete se normaliza (centrado, dimensión mayor = size) y cada una
// de sus mallas se convierte en un InstancedMesh: muchas copias, pocas llamadas.
// ---------------------------------------------------------------------------
const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/libs/draco/gltf/');
const loader = new GLTFLoader().setDRACOLoader(draco);

async function loadToy({ url, size, detail = 1, shine }, count) {
  const model = (await loader.loadAsync(url)).scene;
  const box = new THREE.Box3().setFromObject(model);
  const dims = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = size / Math.max(dims.x, dims.y, dims.z);
  // Matriz que centra el modelo en el origen y lo escala.
  const normalize = new THREE.Matrix4().makeScale(scale, scale, scale)
    .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
  // Radio de choque: media de las medidas (no la mayor: el piano es plano).
  radii.push((dims.x + dims.y + dims.z) / 6 * scale * PHYSICS.radius);
  model.updateMatrixWorld(true);
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const parts = [];
  model.traverse(object => {
    if (!object.isMesh) return;
    const geometry = object.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(normalize, object.matrixWorld));
    if (detail < 1) simplify(geometry, detail);
    for (const material of [object.material].flat()) {
      if (shine !== undefined && material.isMeshStandardMaterial) {
        material.envMap = scene.environment; // reflejos propios, no los del ambiente general
        material.envMapIntensity = shine;
      }
      for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
        if (material[key]) material[key].anisotropy = anisotropy;
      }
    }
    const mesh = new THREE.InstancedMesh(geometry, object.material, count);
    mesh.frustumCulled = false; // se mueven por todas partes
    mesh.castShadow = mesh.receiveShadow = TOP_LIGHT.shadows;
    parts.push(mesh);
    scene.add(mesh);
  });
  return parts;
}

// Reduce los triángulos de una malla conservando su forma (meshoptimizer).
function simplify(geometry, ratio) {
  if (!geometry.index) return;
  const position = geometry.attributes.position;
  const positions = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    positions[i * 3] = position.getX(i); positions[i * 3 + 1] = position.getY(i); positions[i * 3 + 2] = position.getZ(i);
  }
  const index = new Uint32Array(geometry.index.array);
  const target = Math.max(3, Math.floor(index.length * ratio / 3) * 3);
  const [simplified] = MeshoptSimplifier.simplify(index, positions, 3, target, 0.01, ['LockBorder']);
  geometry.setIndex(new THREE.BufferAttribute(simplified, 1));
}

// Reparte "count" plazas entre los juguetes según su peso (intercalados).
function assignTypes() {
  const types = [];
  const credit = SETTINGS.toys.map(() => 0);
  for (let i = 0; i < SETTINGS.count; i++) {
    SETTINGS.toys.forEach((t, k) => { credit[k] += t.weight; });
    const k = credit.indexOf(Math.max(...credit));
    credit[k] -= 1;
    types.push(i === 0 ? 0 : k); // el grande de delante: el osito
  }
  return types;
}

// Alto/ancho visibles a una distancia de la cámara.
function viewportAt(distance) {
  const height = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance;
  return { width: height * camera.aspect, height };
}

const radii = []; // radio de choque de cada tipo de juguete (se rellena al cargar)
const types = assignTypes();
const perType = SETTINGS.toys.map((_, k) => types.filter(t => t === k).length);
const items = types.map((type, index) => {
  const z = -easing(index / SETTINGS.count) * SETTINGS.depth;
  const { width, height } = viewportAt(camera.position.z - z);
  const base = new THREE.Vector3(1, 0, 1).multiplyScalar(1 / THREE.MathUtils.randFloat(8, 12));
  return {
    type, index, homeZ: z,
    slot: types.slice(0, index).filter(t => t === type).length, // su número dentro del InstancedMesh
    // Alturas repartidas de forma uniforme (proporción áurea): sin huecos ni montones.
    p: new THREE.Vector3(
      index === 0 ? 0 : THREE.MathUtils.randFloatSpread(width * SETTINGS.spread),
      index === 0 ? -height * 2 : ((index * 0.6180339887) % 1 * 2 - 1) * (height / 2 + 1),
      z),
    v: new THREE.Vector3(0, SETTINGS.speed, 0),
    q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * Math.PI, Math.random() * Math.PI * 2, Math.random() * Math.PI)),
    w: base.clone(),
    baseW: base.add(new THREE.Vector3(0, THREE.MathUtils.randFloatSpread(0.3), 0)), // giro tranquilo de siempre
    r: 0, mass: 1, held: false,
    // De cara a la cámara: "tilt" = desvío por golpes (vector de rotación) y su
    // velocidad está en "w"; "phase" desfasa el balanceo de cada uno.
    facing: !!SETTINGS.toys[type].facing,
    front: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), SETTINGS.toys[type].front || 0),
    tilt: new THREE.Vector3(),
    phase: [Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28]
  };
});
for (const item of items) if (item.facing) { item.w.set(0, 0, 0); item.baseW.set(0, 0, 0); }

// Orientación de los que van de cara: mirar a la cámara + golpe + balanceo.
const faceMatrix = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0);
const qFace = new THREE.Quaternion(), qTilt = new THREE.Quaternion(), qSway = new THREE.Quaternion(), sway = new THREE.Euler();
function faceCamera(item, t) {
  faceMatrix.lookAt(camera.position, item.p, up); // su +z apunta a la cámara
  qFace.setFromRotationMatrix(faceMatrix);
  const angle = item.tilt.length();
  qTilt.setFromAxisAngle(angle > 0 ? tmp2.copy(item.tilt).divideScalar(angle) : up, angle);
  const k = t * FACING.swaySpeed, [a, b, c] = FACING.sway, [pa, pb, pc] = item.phase;
  qSway.setFromEuler(sway.set(Math.sin(k * 0.9 + pa) * a, Math.sin(k * 0.7 + pb) * b, Math.sin(k * 1.1 + pc) * c));
  item.q.copy(qFace).multiply(qTilt).multiply(qSway).multiply(item.front);
}

let meshes = null; // meshes[type] = lista de InstancedMesh de ese juguete
const matrix = new THREE.Matrix4(), unit = new THREE.Vector3(1, 1, 1);
const timer = new THREE.Timer();
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), dq = new THREE.Quaternion();

// ---- Arrastre -----------------------------------------------------------------
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane(), hit = new THREE.Vector3(), sphere = new THREE.Sphere();
const drag = { item: null, pointerId: null, offset: new THREE.Vector3(), target: new THREE.Vector3() };

function setRay(event) {
  const bounds = canvas.getBoundingClientRect(); // ya tiene en cuenta el escalado CSS del cartel
  pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
  raycaster.setFromCamera(pointer, camera);
}

// El juguete más cercano bajo el puntero (por su esfera de choque).
function pick() {
  let best = null, bestDistance = Infinity;
  for (const item of items) {
    sphere.set(item.p, item.r);
    if (!raycaster.ray.intersectSphere(sphere, hit)) continue;
    const distance = hit.distanceTo(camera.position);
    if (distance < bestDistance) { bestDistance = distance; best = item; }
  }
  return best;
}

canvas.addEventListener('pointerdown', event => {
  if (!meshes || drag.pointerId !== null || !event.isPrimary || event.button !== 0) return;
  setRay(event);
  const item = pick();
  if (!item) return;
  event.preventDefault();
  // Se arrastra en un plano paralelo a la pantalla, a la profundidad del juguete.
  dragPlane.setFromNormalAndCoplanarPoint(tmp.set(0, 0, 1), item.p);
  if (!raycaster.ray.intersectPlane(dragPlane, hit)) return;
  drag.item = item;
  drag.pointerId = event.pointerId;
  drag.offset.subVectors(item.p, hit);
  drag.target.copy(item.p);
  item.held = true;
  canvas.setPointerCapture(event.pointerId);
  canvas.classList.add('grabbing');
});

canvas.addEventListener('pointermove', event => {
  if (!meshes) return;
  setRay(event);
  if (event.pointerId === drag.pointerId) {
    if (raycaster.ray.intersectPlane(dragPlane, hit)) drag.target.addVectors(hit, drag.offset);
  } else if (drag.pointerId === null) {
    canvas.classList.toggle('over', !!pick()); // mano al pasar por encima
  }
});

function release(event) {
  if (event && event.pointerId !== drag.pointerId) return;
  const item = drag.item;
  if (item) {
    item.held = false;
    item.v.multiplyScalar(PHYSICS.throwScale).clampLength(0, PHYSICS.maxThrow);
  }
  if (drag.pointerId !== null && canvas.hasPointerCapture(drag.pointerId)) canvas.releasePointerCapture(drag.pointerId);
  drag.item = null;
  drag.pointerId = null;
  canvas.classList.remove('grabbing');
  refreshPlaying(); // si soltaste fuera del cartel, se para
}
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('lostpointercapture', release);
window.addEventListener('blur', () => release());

// ---- Simulación ---------------------------------------------------------------
function step(dt) {
  const relax = 1 - Math.exp(-PHYSICS.relax * dt);
  for (const item of items) {
    const { width, height } = viewportAt(camera.position.z - item.p.z);
    if (item.held) {
      item.v.subVectors(drag.target, item.p).multiplyScalar(PHYSICS.follow).clampLength(0, 40);
    } else {
      // Vuelve poco a poco a flotar hacia arriba, a su profundidad y dentro del encuadre.
      item.v.x += (0 - item.v.x) * relax;
      item.v.y += (SETTINGS.speed - item.v.y) * relax;
      item.v.z += (0 - item.v.z) * relax + (item.homeZ - item.p.z) * PHYSICS.depthSpring * dt;
      const edge = width / 2 - item.r * 0.5;
      if (Math.abs(item.p.x) > edge) item.v.x -= Math.sign(item.p.x) * (Math.abs(item.p.x) - edge) * 3 * dt;
    }
    item.p.addScaledVector(item.v, dt);
    if (item.facing) {
      // Muelle: los golpes los desvían y vuelven a mirar de frente.
      item.w.addScaledVector(item.tilt, -FACING.stiffness * dt).multiplyScalar(Math.exp(-FACING.damping * dt));
      item.tilt.addScaledVector(item.w, dt).clampLength(0, FACING.maxTilt);
      faceCamera(item, elapsed);
    } else {
      item.w.lerp(item.baseW, relax * 0.5);
      // Giro: integra la velocidad angular.
      const angle = item.w.length() * dt;
      if (angle > 0) item.q.premultiply(dq.setFromAxisAngle(tmp.copy(item.w).normalize(), angle));
    }
    // Al salir por arriba vuelve a entrar justo por debajo del borde: así casi
    // todos están siempre en pantalla (el grande de delante pasa de vez en cuando).
    const limit = item.index === 0 ? height * 4 : height / 2 + item.r * 1.2;
    if (!item.held && item.p.y > limit) item.p.y = -limit;
  }
  // Choques entre todos (pocos juguetes: basta con comprobar cada pareja).
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      const n = tmp.subVectors(b.p, a.p);
      const distance = n.length(), minimum = a.r + b.r;
      if (distance >= minimum || distance === 0) continue;
      n.divideScalar(distance);
      const ia = a.held ? 0 : 1 / a.mass, ib = b.held ? 0 : 1 / b.mass;
      if (ia + ib === 0) continue;
      // Separarlos.
      const overlap = (minimum - distance) / (ia + ib);
      a.p.addScaledVector(n, -overlap * ia);
      b.p.addScaledVector(n, overlap * ib);
      // Rebote.
      const rel = tmp2.subVectors(b.v, a.v);
      const vn = rel.dot(n);
      if (vn >= 0) continue;
      const J = -(1 + PHYSICS.bounce) * vn / (ia + ib);
      a.v.addScaledVector(n, -J * ia);
      b.v.addScaledVector(n, J * ib);
      // El roce lateral los hace girar.
      rel.addScaledVector(n, -vn).cross(n).multiplyScalar(PHYSICS.spinKick);
      a.w.addScaledVector(rel, -ia * a.mass / a.r);
      b.w.addScaledVector(rel, -ib * b.mass / b.r);
    }
  }
}

function update(dt) {
  const h = dt / PHYSICS.substeps;
  for (let i = 0; i < PHYSICS.substeps; i++) step(h);
  for (const item of items) {
    matrix.compose(item.p, item.q, unit);
    for (const mesh of meshes[item.type]) mesh.setMatrixAt(item.slot, matrix);
  }
  for (const list of meshes) for (const mesh of list) mesh.instanceMatrix.needsUpdate = true;
}

// La escena solo se mueve mientras el ratón está encima del cartel: al salir se
// queda congelada tal cual y sigue donde estaba al volver. Si estás arrastrando un
// juguete, no se para hasta que lo sueltas. En pantallas táctiles (sin "hover")
// arranca al tocar y ya no se para.
// Se escucha en window porque la capa de delante (#overlay) no recibe el ratón.
// Al empezar y al terminar el hover la velocidad sube y baja con suavidad
// (ease-in / ease-out), en lugar de arrancar o frenar de golpe.
const EASE = {
  in: 0.9,               // s que tarda en arrancar del todo
  out: 1.1               // s que tarda en pararse del todo
};

let playing = false, hovering = false, ready = false;
let looping = false;     // ¿está corriendo el bucle de animación?
let ramp = 0;            // 0 = parada, 1 = a velocidad normal (lineal; luego se suaviza)

function setPlaying(play) {
  if (!ready) return;
  playing = play;
  if (play && !looping) {
    looping = true;
    timer.reset(); // que el primer paso no cuente el tiempo que estuvo parada
    renderer.setAnimationLoop(frame);
  }
}

function refreshPlaying() {
  setPlaying(hovering || drag.pointerId !== null);
}

function insideCanvas(event) {
  const b = canvas.getBoundingClientRect();
  return event.clientX >= b.left && event.clientX <= b.right && event.clientY >= b.top && event.clientY <= b.bottom;
}

function onPointer(event) {
  if (event.pointerType === 'touch') {
    if (event.type === 'pointerdown') { hovering = true; refreshPlaying(); }
    return;
  }
  hovering = insideCanvas(event);
  refreshPlaying();
}
window.addEventListener('pointermove', onPointer);
window.addEventListener('pointerdown', onPointer);
// El ratón sale de la ventana (no llega ningún pointermove fuera de ella).
document.documentElement.addEventListener('mouseleave', () => { hovering = false; refreshPlaying(); });
window.addEventListener('blur', () => { hovering = false; refreshPlaying(); });

function waitForPointer() {
  ready = true;
  refreshPlaying(); // por si el ratón ya estaba encima mientras cargaba
}

let elapsed = 0; // tiempo de animación (no avanza durante los parones)
function frame(timestamp) {
  timer.update(timestamp);
  // Paso limitado: tras un parón (pestaña en segundo plano, equipo lento) no da saltos.
  const real = Math.min(timer.getDelta(), 1 / 30);
  // Rampa de velocidad con curva suave en ambos extremos (smoothstep).
  ramp = THREE.MathUtils.clamp(ramp + (playing ? real / EASE.in : -real / EASE.out), 0, 1);
  const dt = real * ramp * ramp * (3 - 2 * ramp);
  elapsed += dt;
  update(dt);
  moveCamera(elapsed, dt);
  lens.uniforms.time.value = elapsed;
  composer.render();
  // Ya se ha parado del todo: se detiene el bucle (no gasta GPU mientras espera).
  if (!playing && ramp === 0) {
    looping = false;
    renderer.setAnimationLoop(null);
  }
}

MeshoptSimplifier.ready
  .then(() => Promise.all(SETTINGS.toys.map((toy, k) => loadToy(toy, perType[k]))))
  .then(result => {
    meshes = result;
    for (const item of items) {
      item.r = radii[item.type];
      item.mass = item.r ** 3;
    }
    update(0);
    moveCamera(0, 0);
    // Compila todos los shaders (materiales + sombras) antes de mostrar nada: si no,
    // el primer fotograma bloquea la página unos segundos y parece congelada.
    return renderer.compileAsync(scene, camera);
  })
  .then(() => {
    composer.render(); // primer fotograma: la escena se queda quieta así
    status?.remove();
    canvas.classList.add('ready');
    waitForPointer();
  })
  .catch(error => {
    console.error('No se pudieron cargar los juguetes', error);
    if (status) status.textContent = 'No se pudieron cargar los juguetes.';
  });
