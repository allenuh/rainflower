import assert from 'node:assert/strict';
import test from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { BoxGeometry, Euler, Matrix4, Mesh, PerspectiveCamera, Quaternion, Scene, Vector3 } from 'three';
import { createPhysics } from '../src/physics/world.ts';
import { createPlayer } from '../src/player/controller.ts';
import { createPropInteraction } from '../src/player/prop-interaction.ts';
import { createPortalEndpoint, getPortalTransform, traversePortal } from '../src/portals/portal.ts';
import { createPortalCrossingDetector } from '../src/portals/crossing.ts';

function assertVector(actual, expected, tolerance = 0.00001) {
  assert.ok(actual.distanceTo(expected) < tolerance,
    `Expected ${expected.toArray()}, got ${actual.toArray()}`);
}

async function fixture({ feetY = 0, wall = false, startZ = -0.25 } = {}) {
  const physics1 = await createPhysics();
  const physics2 = await createPhysics();
  physics1.addFloor(100, 100);
  physics2.addFloor(100, 100);
  if (wall) {
    physics2.world.createCollider(RAPIER.ColliderDesc.cuboid(0.1, 5, 10).setTranslation(8, 5, 7));
  }
  const world1 = { scene: new Scene(), physics: physics1, update() {} };
  const world2 = { scene: new Scene(), physics: physics2, update() {}, stepHeight: 2.6 };
  const a = createPortalEndpoint(world1, 8, 8);
  const b = createPortalEndpoint(world2, 8, 8);
  a.anchor.position.set(0, 4, 0);
  b.anchor.position.set(10, 4, 7);
  b.anchor.rotation.y = -Math.PI / 2;
  const player = createPlayer(physics1.world, new Vector3(0, feetY, startZ));
  for (const physics of [physics1, physics2]) {
    physics.update(physics.world.timestep);
    physics.reset();
  }
  const camera = new PerspectiveCamera(75, 16 / 9, 0.1, 1000);
  player.copyCameraPosition(camera.position, 1);
  const velocity = new Vector3(0, 0, -20);

  return {
    a, b, player, camera, velocity, world1, world2,
    dispose() {
      player.dispose();
      physics1.dispose();
      physics2.dispose();
    },
  };
}

test('traversal preserves portal-relative position, aim, movement speed, and resets interpolation', async () => {
  const { a, b, player, camera, velocity, world1, world2, dispose } = await fixture();
  try {
    camera.quaternion.setFromEuler(new Euler(-0.35, 0.6, 0, 'YXZ'));
    velocity.set(4, 0, -8);
    const body = player.body;
    const collider = player.collider;
    const beforePosition = new Vector3().copy(body.translation());
    const beforeAim = camera.quaternion.clone();
    const transform = getPortalTransform(a, b, new Matrix4());
    const rotation = new Quaternion().setFromRotationMatrix(transform);
    const expectedPosition = beforePosition.clone().applyMatrix4(transform);
    const expectedAim = rotation.clone().multiply(beforeAim);
    const sourceBodies = world1.physics.world.bodies.len();
    const destinationBodies = world2.physics.world.bodies.len();

    traversePortal(a, b, player, camera, velocity);

    assertVector(new Vector3().copy(player.body.translation()), expectedPosition);
    assert.ok(Math.abs(player.body.translation().x - 9.75) < 0.00001, 'Preserve overshoot beyond the exit');
    assert.ok(1 - Math.abs(camera.quaternion.dot(expectedAim)) < 1e-12);
    assertVector(velocity, new Vector3(-8, 0, -4));
    assert.ok(Math.abs(velocity.length() - Math.hypot(4, 8)) < 1e-9);
    assert.equal(camera.fov, 75);
    assert.equal(camera.aspect, 16 / 9);
    assert.equal(body.isValid(), false);
    assert.equal(collider.isValid(), false);
    assert.equal(player.body.isValid(), true);
    assert.equal(player.collider.parent().handle, player.body.handle);
    assert.equal(world1.physics.world.bodies.len(), sourceBodies - 1);
    assert.equal(world2.physics.world.bodies.len(), destinationBodies + 1);
    for (const alpha of [0, 0.5, 1]) {
      assertVector(player.copyCameraPosition(new Vector3(), alpha), camera.position);
    }

    const destinationBody = player.body;
    traversePortal(b, a, player, camera, velocity);
    assertVector(new Vector3().copy(player.body.translation()), beforePosition);
    assert.ok(1 - Math.abs(camera.quaternion.dot(beforeAim)) < 1e-12);
    assertVector(velocity, new Vector3(4, 0, -8));
    assert.equal(destinationBody.isValid(), false);
    assert.equal(world1.physics.world.bodies.len(), sourceBodies);
    assert.equal(world2.physics.world.bodies.len(), destinationBodies);
  } finally {
    dispose();
  }
});

test('the transferred controller immediately walks on destination ground and stops at its wall', async () => {
  const { a, b, player, camera, velocity, world2, dispose } = await fixture({ wall: true });
  try {
    traversePortal(a, b, player, camera, velocity);
    for (let index = 0; index < 60; index++) {
      world2.physics.update(1 / 60, (step) => player.update(step, velocity));
    }
    const position = player.body.translation();
    assert.ok(position.x > 8.5 && position.x < 9, `Destination wall should stop the capsule: ${position.x}`);
    assert.ok(position.y > 2.7 && position.y < 2.9);
    assert.ok(Math.abs(position.z - 7) < 0.1);
    assert.equal(player.grounded, true);
  } finally {
    dispose();
  }
});

test('transferring between worlds preserves integrated falling speed', async () => {
  const { a, b, player, camera, velocity, world1, world2, dispose } = await fixture({ feetY: 10 });
  try {
    const idle = new Vector3();
    let lastDelta = 0;
    for (let index = 0; index < 20; index++) {
      const beforeY = player.body.translation().y;
      world1.physics.update(1 / 60, (step) => player.update(step, idle));
      lastDelta = player.body.translation().y - beforeY;
    }
    assert.ok(lastDelta < -0.05);
    traversePortal(a, b, player, camera, velocity);
    const arrivalY = player.body.translation().y;
    world2.physics.update(1 / 60, (step) => player.update(step, idle));
    const expectedDelta = lastDelta + world2.physics.world.gravity.y / (60 * 60);
    assert.ok(Math.abs(player.body.translation().y - arrivalY - expectedDelta) < 0.00001);
    assert.equal(player.grounded, false);
  } finally {
    dispose();
  }
});

test('a crossing interrupts source catch-up and hands the remaining time to the destination', async () => {
  const { a, b, player, camera, velocity, world1, world2, dispose } = await fixture({ startZ: 0.1 });
  try {
    const detector = createPortalCrossingDetector({ a, b });
    detector.reset(world1, player.body.translation());
    let crossing;
    let callbacks = 0;
    const sourceSteps = world1.physics.update(0.05, (step) => player.update(step, velocity), () => {
      callbacks++;
      crossing = detector.update(world1, player.body.translation());
      if (crossing) return false;
    });
    assert.equal(sourceSteps, 1);
    assert.equal(callbacks, 1);
    assert.ok(crossing);
    const remaining = world1.physics.reset();
    assert.ok(Math.abs(remaining - 2 / 60) < 1e-9);
    traversePortal(crossing.source, crossing.destination, player, camera, velocity);
    world2.physics.reset();
    const arrival = new Vector3().copy(player.body.translation());
    detector.reset(world2, arrival);
    const destinationSteps = world2.physics.update(remaining, (step) => player.update(step, velocity), () => {
      assert.equal(detector.update(world2, player.body.translation()), undefined);
    });
    assert.equal(destinationSteps, 2);
    assert.ok(player.body.translation().x < arrival.x - 0.5);
    assert.ok(world1.physics.interpolationAlpha < 1e-9);
  } finally {
    dispose();
  }
});

test('a held prop is released into the source world before the player is transferred', async () => {
  const { a, b, player, camera, velocity, world1, world2, dispose } = await fixture();
  try {
    const box = new Mesh(new BoxGeometry(1, 1, 1));
    box.position.copy(camera.position).add(new Vector3(0, 0, -5));
    world1.scene.add(box);
    const prop = world1.physics.addDynamicBody(box, [RAPIER.ColliderDesc.cuboid(0.5, 0.5, 0.5)]);
    world1.physics.update(world1.physics.world.timestep);
    const interaction = createPropInteraction(world1.physics, player.body);
    interaction.pressE(camera);
    assert.equal(interaction.holding, true);
    assert.equal(prop.isKinematic(), true);
    assert.equal(interaction.dropHeld(camera), true);
    traversePortal(a, b, player, camera, velocity);
    const destinationInteraction = createPropInteraction(world2.physics, player.body);
    destinationInteraction.pressE(camera);
    assert.equal(destinationInteraction.holding, false);
    assert.equal(interaction.holding, false);
    assert.equal(prop.isDynamic(), true);
    assert.equal(prop.collider(0).isEnabled(), true);
    assert.equal(world1.physics.findProp(prop.handle).body, prop);
  } finally {
    dispose();
  }
});
