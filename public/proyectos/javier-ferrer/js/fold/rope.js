import * as THREE from 'three';
import { ClothSimulation } from './cloth-simulation.js';

// Tubo de caramelo. Reutiliza la simulación XPBD como una cinta estrecha de
// dos columnas (del ancho del tubo) y dibuja un tubo alrededor de su eje
// central. La dirección de la cinta orienta el tubo, así las rayas giran con él.
// Mantiene la misma interfaz que FallingSheet (simulation, mesh, geometry,
// createMesh, update) para que main.js y cloth-drag.js funcionen igual.
export const TUBE_DIAMETER = 0.5;
export const FILL_LENGTH = 120;

export class CandyTube {
  constructor(material) {
    this.simulation = new ClothSimulation({
      columns: 1,
      width: TUBE_DIAMETER,
      depthHalfExtent: 1.2,
      sway: 3.8,
      maxRows: 420, // ~210 m de tubo: suficiente para llenar el cartel
      accumulate: true
    });
    const sim = this.simulation;
    this.subdivisions = 6; // anillos por fila de partículas
    this.rings = (sim.maxRows - 1) * this.subdivisions + 1;
    this.segments = 28; // vértices por anillo (+1 duplicado en la costura)
    const perRing = this.segments + 1;
    const vertexCount = this.rings * perRing;

    const uv = new Float32Array(vertexCount * 2);
    for (let ring = 0; ring < this.rings; ring++) {
      for (let s = 0; s <= this.segments; s++) {
        const i = ring * perRing + s;
        uv[i * 2] = s / this.segments;
        uv[i * 2 + 1] = 1 - ring / (this.rings - 1);
      }
    }
    const indices = [];
    for (let ring = 0; ring < this.rings - 1; ring++) {
      for (let s = 0; s < this.segments; s++) {
        const a = ring * perRing + s, b = a + perRing;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    this.geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geometry.setAttribute('emissionTime', new THREE.BufferAttribute(new Float32Array(vertexCount), 1));
    this.geometry.setAttribute('clothVisibility', new THREE.BufferAttribute(new Float32Array(vertexCount), 1));
    this.geometry.setIndex(indices);
    this.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    this.geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);

    this.centers = new Float64Array(this.rings * 3);
    this.across = new Float64Array(this.rings * 3);
    this.meshes = [];
    this.mesh = this.createMesh(material);
    this.update(0);
  }

  // Progreso de llenado de 0 a 1: metros de tubo dentro / FILL_LENGTH.
  // FILL_LENGTH ≈ metros que caben en el cartel (medido: ~120 m).
  get fillProgress() {
    const sim = this.simulation;
    if (sim.full) return 1;
    return Math.min(1, sim.activeRows * sim.spacing / FILL_LENGTH);
  }

  createMesh(material) {
    const mesh = new THREE.Mesh(this.geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = this.simulation.activeRows >= 2;
    this.meshes.push(mesh);
    return mesh;
  }

  update(delta, settings = {}) {
    const radius = (settings.thickness ?? TUBE_DIAMETER) * 0.5;
    const sim = this.simulation;
    sim.advance(delta, settings);
    for (const mesh of this.meshes) mesh.visible = sim.activeRows >= 2;
    if (sim.activeRows < 2) {
      this.geometry.setDrawRange(0, 0);
      return;
    }
    // Solo se dibujan los anillos que cubren las filas activas.
    const usedRings = (sim.activeRows - 1) * this.subdivisions + 1;
    this.geometry.setDrawRange(0, (usedRings - 1) * this.segments * 6);

    const sample = (row, col, axis) => sim.positions[(Math.max(0, Math.min(sim.activeRows - 1, row)) * sim.stride + col) * 3 + axis];
    const interpolate = (row, col, axis, t) => {
      const a = sample(row - 1, col, axis), b = sample(row, col, axis);
      const c = sample(row + 1, col, axis), d = sample(row + 2, col, axis);
      return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
    };

    const emission = this.geometry.attributes.emissionTime;
    const visibility = this.geometry.attributes.clothVisibility;
    const perRing = this.segments + 1;
    const C = this.centers, A = this.across;
    for (let ring = 0; ring < usedRings; ring++) {
      const sourceRow = ring / this.subdivisions;
      const r = Math.floor(sourceRow), t = sourceRow - r;
      for (let axis = 0; axis < 3; axis++) {
        const p0 = interpolate(r, 0, axis, t), p1 = interpolate(r, 1, axis, t);
        C[ring * 3 + axis] = (p0 + p1) * 0.5;
        A[ring * 3 + axis] = p1 - p0;
      }
      // En el tubo, el atributo 'emissionTime' guarda la posición a lo largo
      // del material en metros (fija para cada trozo de tubo), así las rayas
      // no dependen de la velocidad de entrada.
      const birth = (sim.emittedRows - sourceRow) * sim.spacing;
      const fade = sim.visibilityAt(sourceRow);
      for (let s = 0; s <= this.segments; s++) {
        emission.setX(ring * perRing + s, birth);
        visibility.setX(ring * perRing + s, fade);
      }
    }

    const positions = this.geometry.attributes.position.array;
    const normals = this.geometry.attributes.normal.array;
    const T = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), prevN = new THREE.Vector3(1, 0, 0);
    for (let ring = 0; ring < usedRings; ring++) {
      const a = Math.max(0, ring - 1), b = Math.min(usedRings - 1, ring + 1);
      T.set(C[b * 3] - C[a * 3], C[b * 3 + 1] - C[a * 3 + 1], C[b * 3 + 2] - C[a * 3 + 2]);
      if (T.lengthSq() < 1e-12) T.set(0, -1, 0);
      T.normalize();
      // Normal de referencia: la dirección transversal de la cinta, hecha
      // perpendicular a la tangente. Si degenera, se mantiene la anterior.
      N.set(A[ring * 3], A[ring * 3 + 1], A[ring * 3 + 2]);
      N.addScaledVector(T, -N.dot(T));
      if (N.lengthSq() < 1e-8) {
        N.copy(prevN).addScaledVector(T, -prevN.dot(T));
        if (N.lengthSq() < 1e-8) N.set(1, 0, 0).addScaledVector(T, -T.x);
      }
      N.normalize();
      prevN.copy(N);
      B.crossVectors(T, N);
      // Punta redondeada al final del tubo (semiesfera aproximada).
      const fromEnd = (usedRings - 1 - ring) * sim.spacing / this.subdivisions;
      const k = fromEnd < radius ? (radius - fromEnd) / radius : 0; // 0 cuerpo → 1 punta
      const ringRadius = radius * Math.sqrt(1 - k * k);
      for (let s = 0; s <= this.segments; s++) {
        const angle = s / this.segments * Math.PI * 2;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const rx = N.x * cos + B.x * sin, ry = N.y * cos + B.y * sin, rz = N.z * cos + B.z * sin;
        const i = (ring * perRing + s) * 3;
        const sk = Math.sqrt(1 - k * k);
        normals[i] = rx * sk + T.x * k; normals[i + 1] = ry * sk + T.y * k; normals[i + 2] = rz * sk + T.z * k;
        positions[i] = C[ring * 3] + rx * ringRadius;
        positions[i + 1] = C[ring * 3 + 1] + ry * ringRadius;
        positions[i + 2] = C[ring * 3 + 2] + rz * ringRadius;
      }
    }
    // El raycast del arrastre usa uv.y para localizar la fila: se escala a
    // las filas activas, igual que la malla de la tela original.
    const uv = this.geometry.attributes.uv;
    for (let ring = 0; ring < usedRings; ring++) {
      const v = 1 - ring / (usedRings - 1);
      for (let s = 0; s <= this.segments; s++) uv.setY(ring * perRing + s, v);
    }
    uv.needsUpdate = true;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.normal.needsUpdate = true;
    emission.needsUpdate = true;
    visibility.needsUpdate = true;
  }
}
