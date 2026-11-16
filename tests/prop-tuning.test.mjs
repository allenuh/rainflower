import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Mesh, SphereGeometry, Vector3 } from 'three';
import { createPhysics } from '../src/physics/world.ts';
import { createPrimitiveColliders } from '../src/physics/colliders.ts';
import { createPlayer } from '../src/player/controller.ts';

function addProp(physics, geometry, position) {
  const mesh = new Mesh(geometry);
  mesh.position.copy(position);
  mesh.rotation.y = Math.PI / 6;
  return { mesh, body: physics.addDynamicBody(mesh, createPrimitiveColliders(geometry)) };
}

test('a scene-sized cube is easy to push without the former speed cap', async () => {
  const physics = await createPhysics();
  let player;
  try {
    physics.addFloor(100, 100);
    const { body } = addProp(physics, new BoxGeometry(4.5, 4.5, 4.5), new Vector3(5, 2.25, 0));
    player = createPlayer(physics.world, new Vector3());
    physics.update(physics.world.timestep);
    let maxSpeed = 0;
    for (let tick = 0; tick < 120; tick++) {
      physics.update(1 / 60, (step) => player.update(step, { x: 20, y: 0, z: 0 }));
      const velocity = body.linvel();
      maxSpeed = Math.max(maxSpeed, Math.hypot(velocity.x, velocity.z));
    }
    assert.ok(body.translation().x > 6, `Cube position: ${body.translation().x}`);
    assert.ok(maxSpeed > 4);
    assert.ok(maxSpeed < 20.5);
  } finally {
    player?.dispose();
    physics.dispose();
  }
});

test('props fall more strongly while player gravity stays unchanged', async () => {
  const physics = await createPhysics();
  let player;
  try {
    const { body } = addProp(physics, new SphereGeometry(1), new Vector3(10, 10, 0));
    player = createPlayer(physics.world, new Vector3(0, 10, 0));
    physics.update(physics.world.timestep);
    const propStart = body.translation().y;
    const playerStart = player.body.translation().y;
    for (let tick = 0; tick < 30; tick++) {
      physics.update(1 / 60, (step) => player.update(step, { x: 0, y: 0, z: 0 }));
    }
    const playerDrop = playerStart - player.body.translation().y;
    assert.ok(Math.abs(playerDrop - 1.267125) < 0.01);
    assert.ok(propStart - body.translation().y > playerDrop * 1.5);
  } finally {
    player?.dispose();
    physics.dispose();
  }
});
