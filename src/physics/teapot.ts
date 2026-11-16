import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3, type Matrix4 } from 'three';
import parts from '../assets/models/utah-teapot.colliders.json' with { type: 'json' };

export function createTeapotColliders(modelMatrix: Matrix4) {
  const point = new Vector3();
  const shapes = parts.map((part) => {
    const vertices = new Float32Array(part.length);
    for (let index = 0; index < part.length; index += 3) {
      point.fromArray(part, index).applyMatrix4(modelMatrix).toArray(vertices, index);
    }

    const collider = RAPIER.ColliderDesc.convexHull(vertices);
    if (!collider) throw new Error('Could not create a teapot collision part');
    return collider.shape;
  });

  // Treat shared part boundaries as internal, avoiding catches on decomposition seams.
  return [new RAPIER.ColliderDesc(new RAPIER.Compound(
    shapes,
    shapes.map(() => ({ x: 0, y: 0, z: 0 })),
    shapes.map(() => ({ x: 0, y: 0, z: 0, w: 1 })),
    RAPIER.CompoundFlags.FIX_INTERNAL_EDGES,
  ))];
}
