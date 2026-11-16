import assert from 'node:assert/strict';
import test from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { BoxGeometry, Mesh, SphereGeometry, Vector3 } from 'three';
import { createPhysics } from '../src/physics/world.ts';
import { createPrimitiveColliders } from '../src/physics/colliders.ts';
import { createPlayer } from '../src/player/controller.ts';

const idle = { x: 0, y: 0, z: 0 };
const forward = { x: 4, y: 0, z: 0 };

function addProp(physics, geometry, position) {
  const mesh = new Mesh(geometry);
  mesh.position.copy(position);
  const body = physics.addDynamicBody(mesh, createPrimitiveColliders(geometry));
  return { mesh, body };
}

async function replay(frameTimes) {
  const physics = await createPhysics();
  let player;
  try {
    physics.addFloor(12, 12);
    const sphere = addProp(physics, new SphereGeometry(1), new Vector3(-1.5, 4, 0));
    const box = addProp(physics, new BoxGeometry(1.5, 1.5, 1.5), new Vector3(2, 0.75, 0));
    player = createPlayer(physics.world, new Vector3(-4, 0, 0));
    physics.update(physics.world.timestep);

    let steps = 0;
    let settled = false;
    let rolled = false;
    let contacted = false;
    const bodies = [sphere.body, box.body, player.body];
    const fellOff = bodies.map(() => false);
    for (const delta of frameTimes) {
      physics.update(delta, (step) => {
        bodies.forEach((body, index) => {
          const position = body.translation();
          fellOff[index] ||= position.x > 6 && position.y < 0;
        });
        // Observe the last completed tick, so monitoring also works with substeps.
        if (steps === 90) {
          settled = Math.abs(sphere.body.translation().y - 1) < 0.05
            && Math.abs(sphere.body.linvel().y) < 0.1;
        }
        if (steps >= 90) {
          rolled ||= Math.abs(sphere.body.angvel().z) > 0.1;
          physics.world.contactPair(sphere.body.collider(0), box.body.collider(0), (manifold) => {
            contacted ||= manifold.numSolverContacts() > 0;
          });
        }
        player.update(step, steps++ < 90 ? idle : forward);
      });
      physics.syncMeshes();
    }

    return {
      steps,
      settled,
      rolled,
      contacted,
      fellOff,
      poses: bodies.map((body) => [
        ...Object.values(body.translation()),
        ...Object.values(body.rotation()),
        ...Object.values(body.linvel()),
      ]),
    };
  } finally {
    player?.dispose();
    physics.dispose();
  }
}

test('a complete interaction settles, rolls, transfers contact, and falls off the edge', async () => {
  const result = await replay(Array(8 * 60).fill(1 / 60));
  assert.equal(result.steps, 480);
  assert.ok(result.settled, 'The dropped sphere should settle before player movement');
  assert.ok(result.rolled, 'Player pushing should make the sphere roll');
  assert.ok(result.contacted, 'The sphere should collide with the box');
  for (const [index, pose] of result.poses.entries()) {
    assert.ok(pose.every(Number.isFinite), `Body ${index} has a non-finite transform or velocity`);
    // Props may already have respawned by the final frame.
    assert.ok(result.fellOff[index], `Body ${index} should fall beyond the finite floor edge`);
  }
});

test('the complete interaction matches at 30, 60, 144, 240 Hz and irregular frame times', async () => {
  const schedules = [30, 60, 144, 240].map((rate) => Array(8 * rate).fill(1 / rate));
  // Each cycle lasts 1/15 second; no frame exceeds the catch-up budget.
  schedules.push(Array.from({ length: 120 }, () => [1 / 120, 1 / 30, 1 / 240, 1 / 48]).flat());
  const reference = await replay(schedules[0]);
  for (const schedule of schedules.slice(1)) {
    const result = await replay(schedule);
    assert.equal(result.steps, reference.steps);
    assert.equal(result.settled, reference.settled);
    assert.equal(result.rolled, reference.rolled);
    assert.equal(result.contacted, reference.contacted);
    assert.deepEqual(result.fellOff, reference.fellOff);
    result.poses.forEach((pose, body) => pose.forEach((value, component) => {
      assert.ok(Math.abs(value - reference.poses[body][component]) < 0.00001,
        `Body ${body}, component ${component} diverged across render schedules`);
    }));
  }
});

test('objects can fall from all four edges of a rectangular floor', async () => {
  for (const [axis, sign, edge] of [['x', 1, 4], ['x', -1, 4], ['z', 1, 2], ['z', -1, 2]]) {
    const physics = await createPhysics();
    try {
      physics.addFloor(8, 4);
      const start = new Vector3(0, 0.5, 0);
      start[axis] = sign * (edge - 0.6);
      const { body } = addProp(physics, new SphereGeometry(0.5), start);
      const velocity = { x: 0, y: 0, z: 0 };
      velocity[axis] = sign * 8;
      body.setLinvel(velocity, true);
      for (let tick = 0; tick < 120; tick++) physics.update(1 / 60);
      assert.ok(body.translation()[axis] * sign > edge + 0.5, `${sign > 0 ? '+' : '-'}${axis} edge`);
      assert.ok(body.translation().y < -1);
    } finally {
      physics.dispose();
    }
  }
});

test('a fast sphere does not tunnel through a thin fixed wall', async () => {
  const physics = await createPhysics();
  try {
    physics.world.gravity.y = 0;
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(0.025, 3, 3));
    const { body } = addProp(physics, new SphereGeometry(0.25), new Vector3(-5, 0, 0));
    body.setLinvel({ x: 400, y: 0, z: 0 }, true);
    physics.update(1 / 60);
    assert.ok(body.translation().x < -0.2, 'CCD should stop the sphere on the incoming side');
  } finally {
    physics.dispose();
  }
});

test('pushing a prop against a wall blocks both the prop and the player', async () => {
  const physics = await createPhysics();
  let player;
  try {
    physics.addFloor(100, 100);
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(0.25, 5, 5).setTranslation(4, 5, 0));
    const { body } = addProp(physics, new BoxGeometry(1.5, 6, 2), new Vector3(2.5, 3, 0));
    player = createPlayer(physics.world, new Vector3());
    physics.update(physics.world.timestep);
    for (let tick = 0; tick < 180; tick++) {
      physics.update(1 / 60, (step) => player.update(step, { x: 20, y: 0, z: 0 }));
    }
    assert.ok(body.translation().x > 2.7, 'The box should move until it reaches the wall');
    assert.ok(body.translation().x < 3.05, 'The box should not pass through the wall');
    assert.ok(player.body.translation().x < body.translation().x - 1.2,
      'The player should remain on the near side of the blocked box');
    assert.ok(player.grounded);
  } finally {
    player?.dispose();
    physics.dispose();
  }
});

test('a player push wakes a sleeping prop', async () => {
  const physics = await createPhysics();
  let player;
  try {
    physics.addFloor(100, 100);
    const { body } = addProp(physics, new BoxGeometry(2, 2, 2), new Vector3(3, 1, 0));
    player = createPlayer(physics.world, new Vector3());
    physics.update(physics.world.timestep);
    body.sleep();
    assert.ok(body.isSleeping());
    for (let tick = 0; tick < 30; tick++) {
      physics.update(1 / 60, (step) => player.update(step, { x: 20, y: 0, z: 0 }));
    }
    assert.equal(body.isSleeping(), false);
    assert.ok(body.translation().x > 3.2);
  } finally {
    player?.dispose();
    physics.dispose();
  }
});
