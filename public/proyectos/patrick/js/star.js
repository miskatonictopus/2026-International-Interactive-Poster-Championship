import * as THREE from 'three';

// KayKit agrupa estrella y bombillas en la misma primitiva emisiva.
// Extraer sus triángulos permite raycasting preciso y brillo independiente.
export function extractTreeStar(model) {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const cutoff = bounds.min.y + (bounds.max.y - bounds.min.y) * 0.87;
  const candidates = [];
  model.traverse((node) => {
    if (node.isMesh && !Array.isArray(node.material) && node.material.emissiveMap) candidates.push(node);
  });
  const point = new THREE.Vector3();
  for (const node of candidates) {
    const source = node.geometry;
    const positions = source.getAttribute('position');
    const starIndices = [];
    const rest = [];
    const count = source.index ? source.index.count : positions.count;
    for (let i = 0; i < count; i += 3) {
      const triangle = [0, 1, 2].map((j) => source.index ? source.index.getX(i + j) : i + j);
      const isStar = triangle.every((index) => {
        point.fromBufferAttribute(positions, index).applyMatrix4(node.matrixWorld);
        return point.y >= cutoff;
      });
      (isStar ? starIndices : rest).push(...triangle);
    }
    if (!starIndices.length) continue;
    const vertices = [...new Set(starIndices)];
    const remap = new Map(vertices.map((original, index) => [original, index]));
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) {
      const values = new Float32Array(vertices.length * attribute.itemSize);
      for (let i = 0; i < vertices.length; i++) for (let c = 0; c < attribute.itemSize; c++) {
        values[i * attribute.itemSize + c] = attribute.getComponent(vertices[i], c);
      }
      geometry.setAttribute(name, new THREE.BufferAttribute(values, attribute.itemSize));
    }
    geometry.setIndex(starIndices.map((index) => remap.get(index)));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    source.setIndex(rest);
    const star = new THREE.Mesh(geometry, node.material.clone());
    star.name = 'interactive-christmas-star';
    star.userData.baseEmissiveIntensity = star.material.emissiveIntensity;
    node.add(star); // Misma transformación que los triángulos originales.
    return star;
  }
  throw new Error('No se pudieron identificar los triángulos de la estrella KayKit.');
}
