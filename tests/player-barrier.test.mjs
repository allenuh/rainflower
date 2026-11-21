import assert from 'node:assert/strict';
import test from 'node:test';
import { SphereGeometry, Mesh, Vector3 } from 'three';
import { createPhysics } from '../src/physics/world.ts';
import { createPrimitiveColliders } from '../src/physics/colliders.ts';
import { createPlayer } from '../src/player/controller.ts';

const capsuleRadius = 0.5;
const edgeTolerance = 0.1;

async function createFixture({ spawn = new Vector3(), center } = {}) {
  const physics = await createPhysics();
  physics.addFloor(100, 100);
  physics.addPlayerBounds(100, 100, center ? { center } : undefined);
  const player = createPlayer(physics.world, spawn);
  physics.update(physics.world.timestep);
  return {
    physics,
    player,
    walk(seconds, velocity) {
      for (let frame = 0; frame < seconds * 60; frame++) {
        physics.update(1 / 60, (step) => player.update(step, velocity));
      }
    },
    dispose() {
      player.dispose();
      physics.dispose();
    },
  };
}

for (const [axis, sign] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
  test(`the player is stopped at the ${sign > 0 ? '+' : '-'}${axis.toUpperCase()} edge and stays on the floor`, async () => {
    const fixture = await createFixture();
    try {
      const velocity = { x: 0, y: 0, z: 0 };
      velocity[axis] = 20 * sign;
      // 4 s at 20 u/s would carry the player 80 units, well past the edge.
      fixture.walk(4, velocity);
      const position = fixture.player.body.translation();
      assert.ok(position[axis] * sign <= 50 - capsuleRadius + edgeTolerance,
        `Stopped at ${axis} = ${position[axis]}`);
      assert.ok(position[axis] * sign > 50 - capsuleRadius - 1, 'Reaches the edge');
      assert.ok(fixture.player.grounded);
      assert.ok(position.y > 0);
    } finally {
      fixture.dispose();
    }
  });
}

test('props pass through the player barrier and fall off the edge', async () => {
  const fixture = await createFixture();
  try {
    const mesh = new Mesh(new SphereGeometry(1));
    mesh.position.set(45, 1, 0);
    const body = fixture.physics.addDynamicBody(mesh, createPrimitiveColliders(mesh.geometry));
    body.setLinvel({ x: 42, y: 0, z: 0 }, true);
    for (let frame = 0; frame < 60; frame++) fixture.physics.update(1 / 60);
    assert.ok(body.translation().x > 51, `Prop x: ${body.translation().x}`);
    assert.ok(body.translation().y < 0, `Prop y: ${body.translation().y}`);
  } finally {
    fixture.dispose();
  }
});

test('bounds follow an off-origin center', async () => {
  const center = { x: 30, z: 0 };
  const fixture = await createFixture({ spawn: new Vector3(30, 0, 0), center });
  try {
    fixture.walk(3, { x: -20, y: 0, z: 0 });
    const x = fixture.player.body.translation().x;
    // The shifted floor spans x -20..80; the default floor ends at -50.
    assert.ok(x >= -20 + capsuleRadius - edgeTolerance, `Stopped at x = ${x}`);
    assert.ok(x < -20 + capsuleRadius + 1);
  } finally {
    fixture.dispose();
  }
});
