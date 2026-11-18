import type { Scene } from 'three';
import { createPhysics, type Physics } from '../physics/world';
import { createPortalEndpoint, type PortalPair } from '../portals/portal';
import { createWorld1 } from './world-1';
import { createWorld2 } from './world-2';

export interface Environment {
  scene: Scene;
  physics: Physics;
  update: (deltaSeconds: number) => void;
  stepHeight?: number;
}

export async function createEnvironments() {
  const physics1 = await createPhysics();
  const physics2 = await createPhysics();
  const checkerboard = createWorld1(physics1);
  const sunset = createWorld2(physics2);

  const world1: Environment = {
    scene: checkerboard.scene,
    physics: physics1,
    update: () => {},
  };
  const world2: Environment = {
    scene: sunset.scene,
    physics: physics2,
    update: sunset.updateWater,
    stepHeight: sunset.stepHeight + 0.1,
  };

  const a = createPortalEndpoint(world1, 8, 8);
  a.anchor.name = 'world-1-portal';
  a.anchor.position.set(0, 4, -12);

  const b = createPortalEndpoint(world2, 8, 8);
  b.anchor.name = 'world-2-portal';
  b.anchor.position.set(0, 4, 0);
  b.anchor.rotation.y = Math.PI;

  const portalPair: PortalPair = { a, b };
  return { world1, world2, portalPair };
}
