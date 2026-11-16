import { readFileSync, writeFileSync } from 'node:fs';
import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3 } from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';

// Bake collision geometry once, keeping decomposition out of browser startup.
const modelUrl = new URL('../src/assets/models/utah-teapot.obj', import.meta.url);
const outputUrl = new URL('../src/assets/models/utah-teapot.colliders.json', import.meta.url);
const model = new OBJLoader().parse(readFileSync(modelUrl, 'utf8'));
const vertices = [];
const indices = [];
const uniqueVertices = new Map();

model.updateMatrixWorld(true);
model.traverse((object) => {
  if (!object.isMesh) return;
  const positions = object.geometry.getAttribute('position');
  const index = object.geometry.index;
  const count = index ? index.count : positions.count;
  const point = new Vector3();

  for (let triangleVertex = 0; triangleVertex < count; triangleVertex++) {
    const vertex = index ? index.getX(triangleVertex) : triangleVertex;
    point.fromBufferAttribute(positions, vertex).applyMatrix4(object.matrixWorld);
    const key = point.toArray().map((value) => Math.round(value * 100000)).join(',');
    let id = uniqueVertices.get(key);
    if (id === undefined) {
      id = vertices.length / 3;
      uniqueVertices.set(key, id);
      vertices.push(point.x, point.y, point.z);
    }
    indices.push(id);
  }
});

await RAPIER.init();
const collider = RAPIER.ColliderDesc.convexDecomposition(
  new Float32Array(vertices),
  new Uint32Array(indices),
  { resolution: 64, maxConvexHulls: 24, concavity: 0.005 },
);
if (!collider || !(collider.shape instanceof RAPIER.Compound)) {
  throw new Error('Teapot convex decomposition failed');
}

const parts = collider.shape.shapes.map((shape, index) => {
  if (!(shape instanceof RAPIER.ConvexPolyhedron)) {
    throw new Error('Expected convex polyhedron collision parts');
  }
  const translation = collider.shape.positions[index];
  const rotation = new Quaternion().copy(collider.shape.rotations[index]);
  const points = [];
  const point = new Vector3();
  for (let vertex = 0; vertex < shape.vertices.length; vertex += 3) {
    point.fromArray(shape.vertices, vertex).applyQuaternion(rotation).add(translation);
    points.push(...point.toArray().map((value) => Number(value.toFixed(6))));
  }
  return points;
});

writeFileSync(outputUrl, JSON.stringify(parts) + '\n');
console.log(`Baked ${parts.length} convex teapot collision parts.`);
