// Fondo de bolas de Navidad: adaptación a three.js "a pelo" del ejemplo
// "Best Served Bold Christmas Baubles" de pmndrs (Paul Henschel, licencia MIT)
// https://pmndrs.github.io/examples/bestservedbold-christmas-baubles/
// Original: https://dribbble.com/shots/5708399-Christmas-Collisions (@bstsrvdbld)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { N8AOPass } from 'n8ao';
import RAPIER from '@dimforge/rapier3d-compat';
import { createTextOverBalls } from './text-over-balls.js';

const canvas = document.getElementById('baubles-canvas');
const WIDTH = 848; // tamaño del cartel; js/main.js escala todo con CSS
const HEIGHT = 1200;

const COUNT = 50; // número de bolas
const SCALES = [0.75, 0.75, 1, 1, 1.25];
const STEP = 1 / 60; // paso fijo de la física

// Brillo general: el ejemplo usa exposición 1,5 y luz ambiente π
const EXPOSURE = 1.0;
const AMBIENT = 0.2 * Math.PI;

// ---- Render ----

const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, stencil: false, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(WIDTH, HEIGHT, false);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping; // la aplica OutputPass
renderer.toneMappingExposure = EXPOSURE;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32.5, WIDTH / HEIGHT, 1, 100);
camera.position.set(0, 0, 20);

scene.add(new THREE.AmbientLight(0xffffff, AMBIENT));
const spot = new THREE.SpotLight(0xffffff, Math.PI, 0, 0.2, 1, 0);
spot.position.set(20, 20, 25);
spot.castShadow = true;
spot.shadow.mapSize.set(512, 512);
scene.add(spot);
const back = new THREE.DirectionalLight(0xffffff, 4 * Math.PI);
back.position.set(0, 5, -4);
const under = new THREE.DirectionalLight('red', 4 * Math.PI);
under.position.set(0, -15, 0);
scene.add(back, under);

const composer = new EffectComposer(renderer);
const ao = new N8AOPass(scene, camera, WIDTH, HEIGHT); // renderiza la escena y añade la oclusión
ao.configuration.aoRadius = 2;
ao.configuration.distanceFalloff = 2.5;
ao.configuration.intensity = 1;
ao.configuration.color = new THREE.Color('red');
composer.addPass(ao);
composer.addPass(new OutputPass());

// ---- Materiales ----

// Bolas metálicas: reflejan el entorno HDR, con poco brillo propio.
// METAL 0 = mate, 1 = espejo de color. ROUGH 0 = pulido, 1 = satinado.
const METAL = 0.85;
const ROUGH = 0.22;
const GLOW = 0.08; // brillo propio (el ejemplo usa 1)
const ballMaterial = (color, emissive) => new THREE.MeshStandardMaterial({
  color, emissive, emissiveIntensity: GLOW, metalness: METAL, roughness: ROUGH, envMapIntensity: 1.6
});
const baubleMaterial = ballMaterial('#7a0a10', '#5a0008'); // rojo oscuro
const greenMaterial = ballMaterial('#0b4a22', '#033a14'); // verde oscuro
const GREEN = Math.round(COUNT / 3); // un tercio de las bolas, verdes
const capMaterial = new THREE.MeshStandardMaterial({
  metalness: 0.75,
  roughness: 0.15,
  color: '#8a492f',
  emissive: '#600000',
  envMapIntensity: 20
});
const sphereGeometry = new THREE.SphereGeometry(1, 28, 28);

// ---- Arranque ----

const [gltf, hdr] = await Promise.all([
  new GLTFLoader()
    .setDRACOLoader(new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/libs/draco/gltf/'))
    .loadAsync('public/baubles/cap.glb'),
  new HDRLoader().loadAsync('public/baubles/adamsbridge.hdr'),
  RAPIER.init()
]);
hdr.mapping = THREE.EquirectangularReflectionMapping;
scene.environment = hdr;
capMaterial.envMap = hdr;

let capGeometry;
gltf.scene.traverse(o => { if (!capGeometry && o.isMesh) capGeometry = o.geometry; });

// ---- Física (Rapier, sin gravedad: todo se atrae hacia el centro) ----

const world = new RAPIER.World({ x: 0, y: 0, z: 0 });
world.timestep = STEP;
const r = THREE.MathUtils.randFloatSpread;
const capRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);

const baubles = Array.from({ length: COUNT }, (_, i) => {
  const scale = SCALES[Math.floor(Math.random() * SCALES.length)];
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(r(20), r(20) - 25, r(20) - 10)
      .setLinearDamping(0.75)
      .setAngularDamping(0.15)
  );
  world.createCollider(RAPIER.ColliderDesc.ball(scale).setFriction(0.2), body);
  world.createCollider(
    RAPIER.ColliderDesc.cylinder(0.15 * scale, 0.275 * scale)
      .setTranslation(0, 0, 1.2 * scale)
      .setRotation(capRotation)
      .setFriction(0.2),
    body
  );

  const group = new THREE.Group();
  const sphere = new THREE.Mesh(sphereGeometry, i < GREEN ? greenMaterial : baubleMaterial);
  sphere.scale.setScalar(scale);
  sphere.castShadow = sphere.receiveShadow = true;
  const cap = new THREE.Mesh(capGeometry, capMaterial);
  cap.scale.setScalar(2.5 * scale);
  cap.position.set(0, 0, -1.8 * scale);
  cap.castShadow = true;
  group.add(sphere, cap);
  scene.add(group);

  return {
    scale, body, group,
    prevP: new THREE.Vector3(), prevQ: new THREE.Quaternion(),
    currP: new THREE.Vector3().copy(body.translation()), currQ: new THREE.Quaternion().copy(body.rotation())
  };
});

// Puntero: una esfera cinemática de radio 2 que sigue al ratón y aparta las bolas
const pointerBody = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(100, 100, 100));
world.createCollider(RAPIER.ColliderDesc.ball(2), pointerBody);
const mouse = new THREE.Vector2(); // -1..1 dentro del cartel
const pointer = new THREE.Vector3();
const viewport = (() => {
  const h = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
  return { width: h * camera.aspect, height: h };
})();

window.addEventListener('pointermove', event => {
  // getBoundingClientRect ya incluye el escalado del cartel
  const b = canvas.getBoundingClientRect();
  mouse.set(((event.clientX - b.left) / b.width) * 2 - 1, -((event.clientY - b.top) / b.height) * 2 + 1);
});

// ---- Bucle ----

const impulse = new THREE.Vector3();
let accumulator = 0;
let last = performance.now();

function frame(now) {
  const delta = Math.min(0.1, (now - last) / 1000);
  last = now;

  pointer.lerp({ x: (mouse.x * viewport.width) / 2, y: (mouse.y * viewport.height) / 2, z: 0 }, 0.2);
  pointerBody.setNextKinematicTranslation(pointer);

  for (const b of baubles) {
    impulse.copy(b.body.translation()).normalize()
      .multiply({ x: -50 * delta * b.scale, y: -150 * delta * b.scale, z: -50 * delta * b.scale });
    b.body.applyImpulse(impulse, false);
  }

  accumulator += delta;
  while (accumulator >= STEP) {
    for (const b of baubles) { b.prevP.copy(b.currP); b.prevQ.copy(b.currQ); }
    world.step();
    for (const b of baubles) { b.currP.copy(b.body.translation()); b.currQ.copy(b.body.rotation()); }
    accumulator -= STEP;
  }

  // Interpola entre los dos últimos pasos para que vaya fino en pantallas de 120 Hz
  const alpha = accumulator / STEP;
  for (const b of baubles) {
    b.group.position.lerpVectors(b.prevP, b.currP, alpha);
    b.group.quaternion.slerpQuaternions(b.prevQ, b.currQ, alpha);
  }

  composer.render(delta);
  drawTextOverBalls(); // justo después de pintar, mientras el canvas 3D aún tiene la imagen
  requestAnimationFrame(frame);
}

const drawTextOverBalls = createTextOverBalls({
  glCanvas: canvas,
  overlay: document.getElementById('overlay'),
  cartel: document.getElementById('cartel'),
  width: WIDTH,
  height: HEIGHT
});
await document.fonts.ready; // la fuente tiene que estar cargada para dibujarla

for (const b of baubles) { b.prevP.copy(b.currP); b.prevQ.copy(b.currQ); }
requestAnimationFrame(t => { last = t; frame(t); });
canvas.classList.add('ready');
