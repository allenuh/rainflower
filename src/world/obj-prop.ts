import RAPIER from '@dimforge/rapier3d-compat';
import {
  Box3,
  Group,
  Mesh,
  MeshPhongMaterial,
  Vector3,
  type ColorRepresentation,
  type LoadingManager,
} from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Physics } from '../physics/world';
import { simplifiedHullPoints, type SimplifiedHullOptions } from '../physics/simplified-hull';
import { disposeObjectResources } from './environment';

export interface ObjPropOptions {
  url: string;
  /** Height in world units; the model is scaled to it. */
  height: number;
  color: ColorRepresentation;
  position: { x: number; z: number };
  /** Turn about the vertical axis, in radians. */
  rotationY: number;
  /**
   * Extra mass just above the model's lowest point, as a multiple of its own,
   * for models that balance on a small spot and would otherwise topple.
   */
  ballastRatio?: number;
  /**
   * Collide as a rough, flat-bottomed hull rather than the hull of every
   * vertex: for detailed meshes whose exact hull rocks between tiny facets.
   */
  simplifiedCollider?: SimplifiedHullOptions;
}

/**
 * A dynamic prop loaded from an OBJ file: Phong shaded, its origin at the
 * base of its bounding box, colliding as the convex hull of its vertices (or
 * a simplified one).
 * Resolves to undefined if its world was unloaded while it loaded.
 */
export async function createObjProp(
  physics: Physics,
  { url, height, color, position, rotationY, ballastRatio, simplifiedCollider }: ObjPropOptions,
  manager?: LoadingManager,
) {
  const model = await new OBJLoader(manager).loadAsync(url);
  // A request can finish after its world has been unloaded, even after abort.
  if (physics.disposed) {
    disposeObjectResources(model);
    return undefined;
  }
  const material = new MeshPhongMaterial({ color, specular: 0xffffff, shininess: 100 });

  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const oldMaterials = Array.isArray(object.material) ? object.material : [object.material];
    oldMaterials.forEach((oldMaterial) => oldMaterial.dispose());
    object.material = material;
    object.castShadow = true;
    object.receiveShadow = true;
    // Scans like the Stanford bunny ship without normals. The loader gives
    // every triangle its own corners, so join shared corners first: then
    // normals average across neighbouring triangles and the surface shades
    // smoothly instead of faceted.
    if (!object.geometry.getAttribute('normal')) {
      const merged = mergeVertices(object.geometry);
      merged.computeVertexNormals();
      object.geometry.dispose();
      object.geometry = merged;
    }
  });

  // Scale to size, center it horizontally and rest it on the floor.
  const bounds = new Box3().setFromObject(model);
  model.scale.setScalar(height / bounds.getSize(new Vector3()).y);
  bounds.setFromObject(model);
  const center = bounds.getCenter(new Vector3());
  model.position.set(-center.x, -bounds.min.y, -center.z);
  model.updateMatrix();

  // The collider is the hull of every vertex, placed as the model is. Note
  // the lowest vertex, which the model stands on.
  const points: number[] = [];
  const vertex = new Vector3();
  const lowest = new Vector3(0, Infinity, 0);
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) {
      vertex.fromBufferAttribute(positions, index).applyMatrix4(model.matrix);
      points.push(vertex.x, vertex.y, vertex.z);
      if (vertex.y < lowest.y) lowest.copy(vertex);
    }
  });
  const hullPoints = simplifiedCollider
    ? simplifiedHullPoints(points, simplifiedCollider)
    : new Float32Array(points);
  const hull = RAPIER.ColliderDesc.convexHull(hullPoints);
  if (!hull) throw new Error(`Could not create a convex hull for ${url}`);

  const prop = new Group();
  prop.add(model);
  prop.position.set(position.x, 0, position.z);
  prop.rotation.y = rotationY;
  const body = physics.addDynamicBody(prop, [hull]);
  if (ballastRatio) {
    // Pull the center of mass down over the lowest point, like a weighted bust.
    body.recomputeMassPropertiesFromColliders();
    body.setAdditionalMassProperties(
      body.mass() * ballastRatio,
      { x: lowest.x, y: lowest.y + 0.3, z: lowest.z },
      { x: 0.05, y: 0.05, z: 0.05 },
      { x: 0, y: 0, z: 0, w: 1 },
      true,
    );
  }
  return prop;
}
