import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from 'three';
import type { World } from '@dimforge/rapier3d-compat';

export function createPhysicsDebug(world: World) {
  const geometry = new BufferGeometry();
  const material = new LineBasicMaterial({ vertexColors: true, depthTest: false });
  const mesh = new LineSegments(geometry, material);
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;

  return {
    mesh,

    update() {
      if (!mesh.visible) return;

      const { vertices, colors } = world.debugRender();
      geometry.setAttribute('position', new BufferAttribute(vertices, 3));
      geometry.setAttribute('color', new BufferAttribute(colors, 4));
    },

    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
