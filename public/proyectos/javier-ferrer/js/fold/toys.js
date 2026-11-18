import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

// Decodificador Draco (modelos comprimidos), servido desde el mismo CDN que three.
const draco = new DRACOLoader().setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/libs/draco/gltf/');
const loader = new GLTFLoader().setDRACOLoader(draco);

// ---------------------------------------------------------------------------
// Ajustes. Ángulos en radianes (0.1 rad ≈ 6°).
// Ejes: x = profundidad (tubo en x≈0, cámara en x=7; más x = más delante),
//       y = altura (suelo en 0), z = izquierda/derecha en pantalla.
//
// Física: cada muñeco es un sólido rígido en el plano de la pantalla (z, y) con
// la forma de su silueta (envolvente convexa del modelo). Pueden chocar, apoyarse
// unos en otros, resbalar y volcar (giran en el plano de la pantalla).
// ---------------------------------------------------------------------------

// Osito: cae desde fuera del encuadre y rebota en el suelo.
export const TEDDY = {
  url: 'public/3d/teddy.glb',
  height: 2.2,          // altura del osito
  position: [2, 0, 0],  // dónde cae (x = profundidad de los tres muñecos, z = izquierda/derecha)
  yaw: Math.PI / 2 - 0.3, // giro sobre sí mismo para que mire a la cámara
  // "spin": giro extra al empezar a caer (y: sobre sí mismo, se deshace al bajar;
  // roll: inclinación inicial en la pantalla, la física lo endereza).
  spin: { y: 1.4, roll: 0.5 },
  startHeight: 12,      // altura desde la que cae (fuera de cuadro)
  delay: 1000,          // ms de espera tras el último texto
  mass: 3,
  bounce: 0.3,          // rebote (0 = nada, 1 = pelota perfecta)
  friction: 0.7,
  upright: 10,          // tendencia a quedarse derecho (como un tentetieso; 0 = nada)
  squash: 0.012         // aplastamiento por unidad de velocidad del impacto
};

// Oveja: cae sobre la cabeza del osito y se queda entre las orejas (si no la mueves mucho).
export const SHEEP = {
  url: 'public/3d/oveja.glb',
  height: 0.95,
  delay: 1.0,           // s después del primer golpe del osito contra el suelo
  yaw: Math.PI / 2 + 0.05,
  spin: { y: -1.8, roll: -0.6 },
  startHeight: 13,      // altura desde la que cae (sobre el osito)
  mass: 1,
  bounce: 0.25,
  friction: 0.9,
  upright: 6,
  squash: 0.03
};

// Piano de juguete: cae al suelo junto al osito, después de la oveja.
export const PIANO = {
  url: 'public/3d/toy_piano.glb',
  height: 0.75,         // altura del piano (el ancho sale proporcional)
  position: [2, 0, -1.9], // solo cuenta z: dónde cae (izquierda/derecha)
  yaw: 0.25,            // giro para que el teclado mire a la cámara
  spin: { y: 1.1, roll: -0.4 },
  startHeight: 12,
  delay: 2.2,           // s después del primer golpe del osito contra el suelo
  mass: 4,              // el más pesado
  bounce: 0.2,
  friction: 0.6,
  upright: 3,
  squash: 0.01
};

const WORLD = {
  gravity: 30,
  substeps: 4,          // pasos de simulación por fotograma (más = más estable)
  iterations: 10,       // iteraciones del solver de contactos
  bounceMin: 1.5,       // por debajo de esta velocidad de choque no rebota (evita temblores)
  angularDamping: 1.5,  // frenado del giro
  slop: 0.01,           // solape tolerado antes de corregir posiciones
  correction: 0.5,      // cuánto solape se corrige en cada paso
  maxSpeed: 40,
  hullPoints: 16        // vértices de la silueta de colisión
};

// Arrastre con el ratón.
const DRAG = {
  follow: 18,           // rapidez con la que sigue al puntero
  swing: 0.035,         // cuánto se inclina al moverlo (rad por unidad de velocidad)
  maxSwing: 0.6,
  throwScale: 0.8,      // fuerza del lanzamiento al soltar en movimiento
  maxThrow: 18,         // velocidad máxima de lanzamiento
  maxHeight: 7          // altura máxima a la que se puede subir
};

// ---------------------------------------------------------------------------

async function loadModel(url, height, anisotropy) {
  const model = (await loader.loadAsync(url)).scene;
  // Filtrado anisótropo: mantiene nítidas las texturas aunque se vean en ángulo.
  model.traverse(object => {
    if (!object.isMesh) return;
    for (const key of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
      const texture = object.material[key];
      if (texture) { texture.anisotropy = Math.min(8, anisotropy); texture.needsUpdate = true; }
    }
  });
  // Normaliza el tamaño, centra en x/z y apoya la base en y = 0.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = height / size.y;
  const wrapper = new THREE.Group();
  model.scale.multiplyScalar(scale);
  model.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  wrapper.add(model);
  wrapper.userData.box = new THREE.Box3().setFromObject(wrapper); // caja para el clic
  return wrapper;
}

// ---- Silueta de colisión ----------------------------------------------------

// Proyecta todos los vértices del modelo (girado "yaw") sobre el plano de la
// pantalla (z, y) y devuelve su envolvente convexa (antihoraria), simplificada.
function silhouette(model, yaw, maxPoints) {
  model.updateMatrixWorld(true);
  const c = Math.cos(yaw), s = Math.sin(yaw), v = new THREE.Vector3(), points = [];
  model.traverse(object => {
    if (!object.isMesh) return;
    const position = object.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld);
      points.push([-v.x * s + v.z * c, v.y]); // giro sobre Y: z' = -x·sen + z·cos
    }
  });
  return simplify(convexHull(points), maxPoints);
}

const cross3 = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

// Cadena monótona de Andrew.
function convexHull(points) {
  points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const lower = [], upper = [];
  for (const p of points) {
    while (lower.length >= 2 && cross3(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (let i = points.length - 1; i >= 0; i--) {
    const p = points[i];
    while (upper.length >= 2 && cross3(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}

// Quita los vértices que menos área aportan hasta quedarse con maxPoints.
function simplify(hull, maxPoints) {
  hull = hull.slice();
  while (hull.length > maxPoints) {
    let best = 0, bestArea = Infinity;
    for (let i = 0; i < hull.length; i++) {
      const area = Math.abs(cross3(hull[(i - 1 + hull.length) % hull.length], hull[i], hull[(i + 1) % hull.length]));
      if (area < bestArea) { bestArea = area; best = i; }
    }
    hull.splice(best, 1);
  }
  return hull;
}

// Centro de masas e inercia de un polígono macizo.
function massProperties(poly, mass) {
  let area = 0, cz = 0, cy = 0, inertia = 0;
  for (let i = 0; i < poly.length; i++) {
    const [z1, y1] = poly[i], [z2, y2] = poly[(i + 1) % poly.length];
    const cr = z1 * y2 - z2 * y1;
    area += cr / 2;
    cz += (z1 + z2) * cr / 6;
    cy += (y1 + y2) * cr / 6;
    inertia += cr * (z1 * z1 + z1 * z2 + z2 * z2 + y1 * y1 + y1 * y2 + y2 * y2) / 12;
  }
  cz /= area; cy /= area;
  inertia -= area * (cz * cz + cy * cy);
  return { com: [cz, cy], inertia: inertia * mass / area };
}

// ---- Sólido rígido 2D -------------------------------------------------------

function makeBody(cfg, poly) {
  const { com, inertia } = massProperties(poly, cfg.mass);
  const local = poly.map(([z, y]) => [z - com[0], y - com[1]]);
  const normals = local.map((p, i) => {
    const q = local[(i + 1) % local.length];
    const ez = q[0] - p[0], ey = q[1] - p[1], l = Math.hypot(ez, ey) || 1;
    return [ey / l, -ez / l]; // normal hacia fuera (polígono antihorario)
  });
  return {
    cfg, local, normals, com, inertia,
    z: 0, y: 0, a: 0, vz: 0, vy: 0, w: 0, // (z, y) = centro de masas, a = giro en la pantalla
    active: false, held: false, intro: false, spinK: 0, impacts: 0, touched: false,
    squash: { x: 0, v: 0 },
    verts: local.map(() => [0, 0]), wn: normals.map(() => [0, 0]),
    // Agarrado = cinemático: empuja a los demás pero nadie lo mueve.
    get invM() { return this.held ? 0 : 1 / cfg.mass; },
    get invI() { return this.held ? 0 : 1 / inertia; },
    refresh() {
      const c = Math.cos(this.a), s = Math.sin(this.a);
      for (let i = 0; i < local.length; i++) {
        const [u, v] = local[i], [nu, nv] = normals[i];
        this.verts[i][0] = this.z + c * u - s * v; this.verts[i][1] = this.y + s * u + c * v;
        this.wn[i][0] = c * nu - s * nv; this.wn[i][1] = s * nu + c * nv;
      }
    },
    // Coloca la base del modelo (sin girar) en (z, y).
    place(z, y) {
      this.z = z + com[0]; this.y = y + com[1];
      this.vz = this.vy = this.w = 0;
    },
    extent() { return Math.max(...local.map(p => Math.hypot(p[0], p[1]))); }
  };
}

// ---- Contactos ---------------------------------------------------------------

function contact(A, B, nz, ny, p, pen) {
  return { A, B, nz, ny, pz: p[0], py: p[1], pen };
}

// Suelo (y = 0) y paredes laterales (z = ±W).
function boundsContacts(b, W, out) {
  for (const p of b.verts) {
    if (p[1] < 0) out.push(contact(null, b, 0, 1, p, -p[1]));
    if (p[0] < -W) out.push(contact(null, b, 1, 0, p, -W - p[0]));
    if (p[0] > W) out.push(contact(null, b, -1, 0, p, p[0] - W));
  }
}

// Eje de separación máxima de B respecto a las caras de A.
function maxSeparation(A, B) {
  let best = -Infinity, index = 0;
  for (let i = 0; i < A.verts.length; i++) {
    const [nz, ny] = A.wn[i], [vz, vy] = A.verts[i];
    let min = Infinity;
    for (const [pz, py] of B.verts) {
      const d = (pz - vz) * nz + (py - vy) * ny;
      if (d < min) min = d;
    }
    if (min > best) { best = min; index = i; }
  }
  return [best, index];
}

// Recorta el segmento p1-p2 al semiplano n·p <= offset (null si quedan < 2 puntos).
function clip(p1, p2, nz, ny, offset) {
  const d1 = p1[0] * nz + p1[1] * ny - offset, d2 = p2[0] * nz + p2[1] * ny - offset;
  const out = [];
  if (d1 <= 0) out.push(p1);
  if (d2 <= 0) out.push(p2);
  if (d1 * d2 < 0) {
    const t = d1 / (d1 - d2);
    out.push([p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])]);
  }
  return out.length >= 2 ? out : null;
}

// Polígono contra polígono (SAT + recorte de la arista incidente, como Box2D).
function polygonContacts(A, B, out) {
  const [sA, eA] = maxSeparation(A, B);
  if (sA > 0) return;
  const [sB, eB] = maxSeparation(B, A);
  if (sB > 0) return;
  let ref = A, inc = B, edge = eA;
  if (sB > sA + 0.005) { ref = B; inc = A; edge = eB; }
  const [nz, ny] = ref.wn[edge];
  let j = 0, min = Infinity;
  for (let k = 0; k < inc.wn.length; k++) {
    const d = inc.wn[k][0] * nz + inc.wn[k][1] * ny;
    if (d < min) { min = d; j = k; }
  }
  const v1 = ref.verts[edge], v2 = ref.verts[(edge + 1) % ref.verts.length];
  let tz = v2[0] - v1[0], ty = v2[1] - v1[1];
  const len = Math.hypot(tz, ty) || 1; tz /= len; ty /= len;
  let seg = clip(inc.verts[j], inc.verts[(j + 1) % inc.verts.length], -tz, -ty, -(tz * v1[0] + ty * v1[1]));
  if (!seg) return;
  seg = clip(seg[0], seg[1], tz, ty, tz * v2[0] + ty * v2[1]);
  if (!seg) return;
  for (const p of seg) {
    const separation = (p[0] - v1[0]) * nz + (p[1] - v1[1]) * ny;
    if (separation <= 0) out.push(contact(ref, inc, nz, ny, p, -separation));
  }
}

// Impulsos secuenciales con rozamiento de Coulomb.
function relativeNormal(c) {
  const { A, B } = c;
  let vz = B.vz - B.w * c.rBy, vy = B.vy + B.w * c.rBz;
  if (A) { vz -= A.vz - A.w * c.rAy; vy -= A.vy + A.w * c.rAz; }
  return [vz, vy];
}

function applyImpulse(c, Pz, Py) {
  const { A, B } = c;
  B.vz += Pz * B.invM; B.vy += Py * B.invM; B.w += (c.rBz * Py - c.rBy * Pz) * B.invI;
  if (A) { A.vz -= Pz * A.invM; A.vy -= Py * A.invM; A.w -= (c.rAz * Py - c.rAy * Pz) * A.invI; }
}

function solveContacts(contacts) {
  for (const c of contacts) {
    const { A, B } = c;
    c.rBz = c.pz - B.z; c.rBy = c.py - B.y;
    c.rAz = A ? c.pz - A.z : 0; c.rAy = A ? c.py - A.y : 0;
    const iA = A ? A.invM : 0, IA = A ? A.invI : 0;
    const rnA = c.rAz * c.ny - c.rAy * c.nz, rnB = c.rBz * c.ny - c.rBy * c.nz;
    const rtA = c.rAz * -c.nz - c.rAy * c.ny, rtB = c.rBz * -c.nz - c.rBy * c.ny; // tangente = (ny, -nz)
    c.kn = iA + B.invM + IA * rnA * rnA + B.invI * rnB * rnB;
    c.kt = iA + B.invM + IA * rtA * rtA + B.invI * rtB * rtB;
    const [vz, vy] = relativeNormal(c);
    c.vn0 = vz * c.nz + vy * c.ny;
    const bounce = Math.max(A ? A.cfg.bounce : 0, B.cfg.bounce);
    c.target = c.vn0 < -WORLD.bounceMin ? -bounce * c.vn0 : 0;
    c.mu = A ? Math.sqrt(A.cfg.friction * B.cfg.friction) : B.cfg.friction;
    c.Pn = c.Pt = 0;
  }
  for (let it = 0; it < WORLD.iterations; it++) {
    for (const c of contacts) {
      if (c.kn <= 1e-9) continue;
      // Rozamiento (tangente = (ny, -nz)).
      let [vz, vy] = relativeNormal(c);
      const vt = vz * c.ny - vy * c.nz;
      let lt = -vt / c.kt;
      const maxF = c.mu * c.Pn, Pt = Math.max(-maxF, Math.min(maxF, c.Pt + lt));
      lt = Pt - c.Pt; c.Pt = Pt;
      applyImpulse(c, lt * c.ny, -lt * c.nz);
      // Normal (no puede tirar, solo empujar).
      [vz, vy] = relativeNormal(c);
      const vn = vz * c.nz + vy * c.ny;
      let ln = (c.target - vn) / c.kn;
      const Pn = Math.max(0, c.Pn + ln);
      ln = Pn - c.Pn; c.Pn = Pn;
      applyImpulse(c, ln * c.nz, ln * c.ny);
    }
  }
}

// Corrige el solape que quede (solo posición, sin añadir velocidad).
function correctPositions(contacts) {
  for (const c of contacts) {
    const { A, B } = c;
    const iA = A ? A.invM : 0, total = iA + B.invM;
    if (total <= 0) continue;
    const k = Math.max(0, c.pen - WORLD.slop) * WORLD.correction / total;
    B.z += c.nz * k * B.invM; B.y += c.ny * k * B.invM;
    if (A) { A.z -= c.nz * k * iA; A.y -= c.ny * k * iA; }
  }
}

// Muelle amortiguado (aplastamiento).
function spring(s, delta, stiffness, damping) {
  s.v += (-stiffness * s.x - damping * s.v) * delta;
  s.x += s.v * delta;
}

const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------------------

export async function createToys(scenes, { camera, canvas, anisotropy = 1 }) {
  const [teddyModel, sheepModel, pianoModel] = await Promise.all([
    loadModel(TEDDY.url, TEDDY.height, anisotropy),
    loadModel(SHEEP.url, SHEEP.height, anisotropy),
    loadModel(PIANO.url, PIANO.height, anisotropy)
  ]);
  const X = TEDDY.position[0];

  const T = makeBody(TEDDY, silhouette(teddyModel, TEDDY.yaw, WORLD.hullPoints));
  const S = makeBody(SHEEP, silhouette(sheepModel, SHEEP.yaw, WORLD.hullPoints));
  const P = makeBody(PIANO, silhouette(pianoModel, PIANO.yaw, WORLD.hullPoints));
  const bodies = [T, S, P];
  const models = new Map([[T, teddyModel], [S, sheepModel], [P, pianoModel]]);

  // Jerarquía (una copia por escena; comparten geometría y materiales):
  //   outer (centro de masas + giro en pantalla) → inner (desplaza al centro de masas)
  //   → yaw (giro sobre sí mismo) → squash (escala) → modelo
  const rigs = scenes.map((scene, i) => {
    const parts = new Map();
    for (const body of bodies) {
      const outer = new THREE.Group(), inner = new THREE.Group(), yaw = new THREE.Group(), squash = new THREE.Group();
      const model = models.get(body);
      squash.add(i === 0 ? model : model.clone());
      yaw.add(squash); inner.add(yaw); outer.add(inner);
      inner.position.set(0, -body.com[1], -body.com[0]);
      outer.visible = false;
      scene.add(outer);
      parts.set(body, { outer, yaw, squash });
    }
    return parts;
  });
  const main = rigs[0]; // la copia visible: se usa para el clic

  let running = false;
  let sheepTimer = -1, pianoTimer = -1; // s que faltan para soltarlos (-1 = no programado)

  function show(body, visible) {
    body.active = visible;
    for (const r of rigs) r.get(body).outer.visible = visible;
  }

  function apply() {
    for (const body of bodies) {
      const s = 1 - body.squash.x;
      for (const r of rigs) {
        const { outer, yaw, squash } = r.get(body);
        outer.position.set(X, body.y, body.z);
        outer.rotation.x = -body.a; // giro en el plano de la pantalla
        yaw.rotation.y = body.cfg.yaw + body.cfg.spin.y * body.spinK;
        // Aplastar conservando volumen: baja en Y, se ensancha en X/Z.
        squash.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
      }
    }
  }

  // Límite izquierda/derecha visible a la profundidad de los muñecos.
  function wall() {
    const distance = camera.position.x - X;
    return Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance * camera.aspect;
  }

  function launch(body, z, y) {
    const W = wall(), r = body.extent();
    body.place(Math.max(-W + r, Math.min(W - r, z)), y);
    body.a = body.cfg.spin.roll;
    body.intro = true; body.touched = false; body.impacts = 0; body.spinK = 1;
    body.squash.x = body.squash.v = 0;
    show(body, true);
  }

  // ---- Arrastre con el ratón ------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(1, 0, 0), -X); // plano x = X
  const hitPoint = new THREE.Vector3(), localRay = new THREE.Ray(), inverse = new THREE.Matrix4();
  const drag = { body: null, pointerId: null, target: { y: 0, z: 0 }, offset: { y: 0, z: 0 } };

  function setRay(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1, 1 - (event.clientY - bounds.top) / bounds.height * 2);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(pointer, camera);
  }

  // ¿El rayo toca la caja del objeto? (en el espacio local del objeto)
  function hits(object, box) {
    object.updateWorldMatrix(true, false);
    inverse.copy(object.matrixWorld).invert();
    localRay.copy(raycaster.ray).applyMatrix4(inverse);
    return localRay.intersectsBox(box);
  }

  function down(event) {
    if (!running || drag.pointerId !== null || !event.isPrimary || event.button !== 0) return;
    setRay(event);
    // Primero los pequeños: suelen estar encima.
    const body = [S, P, T].find(b => b.active && hits(main.get(b).squash, models.get(b).userData.box));
    if (!body || !raycaster.ray.intersectPlane(plane, hitPoint)) return;
    // Es nuestro: que no llegue al arrastre del tubo.
    event.stopPropagation();
    event.preventDefault();
    body.held = true;
    body.intro = false;
    drag.body = body;
    drag.pointerId = event.pointerId;
    drag.offset.y = body.y - hitPoint.y;
    drag.offset.z = body.z - hitPoint.z;
    drag.target.y = body.y;
    drag.target.z = body.z;
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('grabbing');
  }

  function move(event) {
    if (event.pointerId !== drag.pointerId) return;
    event.stopPropagation();
    setRay(event);
    if (!raycaster.ray.intersectPlane(plane, hitPoint)) return;
    drag.target.y = Math.min(DRAG.maxHeight, hitPoint.y + drag.offset.y);
    drag.target.z = hitPoint.z + drag.offset.z;
  }

  function release(event) {
    if (event && event.pointerId !== drag.pointerId) return;
    const body = drag.body;
    if (body) {
      body.held = false;
      // Lanzamiento con la velocidad que llevaba (limitada).
      const clamp = v => Math.max(-DRAG.maxThrow, Math.min(DRAG.maxThrow, v * DRAG.throwScale));
      body.vz = clamp(body.vz); body.vy = clamp(body.vy);
    }
    const id = drag.pointerId;
    drag.body = null;
    drag.pointerId = null;
    canvas.classList.remove('grabbing');
    if (id !== null && canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
  }

  // En fase de captura sobre el contenedor: llega antes que el arrastre del tubo.
  const host = canvas.parentElement;
  host.addEventListener('pointerdown', down, true);
  host.addEventListener('pointermove', move, true);
  host.addEventListener('pointerup', release, true);
  host.addEventListener('pointercancel', release, true);
  canvas.addEventListener('lostpointercapture', release);
  window.addEventListener('blur', () => release());

  // ---- Simulación -----------------------------------------------------------

  // Un cuerpo agarrado no atraviesa suelo ni paredes.
  function keepInside(body, W) {
    body.refresh();
    let minY = Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [z, y] of body.verts) { minY = Math.min(minY, y); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    if (minY < 0) body.y -= minY;
    if (minZ < -W) body.z += -W - minZ;
    else if (maxZ > W) body.z -= maxZ - W;
  }

  function step(h, W) {
    const active = bodies.filter(b => b.active);
    // Fuerzas.
    for (const b of active) {
      if (b.held) {
        const max = WORLD.maxSpeed;
        b.vz = Math.max(-max, Math.min(max, (drag.target.z - b.z) * DRAG.follow));
        b.vy = Math.max(-max, Math.min(max, (drag.target.y - b.y) * DRAG.follow));
        // Se inclina hacia atrás al moverlo, como un péndulo.
        const lean = Math.max(-DRAG.maxSwing, Math.min(DRAG.maxSwing, -b.vz * DRAG.swing));
        b.w = (lean - b.a) * 10;
      } else {
        b.vy -= WORLD.gravity * h;
        b.a = wrapAngle(b.a);
        b.w += (-b.cfg.upright * b.a - WORLD.angularDamping * b.w) * h;
      }
      b.refresh();
    }
    // Contactos.
    const contacts = [];
    for (const b of active) boundsContacts(b, W, contacts);
    for (let i = 0; i < active.length; i++)
      for (let j = i + 1; j < active.length; j++) polygonContacts(active[i], active[j], contacts);
    solveContacts(contacts);
    // Movimiento.
    for (const b of active) {
      const speed = Math.hypot(b.vz, b.vy);
      if (speed > WORLD.maxSpeed) { b.vz *= WORLD.maxSpeed / speed; b.vy *= WORLD.maxSpeed / speed; }
      b.z += b.vz * h; b.y += b.vy * h; b.a += b.w * h;
    }
    correctPositions(contacts);
    for (const b of active) if (b.held) keepInside(b, W);
    // Golpes: aplastamiento y fin de la caída inicial.
    for (const c of contacts) {
      for (const b of [c.A, c.B]) {
        if (!b) continue;
        b.touched = true;
        if (c.vn0 < -WORLD.bounceMin) {
          b.squash.v += -c.vn0 * b.cfg.squash / Math.max(1, c.A ? 2 : 1);
          if (!c.A) b.impacts++;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------

  return {
    drop() {
      release();
      for (const b of bodies) { b.held = false; show(b, false); }
      launch(T, TEDDY.position[2], TEDDY.startHeight);
      sheepTimer = pianoTimer = -1;
      running = true;
      apply();
    },
    reset() {
      release();
      running = false;
      for (const b of bodies) show(b, false);
    },
    cancelDrag: () => release(),
    get dragging() { return drag.pointerId !== null; },
    update(delta) {
      if (!running || delta <= 0) return;
      delta = Math.min(delta, 1 / 30); // tras un parón, no dar un salto enorme

      // Primer golpe del osito: programa la oveja y el piano.
      if (T.impacts > 0 && sheepTimer < 0 && !S.active) sheepTimer = SHEEP.delay;
      if (T.impacts > 0 && pianoTimer < 0 && !P.active) pianoTimer = PIANO.delay;
      if (sheepTimer >= 0 && (sheepTimer -= delta) < 0) launch(S, T.z, SHEEP.startHeight);
      if (pianoTimer >= 0 && (pianoTimer -= delta) < 0) launch(P, PIANO.position[2], PIANO.startHeight);

      const W = wall(), h = delta / WORLD.substeps;
      for (let i = 0; i < WORLD.substeps; i++) step(h, W);

      for (const b of bodies) {
        if (b.touched || b.held) b.intro = false;
        b.spinK = b.intro
          ? Math.min(1, Math.max(0, (b.y - b.com[1]) / b.cfg.startHeight)) ** 0.7
          : b.spinK * Math.exp(-10 * delta);
        spring(b.squash, delta, 280, 10);
        b.squash.x = Math.max(-0.3, Math.min(0.3, b.squash.x));
      }
      apply();
    }
  };
}
