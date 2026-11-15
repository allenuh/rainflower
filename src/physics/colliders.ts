import RAPIER from '@dimforge/rapier3d-compat';
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from 'three';

export function createPrimitiveColliders(geometry: BufferGeometry): RAPIER.ColliderDesc[] {
  if (geometry instanceof SphereGeometry) {
    return [RAPIER.ColliderDesc.ball(geometry.parameters.radius)];
  }

  if (geometry instanceof BoxGeometry) {
    const { width, height, depth } = geometry.parameters;
    return [RAPIER.ColliderDesc.cuboid(width / 2, height / 2, depth / 2)];
  }

  if (geometry instanceof ConeGeometry) {
    const { height, radius } = geometry.parameters;
    return [RAPIER.ColliderDesc.cone(height / 2, radius)];
  }

  if (geometry instanceof CylinderGeometry) {
    const { height, radiusTop, radiusBottom } = geometry.parameters;
    if (radiusTop === radiusBottom) {
      return [RAPIER.ColliderDesc.cylinder(height / 2, radiusTop)];
    }
  }

  if (geometry instanceof OctahedronGeometry || geometry instanceof CylinderGeometry) {
    const points = new Float32Array(geometry.getAttribute('position').array);
    const collider = RAPIER.ColliderDesc.convexHull(points);
    if (!collider) throw new Error(`Could not create a convex hull for ${geometry.type}`);
    return [collider];
  }

  if (geometry instanceof TorusGeometry) {
    // A ring of capsules preserves the opening instead of filling it with a hull.
    const { radius, tube } = geometry.parameters;
    const segments = 16;
    const halfAngle = Math.PI / segments;
    const centerRadius = radius * Math.cos(halfAngle);
    const halfLength = radius * Math.sin(halfAngle);

    return Array.from({ length: segments }, (_, index) => {
      const angle = index * Math.PI * 2 / segments;
      return RAPIER.ColliderDesc.capsule(halfLength, tube)
        .setTranslation(centerRadius * Math.cos(angle), centerRadius * Math.sin(angle), 0)
        .setRotation({ x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) });
    });
  }

  throw new Error(`Unsupported primitive collider: ${geometry.type}`);
}
