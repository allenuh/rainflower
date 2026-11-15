import assert from 'node:assert/strict';
import test from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPhysics } from '../src/physics/world.ts';

test('partial frames accumulate and reset discards leftover time', async () => {
  const physics = await createPhysics();
  try {
    assert.equal(physics.update(1 / 120), 0);
    assert.equal(physics.update(1 / 120), 1);
    assert.equal(physics.update(1 / 120), 0);
    physics.reset();
    assert.equal(physics.update(1 / 120), 0);
  } finally {
    physics.dispose();
  }
});

test('free fall produces the same simulation at different render rates', async () => {
  const heights = [];
  for (const frameRate of [30, 60, 144, 240]) {
    const physics = await createPhysics();
    try {
      const body = physics.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 10, 0),
      );
      physics.world.createCollider(RAPIER.ColliderDesc.ball(0.5), body);
      let steps = 0;
      for (let frame = 0; frame < frameRate; frame++) {
        steps += physics.update(1 / frameRate);
      }
      assert.equal(steps, 60);
      assert.ok(body.translation().y < 10);
      heights.push(body.translation().y);
    } finally {
      physics.dispose();
    }
  }
  for (const height of heights) assert.ok(Math.abs(height - heights[0]) < 0.00001);
});

test('a long stall has bounded catch-up and no remaining backlog', async () => {
  const physics = await createPhysics();
  try {
    assert.equal(physics.update(60), 5);
    assert.equal(physics.update(1 / 120), 0);
    assert.equal(physics.update(1 / 120), 1);
    for (const delta of [0, -1, NaN, Infinity]) assert.equal(physics.update(delta), 0);
  } finally {
    physics.dispose();
  }
});
