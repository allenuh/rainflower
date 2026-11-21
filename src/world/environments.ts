import { createPhysics } from '../physics/world';
import { createPortalEndpoint, type PortalPair } from '../portals/portal';
import { createPortalReveal } from '../portals/lifecycle';
import { createWorld1 } from './world-1';
import { createWorld2 } from './world-2';
import { createEnvironment } from './environment';

export type { Environment } from './environment';

export async function createEnvironments() {
  const physics1 = await createPhysics();
  const physics2 = await createPhysics();
  const checkerboard = createWorld1(physics1);
  const sunset = createWorld2(physics2);

  const world1 = createEnvironment(checkerboard.scene, physics1, {
    observe(camera) {
      checkerboard.observe(camera);
      reveal.observe(camera);
    },
    afterRender() {
      checkerboard.afterRender();
      // Once world 1's props are all gone, open the portal while unseen.
      reveal.afterRender(checkerboard.sequenceComplete);
    },
    dispose: checkerboard.dispose,
  });
  const world2 = createEnvironment(sunset.scene, physics2, {
    update: sunset.updateWater,
    stepHeight: sunset.stepHeight + 0.1,
  });

  const a = createPortalEndpoint(world1, 8, 8);
  a.anchor.name = 'world-1-portal';
  a.anchor.position.set(0, 4, -12);

  const b = createPortalEndpoint(world2, 8, 8);
  b.anchor.name = 'world-2-portal';
  b.anchor.position.set(0, 4, 0);
  b.anchor.rotation.y = Math.PI;

  const portalPair: PortalPair = { a, b };
  // World 2 is loaded (and pre-warmed) up front, but unreachable until revealed.
  a.hide();
  b.hide();
  const reveal = createPortalReveal(portalPair, a);

  return {
    world1,
    world2,
    portalPair,
    world1AssetsReady: checkerboard.ready,
    respawnSphere: checkerboard.respawnSphere,
  };
}
