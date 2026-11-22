import RAPIER from '@dimforge/rapier3d-compat';
import { Box3, Group, Mesh, MeshPhongMaterial, Vector3, type LoadingManager } from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import suzanneUrl from '../assets/models/suzanne.obj?url';
import type { Physics } from '../physics/world';
import { disposeObjectResources } from './environment';

/** Suzanne's height in world units, from her chin to the top of her head. */
export const suzanneHeight = 3;
// Weight added just above her chin, as a multiple of her own, to keep her upright.
const ballastRatio = 4;

/**
 * Blender's monkey head, as a dynamic prop. Her origin is at the base of her
 * bounding box, and she collides as a convex hull of her vertices.
 */
export async function createSuzanne(physics: Physics, manager?: LoadingManager) {
  const model = await new OBJLoader(manager).loadAsync(suzanneUrl);
  // A request can finish after its world has been unloaded, even after abort.
  if (physics.disposed) {
    disposeObjectResources(model);
    return;
  }
  const material = new MeshPhongMaterial({
    color: 0xb8b8b8,
    specular: 0xffffff,
    shininess: 100,
  });

  const points: number[] = [];
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const oldMaterials = Array.isArray(object.material) ? object.material : [object.material];
    oldMaterials.forEach((oldMaterial) => oldMaterial.dispose());
    object.material = material;
    object.castShadow = true;
    object.receiveShadow = true;
  });

  // Scale to size, center her horizontally and rest her chin on the floor.
  const bounds = new Box3().setFromObject(model);
  model.scale.setScalar(suzanneHeight / bounds.getSize(new Vector3()).y);
  bounds.setFromObject(model);
  const center = bounds.getCenter(new Vector3());
  model.position.set(-center.x, -bounds.min.y, -center.z);
  model.updateMatrix();

  // The collider is the hull of every vertex, placed as the model is. Note
  // her chin, the lowest vertex, which she stands on.
  const vertex = new Vector3();
  const chin = new Vector3(0, Infinity, 0);
  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const positions = object.geometry.getAttribute('position');
    for (let index = 0; index < positions.count; index++) {
      vertex.fromBufferAttribute(positions, index).applyMatrix4(model.matrix);
      points.push(vertex.x, vertex.y, vertex.z);
      if (vertex.y < chin.y) chin.copy(vertex);
    }
  });
  const hull = RAPIER.ColliderDesc.convexHull(new Float32Array(points));
  if (!hull) throw new Error('Could not create a convex hull for Suzanne');

  const suzanne = new Group();
  suzanne.add(model);
  // Left of the spawn point, clear of the teapot, turned to face the spawn.
  suzanne.position.set(-11, 0, 3);
  suzanne.rotation.y = Math.atan2(11, 7);
  const body = physics.addDynamicBody(suzanne, [hull]);
  // She balances on her chin, a small spot under a big head, so on her own she
  // topples over. Extra mass just above her chin pulls her center of mass down
  // over it, like a weighted bust: she rocks when knocked but settles upright.
  body.recomputeMassPropertiesFromColliders();
  body.setAdditionalMassProperties(
    body.mass() * ballastRatio,
    { x: chin.x, y: chin.y + 0.3, z: chin.z },
    { x: 0.05, y: 0.05, z: 0.05 },
    { x: 0, y: 0, z: 0, w: 1 },
    true,
  );
  return suzanne;
}
