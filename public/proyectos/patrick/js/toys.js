import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCinematicPipeline } from './cinematic.js';
import { extractTreeStar } from './star.js';

const WIDTH = 8.48;
const HEIGHT = 12;
const FOOTER_HEIGHT = 1.2; // 120 px; 100 px por unidad de la escena.
const FLOOR_Y = -HEIGHT / 2 + FOOTER_HEIGHT;
const MAX_GIFTS = 25;
const SPAWN_INTERVAL = 0.4; // 2,5 regalos/s: más espacio para las piezas grandes.
const GIFT_DEPTH = 0;
const GIFT_DEPTH_HALF = 1.28;
const TREE_DEPTH = 0.5;
const INITIAL_FALL_SPEED = 4;
// Pasos cortos para resolver contactos incluso durante la caída más rápida.
const STEP = 1 / 60;
const TREE_AREA = { left: 224, right: 624, top: 400, bottom: 1080 };
const TREE_URL = new URL(
  '../KayKit_Holiday_Bits_1.0_FREE/Assets/gltf/christmas_tree.gltf',
  import.meta.url,
);
const MODEL_NAMES = [
  'present_A_red', 'present_B_blue', 'present_C_green',
  'present_D_yellow', 'present_E_white',
];
const MODEL_TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0.3, 0));
const instances = new WeakMap();
const SPAWN_ZONES = ['left', 'right', 'center', 'left', 'right', 'left', 'right', 'center'];

export function createGiftRain(poster) {
  if (instances.has(poster)) return instances.get(poster);
  const scene = new THREE.Scene();
  // Vista de y=0 a y=1080: un mismo límite visual y físico sobre el footer.
  const camera = new THREE.OrthographicCamera(
    -WIDTH / 2, WIDTH / 2, HEIGHT / 2, FLOOR_Y, 0.1, 50,
  );
  camera.position.z = 20;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = 'poster__canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  poster.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x354c43, 0.5));
  scene.add(new THREE.AmbientLight(0xffffff, 0.14));
  // Una única luz proyecta todas las sombras; ninguna luz depende de los regalos.
  const light = new THREE.DirectionalLight(0xffeedb, 3.3);
  light.position.set(-1.5, 11, 7);
  light.target.position.set(0, 0.6, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, {
    left: -5, right: 5, top: 6.5, bottom: -6.5, near: 0.5, far: 24,
  });
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.bias = -0.0001;
  light.shadow.normalBias = 0.012;
  scene.add(light, light.target);

  const shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.2, depthWrite: false });
  const floorShadow = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, 10), shadowMaterial);
  floorShadow.rotation.x = -Math.PI / 2;
  floorShadow.position.y = FLOOR_Y;
  floorShadow.position.z = GIFT_DEPTH;
  floorShadow.receiveShadow = true;
  scene.add(floorShadow);
  // Con la cámara frontal el suelo se ve de canto. Este receptor transparente
  // permite apreciar también las sombras sobre el fondo oscuro, sin añadir color.
  const backdropShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH, HEIGHT - FOOTER_HEIGHT), shadowMaterial,
  );
  backdropShadow.position.set(0, (HEIGHT / 2 + FLOOR_Y) / 2, -4.2);
  backdropShadow.receiveShadow = true;
  scene.add(backdropShadow);

  // Recursos compartidos para destellos y sombras de contacto, sin nuevas luces.
  function makeTexture(star) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, star ? '#fff8df' : '#000000aa');
    gradient.addColorStop(star ? 0.2 : 0.35, star ? '#ffe1a4bb' : '#00000055');
    gradient.addColorStop(1, '#00000000');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    if (star) {
      ctx.fillStyle = '#fff4d0';
      ctx.beginPath();
      ctx.moveTo(32, 7); ctx.lineTo(36, 28); ctx.lineTo(56, 32); ctx.lineTo(36, 36);
      ctx.lineTo(32, 57); ctx.lineTo(28, 36); ctx.lineTo(8, 32); ctx.lineTo(28, 28);
      ctx.closePath(); ctx.fill();
    }
    return new THREE.CanvasTexture(canvas);
  }
  const sparkleTexture = makeTexture(true);
  const sparkles = Array.from({ length: 12 }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sparkleTexture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, age: 1, velocity: new THREE.Vector3() };
  });
  let nextSparkle = 0;
  const contactTexture = makeTexture(false);
  const contactGeometry = new THREE.PlaneGeometry(1, 1);
  const contactMaterial = new THREE.MeshBasicMaterial({
    map: contactTexture, transparent: true, opacity: 0.38, depthWrite: false,
  });
  const contactShadows = new THREE.InstancedMesh(contactGeometry, contactMaterial, MAX_GIFTS);
  contactShadows.count = 0;
  contactShadows.frustumCulled = false;
  contactShadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(contactShadows);
  const contactTransform = new THREE.Object3D();
  const colliderRotation = new THREE.Quaternion();
  const colliderMatrix = new THREE.Matrix4();
  const cinematic = createCinematicPipeline(renderer, scene, camera,
    [floorShadow, backdropShadow, contactShadows, ...sparkles.map(({ sprite }) => sprite)]);

  let world;
  let treeObject = null;
  let treeBody = null;
  let starMesh = null;
  let levitating = false;
  let levitationBlend = 0;
  let pointerPosition = null;
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();
  let gifts = [];
  let templates = [];
  let active = false;
  let frame = null;
  let lastTime = null;
  let spawnTime = 0;
  let disposed = false;
  let floorBody;
  let pauseSpawn = false;
  let manualDebugStep = false;
  const debugEnabled = new URLSearchParams(window.location.search).get('physicsDebug') === '1';
  let debugVisible = debugEnabled;
  const collisions = { giftGift: 0, floor: 0, maxPenetration: 0, floorCrossings: 0 };
  const debugGeometry = debugEnabled ? new THREE.BoxGeometry(1, 1, 1) : null;
  const debugMaterial = debugEnabled ? new THREE.MeshBasicMaterial({
    color: 0x66ffcc, wireframe: true, depthTest: false, transparent: true, opacity: 0.75,
  }) : null;
  const debugMeshes = new Map();
  const debugShapeGeometries = new Map();
  const debugOrientation = new THREE.Quaternion();
  const giftContactMaterial = new CANNON.Material('gift');
  const boundaryContactMaterial = new CANNON.Material('boundary');
  function setStarHovered(hovered) {
    if (levitating === hovered) return;
    levitating = hovered;
    levitationBlend = 0;
    if (starMesh) starMesh.material.emissiveIntensity = starMesh.userData.baseEmissiveIntensity * (hovered ? 1.22 : 1);
    for (const gift of gifts) {
      const { body } = gift;
      if (hovered) {
        gift.previousAllowSleep = body.allowSleep;
        gift.hoverHeight = Math.min(0.15,
          Math.max(body.position.y + 1.15, FLOOR_Y + 2.2 + (gift.phase % 1) * 1.9));
        body.allowSleep = false;
      } else {
        body.allowSleep = gift.previousAllowSleep ?? true;
        body.force.setZero();
        body.torque.setZero();
      }
      body.wakeUp();
    }
    if (active) schedule();
    render();
  }

  function updateStarHover() {
    let hit = false;
    if (pointerPosition && starMesh && !disposed) {
      const rect = renderer.domElement.getBoundingClientRect();
      const [x, y] = pointerPosition;
      if (rect.width && rect.height && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        pointerNDC.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
        camera.updateMatrixWorld();
        starMesh.updateWorldMatrix(true, false);
        raycaster.setFromCamera(pointerNDC, camera);
        hit = raycaster.intersectObject(starMesh, false).length > 0;
      }
    }
    setStarHovered(hit);
    return hit;
  }

  function applyLevitation(physicsWorld) {
    if (!levitating) return;
    levitationBlend = THREE.MathUtils.damp(levitationBlend, 1, 4, STEP);
    for (const gift of gifts) {
      const { body, phase, hoverHeight } = gift;
      const wave = Math.sin(physicsWorld.time * 1.4 + phase) * 0.12;
      const acceleration = THREE.MathUtils.clamp(
        2.4 * (hoverHeight + wave - body.position.y) - 2.5 * body.velocity.y, -6, 5,
      );
      // Fuerza central: compensa el peso y añade un muelle amortiguado.
      // No se modifican posiciones, cuaterniones ni velocidades manualmente.
      body.force.y += body.mass * (-physicsWorld.gravity.y + acceleration) * levitationBlend;
      body.torque.x += body.mass * (0.035 * Math.sin(physicsWorld.time * 0.8 + phase) - 0.12 * body.angularVelocity.x) * levitationBlend;
      body.torque.y += body.mass * (0.035 * Math.cos(physicsWorld.time * 0.7 + phase) - 0.12 * body.angularVelocity.y) * levitationBlend;
    }
  }
  function updateDebugColliders() {
    if (!debugEnabled) return;
    for (const body of world.bodies) body.shapes.forEach((shape, index) => {
      const key = `${body.id}:${index}`;
      let mesh = debugMeshes.get(key);
      if (!mesh) {
        let geometry = debugGeometry;
        if (shape instanceof CANNON.Cylinder) {
          if (!debugShapeGeometries.has(shape.id)) debugShapeGeometries.set(shape.id,
            new THREE.CylinderGeometry(shape.radiusTop, shape.radiusBottom, shape.height, 12));
          geometry = debugShapeGeometries.get(shape.id);
        }
        mesh = new THREE.Mesh(geometry, debugMaterial);
        mesh.renderOrder = 100;
        scene.add(mesh);
        debugMeshes.set(key, mesh);
      }
      mesh.quaternion.copy(body.quaternion);
      mesh.visible = debugVisible;
      mesh.position.copy(body.shapeOffsets[index]).applyQuaternion(mesh.quaternion).add(body.position);
      mesh.quaternion.multiply(debugOrientation.copy(body.shapeOrientations[index]));
      if (shape instanceof CANNON.Box) mesh.scale.copy(shape.halfExtents).multiplyScalar(2);
    });
  }
  function render(frameSeconds = 0) {
    if (manualDebugStep) return;
    updateDebugColliders();
    // Un solo depth buffer decide qué superficies están delante de las demás.
    if (debugEnabled) renderer.render(scene, camera);
    else cinematic.render(frameSeconds);
  }

  function createWorld() {
    const next = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0), allowSleep: true });
    next.broadphase = new CANNON.SAPBroadphase(next);
    next.solver.iterations = 40;
    next.solver.tolerance = 1e-8;
    next.defaultContactMaterial.friction = 0.4;
    next.defaultContactMaterial.restitution = 0.06;
    next.defaultContactMaterial.contactEquationStiffness = 1e8;
    next.defaultContactMaterial.contactEquationRelaxation = 4;
    next.addEventListener('preStep', () => applyLevitation(next));
    // Los límites contienen, pero no sostienen regalos elevados por fricción.
    next.addContactMaterial(new CANNON.ContactMaterial(giftContactMaterial, boundaryContactMaterial, {
      friction: 0, restitution: 0.06,
      contactEquationStiffness: 1e8, contactEquationRelaxation: 4,
    }));
    function wall(x, y, z, hx, hy, hz, material = null) {
      const body = new CANNON.Body({
        mass: 0, position: new CANNON.Vec3(x, y, z),
        shape: new CANNON.Box(new CANNON.Vec3(hx, hy, hz)),
        material,
        collisionFilterGroup: 1, collisionFilterMask: 1,
      });
      next.addBody(body);
      return body;
    }
    floorBody = wall(0, FLOOR_Y - 0.25, GIFT_DEPTH, WIDTH / 2 + 1, 0.25, GIFT_DEPTH_HALF);
    wall(-WIDTH / 2 - 0.25, 1, GIFT_DEPTH, 0.25, HEIGHT, GIFT_DEPTH_HALF, boundaryContactMaterial);
    wall(WIDTH / 2 + 0.25, 1, GIFT_DEPTH, 0.25, HEIGHT, GIFT_DEPTH_HALF, boundaryContactMaterial);
    // Contener la profundidad permite girar en 3D sin perder regalos detrás del póster.
    wall(0, 1, GIFT_DEPTH - GIFT_DEPTH_HALF - 0.25, WIDTH / 2 + 1, HEIGHT, 0.25, boundaryContactMaterial);
    wall(0, 1, GIFT_DEPTH + GIFT_DEPTH_HALF + 0.25, WIDTH / 2 + 1, HEIGHT, 0.25, boundaryContactMaterial);
    // El mismo árbol estático sobrevive a los reinicios sin duplicarse.
    if (treeBody) {
      if (treeBody.world) treeBody.world.removeBody(treeBody);
      next.addBody(treeBody);
    }
    return next;
  }
  world = createWorld();

  function spawn(options = {}) {
    if (levitating || !templates.length || gifts.length >= MAX_GIFTS) return;
    const template = templates[options.templateIndex ?? Math.floor(Math.random() * templates.length)];
    const size = options.size ?? THREE.MathUtils.randFloat(0.48, 0.76) * 1.25 * 2;
    const half = template.colliderSize.clone().multiplyScalar(size / 2);
    const radius = half.length();
    const edge = WIDTH / 2 - radius - 0.02;
    // Con 25 unidades: 6 centrales, 9 izquierdas y 10 derechas.
    const zone = gifts.length === 24 ? 'right' : SPAWN_ZONES[gifts.length % SPAWN_ZONES.length];
    const side = zone === 'left' ? -1 : 1;
    const x = options.x ?? (zone === 'center' ? THREE.MathUtils.randFloat(-0.65, 0.65)
      : side * THREE.MathUtils.randFloat(Math.min(1.65, edge), edge));
    // Todos nacen en el mismo plano Z, dentro de una profundidad acotada.
    const z = options.z ?? GIFT_DEPTH;
    const y = options.y ?? HEIGHT / 2 + radius + 0.05;
    // No introducir cuerpos solapados cuando la pila llega a la parte superior.
    if (gifts.some(({ body }) => Math.hypot(body.position.x - x, body.position.y - y, body.position.z - z) < body.boundingRadius + radius)) return;
    // El grupo raíz coincide con el cuerpo; solo el hijo visual se deforma.
    const visual = template.object.clone(true);
    const mesh = new THREE.Group();
    mesh.add(visual);
    mesh.scale.setScalar(size);
    const body = new CANNON.Body({
      material: giftContactMaterial,
      mass: size * size,
      position: new CANNON.Vec3(x, y, z),
      velocity: new CANNON.Vec3(0, -INITIAL_FALL_SPEED, 0),
      linearDamping: 0.2, angularDamping: 0.55,
      allowSleep: true, sleepSpeedLimit: 0.18, sleepTimeLimit: 1.2,
      collisionFilterGroup: 1,
      collisionFilterMask: 1,
      linearFactor: new CANNON.Vec3(1, 1, 1),
      angularFactor: new CANNON.Vec3(1, 1, 1),
    });
    body.addShape(new CANNON.Box(new CANNON.Vec3(half.x, half.y, half.z)),
      new CANNON.Vec3(), new CANNON.Quaternion(MODEL_TILT.x, MODEL_TILT.y, MODEL_TILT.z, MODEL_TILT.w));
    body.quaternion.setFromEuler(
      THREE.MathUtils.randFloat(-0.5, 0.5),
      THREE.MathUtils.randFloat(-0.5, 0.5),
      THREE.MathUtils.randFloat(-Math.PI, Math.PI),
    );
    // Impulso angular inicial: las colisiones, el amortiguamiento y el reposo
    // gobiernan el giro posterior, sin animaciones que fuercen la rotación.
    body.angularVelocity.set(
      THREE.MathUtils.randFloat(-1.5, 1.5),
      THREE.MathUtils.randFloat(-1.5, 1.5),
      THREE.MathUtils.randFloat(-1.5, 1.5),
    );
    if (options.aligned) {
      body.quaternion.set(-MODEL_TILT.x, -MODEL_TILT.y, -MODEL_TILT.z, MODEL_TILT.w);
      body.angularVelocity.setZero();
      body.velocity.setZero();
    }
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
    scene.add(mesh);
    world.addBody(body);
    const gift = { mesh, visual, body, size, zone, phase: gifts.length * 2.399963,
      hoverHeight: body.position.y, lastImpact: -Infinity };
    body.addEventListener('collide', ({ contact }) => {
      const otherBody = contact.bi === body ? contact.bj : contact.bi;
      if (otherBody.mass > 0) collisions.giftGift++;
      if (otherBody === floorBody) collisions.floor++;
      const speed = Math.abs(contact.getImpactVelocityAlongNormal());
      // Filtrar contactos de reposo y los contactos repetidos del mismo rebote.
      if (speed < 1.4 || world.time - gift.lastImpact < 0.14) return;
      gift.lastImpact = world.time;
      if (speed > 2.2 && body.position.y < 0) {
        const point = contact.bi.position.vadd(contact.ri);
        for (let i = 0; i < 2; i++) {
          const spark = sparkles[nextSparkle++ % sparkles.length];
          spark.age = 0;
          spark.sprite.position.set(point.x, point.y, point.z + 0.1);
          spark.velocity.set(THREE.MathUtils.randFloatSpread(0.3), 0.35 + Math.random() * 0.2, 0);
          spark.sprite.visible = true;
        }
      }
    });
    gifts.push(gift);
    return gift;
  }

  function tick(time) {
    frame = null;
    if (!active || disposed) return;
    const renderDelta = lastTime === null ? 0 : (time - lastTime) / 1000;
    const dt = lastTime === null ? STEP : Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;
    if (!pauseSpawn && !levitating && gifts.length < MAX_GIFTS) {
      spawnTime += dt;
      if (spawnTime >= SPAWN_INTERVAL) {
        spawnTime %= SPAWN_INTERVAL;
        spawn();
      }
    }
    world.step(STEP, dt, 8);
    if (debugEnabled) for (const contact of world.contacts) {
      const a = contact.bi.position.vadd(contact.ri);
      const b = contact.bj.position.vadd(contact.rj);
      collisions.maxPenetration = Math.max(collisions.maxPenetration, -contact.ni.dot(b.vsub(a)));
    }
    for (let index = 0; index < gifts.length; index++) {
      const gift = gifts[index];
      const { mesh, visual, body } = gift;
      if (debugEnabled) {
        body.updateAABB();
        if (body.aabb.upperBound.y < FLOOR_Y) collisions.floorCrossings++;
      }
      mesh.position.copy(body.position);
      mesh.quaternion.copy(body.quaternion);
      // Sin deformaciones ni balanceos que separen la geometría de su collider.
      visual.scale.setScalar(1);
      visual.quaternion.identity();
      // Distancia real caja/suelo: la sombra solo aparece al acercarse al apoyo.
      const half = body.shapes[0].halfExtents;
      colliderRotation.copy(mesh.quaternion).multiply(MODEL_TILT);
      colliderMatrix.makeRotationFromQuaternion(colliderRotation);
      const e = colliderMatrix.elements;
      const extentY = Math.abs(e[1]) * half.x + Math.abs(e[5]) * half.y + Math.abs(e[9]) * half.z;
      const extentX = Math.abs(e[0]) * half.x + Math.abs(e[4]) * half.y + Math.abs(e[8]) * half.z;
      const gap = Math.max(0, mesh.position.y - extentY - FLOOR_Y);
      const strength = Math.max(0, 1 - gap / 0.35);
      contactTransform.position.set(mesh.position.x, FLOOR_Y + 0.035, mesh.position.z);
      contactTransform.scale.set(extentX * 2.2 * strength, 0.13 * strength, 1);
      contactTransform.updateMatrix();
      contactShadows.setMatrixAt(index, contactTransform.matrix);
    }
    contactShadows.count = gifts.length;
    contactShadows.instanceMatrix.needsUpdate = true;
    for (const spark of sparkles) {
      if (!spark.sprite.visible) continue;
      spark.age += dt;
      spark.sprite.visible = spark.age < 0.38;
      spark.sprite.position.addScaledVector(spark.velocity, dt);
      spark.sprite.material.opacity = Math.max(0, 1 - spark.age / 0.38) * 0.65;
      spark.sprite.scale.setScalar(0.09 + Math.sin(Math.min(1, spark.age / 0.38) * Math.PI) * 0.05);
    }
    render(renderDelta);
    // La pila permanece visible sin seguir renderizando cuando todo está en reposo.
    if ((!levitating && gifts.length < MAX_GIFTS) || gifts.some(({ body }) => body.sleepState !== CANNON.Body.SLEEPING)
      || sparkles.some(({ sprite }) => sprite.visible)) {
      frame = requestAnimationFrame(tick);
    } else {
      lastTime = null;
    }
  }

  function schedule() {
    if (active && templates.length && treeBody && frame === null && !disposed) {
      lastTime = null;
      frame = requestAnimationFrame(tick);
    }
  }

  function reset() {
    active = false;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    lastTime = null;
    pointerPosition = null;
    setStarHovered(false);
    levitationBlend = 0;
    pauseSpawn = false;
    collisions.giftGift = collisions.floor = collisions.maxPenetration = collisions.floorCrossings = 0;
    for (const mesh of debugMeshes.values()) scene.remove(mesh);
    debugMeshes.clear();
    spawnTime = SPAWN_INTERVAL;
    for (const { mesh, body } of gifts) {
      scene.remove(mesh);
      world.removeBody(body);
    }
    gifts = [];
    contactShadows.count = 0;
    for (const spark of sparkles) { spark.sprite.visible = false; spark.age = 1; }
    nextSparkle = 0;
    // Sustituir el mundo elimina también contactos, cachés y tiempo acumulado.
    world = createWorld();
    render();
  }

  function resize() {
    if (disposed || !poster.clientWidth || !poster.clientHeight) return;
    cinematic.resize(poster.clientWidth, poster.clientHeight * (HEIGHT - FOOTER_HEIGHT) / HEIGHT);
    updateStarHover();
    render();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(poster);
  resize();

  // Se reutilizan geometrías, materiales y una única textura entre clones.
  const manager = new THREE.LoadingManager();
  const textureURL = new URL('../assets/models/gifts/holiday_bits_texture.png', import.meta.url).href;
  const texture = new THREE.TextureLoader(manager).load(textureURL);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  const loader = new GLTFLoader(manager);
  loader.loadAsync(TREE_URL.href).then(({ scene: model }) => {
    const bounds = new THREE.Box3().setFromObject(model);
    starMesh = extractTreeStar(model);
    // Encajar sin deformar y apoyar la base en el borde inferior del área.
    const scale = Math.min(
      (TREE_AREA.right - TREE_AREA.left) / 100 / (bounds.max.x - bounds.min.x),
      (TREE_AREA.bottom - TREE_AREA.top) / 100 / (bounds.max.y - bounds.min.y),
    );
    model.scale.setScalar(scale);
    model.position.set(
      (TREE_AREA.left + TREE_AREA.right) / 200 - WIDTH / 2 - (bounds.min.x + bounds.max.x) * 0.5 * scale,
      HEIGHT / 2 - TREE_AREA.bottom / 100 - bounds.min.y * scale,
      TREE_DEPTH,
    );
    treeObject = model;
    model.name = 'christmas-tree';
    model.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        // El atlas KayKit también alimenta las luces del árbol.
        for (const slot of ['map', 'emissiveMap']) {
          if (!material[slot]) continue;
          if (material[slot] !== texture) material[slot].dispose();
          material[slot] = texture;
        }
        material.needsUpdate = true;
      }
    });
    if (disposed) { releaseAssets(); return; }
    scene.add(model);

    treeBody = new CANNON.Body({ mass: 0, position: new CANNON.Vec3(model.position.x, model.position.y, model.position.z) });
    // Solo el tronco participa: las ramas y la estrella no sostienen regalos en altura.
    treeBody.addShape(new CANNON.Cylinder(0.16 * scale, 0.19 * scale, 0.65 * scale, 12),
      new CANNON.Vec3(0, 0.325 * scale, 0));
    world.addBody(treeBody);
    updateStarHover();
    render();
    schedule();
  }).catch((error) => {
    console.error('No se pudo cargar el árbol de Navidad:', error);
  });

  Promise.allSettled(MODEL_NAMES.map(async (name) => {
    const url = new URL(`../assets/models/gifts/${name}.gltf`, import.meta.url);
    const { scene: model } = await loader.loadAsync(url.href);
    // Pequeña perspectiva incorporada al modelo; el cuerpo físico sigue siendo una caja.
    model.rotation.set(0.2, 0.3, 0);
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const scale = 1 / Math.max(size.x, size.y, size.z);
    // Medir TODA la geometría en ejes locales, sin alturas recortadas a mano.
    model.rotation.set(0, 0, 0);
    model.updateMatrixWorld(true);
    const boxBounds = new THREE.Box3();
    const point = new THREE.Vector3();
    model.traverse((node) => {
      if (!node.isMesh) return;
      const positions = node.geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld);
        boxBounds.expandByPoint(point);
      }
    });
    const colliderSize = boxBounds.getSize(new THREE.Vector3()).multiplyScalar(scale);
    const center = boxBounds.getCenter(new THREE.Vector3()).applyQuaternion(MODEL_TILT);
    model.quaternion.copy(MODEL_TILT);
    const object = new THREE.Group();
    const centered = new THREE.Group();
    centered.add(model);
    centered.position.copy(center).negate();
    object.add(centered);
    object.scale.setScalar(scale);
    // Normalizar dentro de otro grupo permite variar el tamaño de cada clon.
    const normalized = new THREE.Group();
    normalized.add(object);
    model.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (material.map) {
          material.map.dispose();
          material.map = texture;
          material.needsUpdate = true;
        }
      }
    });
    return { object: normalized, colliderSize };
  })).then((results) => {
    templates = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
    for (const result of results) {
      if (result.status === 'rejected') console.error('No se pudo cargar un regalo:', result.reason);
    }
    if (disposed) { releaseAssets(); return; }
    schedule();
  });

  function releaseAssets() {
    const geometries = new Set();
    const materials = new Set();
    const objects = templates.map(({ object }) => object);
    if (treeObject) objects.push(treeObject);
    for (const object of objects) object.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.material) for (const m of Array.isArray(node.material) ? node.material : [node.material]) materials.add(m);
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    texture.dispose();
    templates = [];
    if (treeObject) scene.remove(treeObject);
    treeObject = null;
    starMesh = null;
  }

  const api = {
    updatePointer(clientX, clientY) {
      pointerPosition = [clientX, clientY];
      return updateStarHover();
    },
    start() {
      if (disposed || active) return;
      active = true;
      spawnTime = SPAWN_INTERVAL;
      schedule();
    },
    reset,
    dispose() {
      if (disposed) return;
      reset();
      disposed = true;
      observer.disconnect();
      floorShadow.geometry.dispose();
      backdropShadow.geometry.dispose();
      shadowMaterial.dispose();
      light.shadow.dispose();
      debugGeometry?.dispose();
      debugMaterial?.dispose();
      for (const geometry of debugShapeGeometries.values()) geometry.dispose();
      sparkleTexture.dispose();
      for (const { sprite } of sparkles) sprite.material.dispose();
      contactGeometry.dispose();
      contactMaterial.dispose();
      contactTexture.dispose();
      releaseAssets();
      cinematic.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      if (debugEnabled && window.movingPosterPhysics === api.debug) delete window.movingPosterPhysics;
      instances.delete(poster);
    },
  };
  if (debugEnabled) {
    // Diagnóstico optativo: /?physicsDebug=1. No añade eventos ni otro mundo/bucle.
    api.debug = {
      showColliders(visible = true) {
        debugVisible = visible;
        render();
      },
      validateTemplates() {
        const inverseTilt = MODEL_TILT.clone().invert();
        return templates.map(({ object, colliderSize }) => {
          object.updateMatrixWorld(true);
          const half = colliderSize.clone().multiplyScalar(0.5);
          let maxOutside = 0;
          object.traverse((node) => {
            if (!node.isMesh) return;
            const positions = node.geometry.getAttribute('position');
            const point = new THREE.Vector3();
            for (let i = 0; i < positions.count; i++) {
              point.fromBufferAttribute(positions, i).applyMatrix4(node.matrixWorld).applyQuaternion(inverseTilt);
              maxOutside = Math.max(maxOutside, Math.abs(point.x) - half.x,
                Math.abs(point.y) - half.y, Math.abs(point.z) - half.z);
            }
          });
          return { half: half.toArray(), maxOutside };
        });
      },
      get state() {
        return {
          ready: templates.length === MODEL_NAMES.length && !!treeBody,
          levitating,
          levitationBlend,
          star: starMesh ? (() => {
            starMesh.updateWorldMatrix(true, false);
            const bounds = new THREE.Box3().setFromObject(starMesh);
            const center = bounds.getCenter(new THREE.Vector3()).project(camera);
            const rect = renderer.domElement.getBoundingClientRect();
            return {
              screen: [rect.left + (center.x + 1) * rect.width / 2, rect.top + (1 - center.y) * rect.height / 2],
              bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() },
              triangles: starMesh.geometry.index.count / 3,
              emissive: starMesh.material.emissiveIntensity,
              baseEmissive: starMesh.userData.baseEmissiveIntensity,
            };
          })() : null,
          cinematic: cinematic.diagnostics,
          step: STEP, count: gifts.length, floor: FLOOR_Y,
          depth: [GIFT_DEPTH - GIFT_DEPTH_HALF, GIFT_DEPTH + GIFT_DEPTH_HALF],
          contacts: { ...collisions },
          bodies: gifts.map(({ body, mesh, size }) => {
            body.updateAABB();
            return {
              id: body.id, mass: body.mass, dynamic: body.type === CANNON.Body.DYNAMIC,
              sameWorld: body.world === world, group: body.collisionFilterGroup, mask: body.collisionFilterMask,
              position: body.position.toArray(), quaternion: body.quaternion.toArray(),
              velocity: body.velocity.toArray(), angularVelocity: body.angularVelocity.toArray(),
              half: body.shapes[0].halfExtents.toArray(), shapeQuaternion: body.shapeOrientations[0].toArray(),
              bottom: body.aabb.lowerBound.y, zBounds: [body.aabb.lowerBound.z, body.aabb.upperBound.z],
              sleeping: body.sleepState === CANNON.Body.SLEEPING,
              allowSleep: body.allowSleep,
              syncError: mesh.position.distanceTo(body.position), scale: mesh.scale.toArray(), size,
              quaternionError: Math.max(...['x', 'y', 'z', 'w'].map((k) => Math.abs(mesh.quaternion[k] - body.quaternion[k]))),
            };
          }),
        };
      },
      drop(count, options = {}) {
        reset();
        pauseSpawn = true;
        active = true;
        for (let i = 0; i < count; i++) spawn({
          templateIndex: 0, size: 1.2, x: -2.5, z: GIFT_DEPTH, aligned: true,
          ...options, z: options.depthPositions?.[i] ?? options.z ?? GIFT_DEPTH,
          y: (options.y ?? FLOOR_Y + 1.5) + i * (options.spacing ?? 2),
        });
        render();
      },
      advance(seconds) {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        manualDebugStep = true;
        active = true;
        for (let i = 0; i < Math.ceil(seconds / STEP); i++) {
          tick((lastTime ?? 0) + STEP * 1000);
          if (frame !== null) cancelAnimationFrame(frame);
          frame = null;
        }
        manualDebugStep = false;
        render();
        return this.state;
      },
      reset,
    };
    window.movingPosterPhysics = api.debug;
  }
  instances.set(poster, api);
  return api;
}
