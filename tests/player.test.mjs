import assert from 'node:assert/strict';
import test from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3 } from 'three';
import { createPhysics } from '../src/physics/world.ts';
import { createPlayer, playerEyeHeight } from '../src/player/controller.ts';

const idle = { x: 0, y: 0, z: 0 };

async function createFixture(spawn = new Vector3()) {
  const physics = await createPhysics();
  physics.addFloor(100, 100);
  const player = createPlayer(physics.world, spawn);
  physics.update(physics.world.timestep);
  return {
    physics,
    player,
    advance(seconds, velocity = idle, frameRate = 60) {
      for (let frame = 0; frame < seconds * frameRate; frame++) {
        physics.update(1 / frameRate, (step) => player.update(step, velocity));
      }
    },
    dispose() {
      player.dispose();
      physics.dispose();
    },
  };
}

test('an idle capsule stays grounded and preserves the camera eye height', async () => {
  const fixture = await createFixture();
  try {
    fixture.advance(3);
    const eye = fixture.player.copyCameraPosition(new Vector3(), 1);
    assert.ok(fixture.player.grounded);
    assert.ok(Math.abs(eye.y - playerEyeHeight) < 0.05, `Eye height: ${eye.y}`);
    assert.ok(Math.abs(eye.x) < 0.001 && Math.abs(eye.z) < 0.001);
  } finally {
    fixture.dispose();
  }
});

test('gravity moves the capsule without input and grounding stops its fall', async () => {
  const fixture = await createFixture(new Vector3(0, 8, 0));
  try {
    const initialY = fixture.player.body.translation().y;
    fixture.advance(0.5);
    assert.ok(fixture.player.body.translation().y < initialY - 1);
    assert.equal(fixture.player.grounded, false);
    fixture.advance(3);
    assert.ok(fixture.player.grounded);
    const landedY = fixture.player.body.translation().y;
    fixture.advance(1);
    assert.ok(Math.abs(fixture.player.body.translation().y - landedY) < 0.001);
  } finally {
    fixture.dispose();
  }
});

test('a wall blocks forward movement while allowing movement along its surface', async () => {
  const fixture = await createFixture();
  try {
    fixture.physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.5, 5, 20).setTranslation(3, 5, 0),
    );
    fixture.advance(1, { x: 20, y: 0, z: 0 });
    assert.ok(fixture.player.body.translation().x < 2.01);
    assert.ok(fixture.player.body.translation().x > 1.8);
    fixture.advance(1, { x: 8, y: 0, z: 4 });
    const position = fixture.player.body.translation();
    assert.ok(position.x < 2.01);
    assert.ok(position.z > 3.8);
    assert.ok(fixture.player.grounded);
  } finally {
    fixture.dispose();
  }
});

test('walking into a dynamic prop pushes it without passing through it', async () => {
  const fixture = await createFixture();
  try {
    const body = fixture.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(4, 3, 0),
    );
    fixture.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(1, 3, 2), body);
    fixture.advance(1, { x: 20, y: 0, z: 0 });
    assert.ok(body.translation().x > 4.2, `Prop position: ${body.translation().x}`);
    assert.ok(fixture.player.body.translation().x < body.translation().x - 1.45);
    assert.ok(body.linvel().x < 20.5);
  } finally {
    fixture.dispose();
  }
});

test('walking beyond the finite floor makes the capsule fall', async () => {
  const fixture = await createFixture(new Vector3(48, 0, 0));
  try {
    fixture.advance(1, { x: 20, y: 0, z: 0 });
    const eye = fixture.player.copyCameraPosition(new Vector3(), 1);
    assert.ok(eye.x > 60);
    assert.ok(eye.y < playerEyeHeight - 2);
    assert.equal(fixture.player.grounded, false);
  } finally {
    fixture.dispose();
  }
});

test('holding one direction keeps the player moving after dropping onto a large floor', async () => {
  const physics = await createPhysics();
  physics.addFloor(1000, 1000, -2.5);
  physics.addFloor(200, 100, 0, 2.5);
  const player = createPlayer(physics.world, new Vector3(0, 0, 10), { stepHeight: 2.6 });
  try {
    physics.update(1 / 60);
    const velocity = { x: 20, y: 0, z: 0 };
    let stalledFrames = 0;
    for (let frame = 0; frame < 1200; frame++) {
      const previousX = player.body.translation().x;
      physics.update(1 / 60, (step) => player.update(step, velocity));
      const x = player.body.translation().x;
      stalledFrames = x - previousX < 0.03 ? stalledFrames + 1 : 0;
      assert.ok(stalledFrames < 4, `Held movement stalled at x=${x}`);
    }
    const position = player.body.translation();
    assert.ok(player.grounded);
    assert.ok(Math.abs(position.y - 0.25) < 0.08, `Capsule center height: ${position.y}`);
  } finally {
    player.dispose();
    physics.dispose();
  }
});

test('the capsule can walk up a gentle slope', async () => {
  const fixture = await createFixture();
  try {
    const angle = Math.PI / 6;
    fixture.physics.world.createCollider(
      RAPIER.ColliderDesc.cuboid(4, 0.25, 3)
        .setTranslation(6, 1.5, 0)
        .setRotation({ x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) }),
    );
    fixture.advance(2.5, { x: 3, y: 0, z: 0 });
    const eye = fixture.player.copyCameraPosition(new Vector3(), 1);
    assert.ok(eye.x > 6);
    assert.ok(eye.y > playerEyeHeight + 1);
    assert.ok(fixture.player.grounded);
  } finally {
    fixture.dispose();
  }
});

test('player movement remains consistent across render rates', async () => {
  const positions = [];
  for (const frameRate of [30, 60, 144, 240]) {
    const fixture = await createFixture();
    try {
      fixture.advance(1, { x: 20, y: 0, z: 0 }, frameRate);
      positions.push(new Vector3().copy(fixture.player.body.translation()));
    } finally {
      fixture.dispose();
    }
  }
  for (const position of positions) assert.ok(position.distanceTo(positions[0]) < 0.00001);
});

test('camera position interpolates between capsule poses and resets cleanly', async () => {
  const fixture = await createFixture();
  try {
    const initialPosition = new Vector3().copy(fixture.player.body.translation());
    fixture.physics.update(1 / 60, (step) => fixture.player.update(step, { x: 6, y: 0, z: 0 }));
    fixture.physics.update(1 / 120);
    const eye = fixture.player.copyCameraPosition(new Vector3(), fixture.physics.interpolationAlpha);
    const currentPosition = fixture.player.body.translation();
    assert.ok(Math.abs(eye.x - (initialPosition.x + currentPosition.x) / 2) < 0.00001);
    fixture.physics.reset();
    fixture.player.resetInterpolation();
    fixture.player.copyCameraPosition(eye, fixture.physics.interpolationAlpha);
    assert.ok(Math.abs(eye.x - currentPosition.x) < 0.00001);
  } finally {
    fixture.dispose();
  }
});

test('light props can approach walking speed without an upward kick', async () => {
  const fixture = await createFixture();
  try {
    const body = fixture.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(3, 0.5, 0).setCcdEnabled(true),
    );
    fixture.physics.world.createCollider(
      RAPIER.ColliderDesc.ball(0.5).setMass(0.1).setFriction(0.6).setRestitution(0.05), body,
    );
    let maxSpeed = 0;
    let maxHeight = 0;
    for (let frame = 0; frame < 180; frame++) {
      fixture.advance(1 / 60, { x: 20, y: 0, z: 0 });
      const velocity = body.linvel();
      maxSpeed = Math.max(maxSpeed, Math.hypot(velocity.x, velocity.z));
      maxHeight = Math.max(maxHeight, body.translation().y);
    }
    assert.ok(body.translation().x > 5);
    assert.ok(maxSpeed > 4, 'The former push-speed cap should not apply');
    assert.ok(maxSpeed < 20.5, `Peak speed: ${maxSpeed}`);
    assert.ok(maxHeight < 0.7, `Peak height: ${maxHeight}`);
    assert.ok(Math.abs(body.angvel().z) > 0.1, 'The sphere should roll');
  } finally {
    fixture.dispose();
  }
});

test('a compound prop shares one push budget instead of multiplying it per collider', async () => {
  const fixture = await createFixture();
  try {
    fixture.physics.world.gravity.y = 0;
    const body = fixture.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(1.1, 3, 0),
    );
    for (let index = 0; index < 16; index++) {
      fixture.physics.world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.5, 0.2, 1)
          .setTranslation(0, -2.8 + index * 0.36, 0).setMass(10), body,
      );
    }
    fixture.physics.update(1 / 60);
    fixture.player.update(1 / 60, { x: 20, y: 0, z: 0 });
    const momentum = body.mass() * body.linvel().x;
    assert.ok(momentum > 0);
    assert.ok(momentum <= 16.001, `Push impulse: ${momentum}`);
    assert.equal(body.linvel().y, 0);
  } finally {
    fixture.dispose();
  }
});

test('pushing leaves a faster-moving prop free to keep its existing momentum', async () => {
  const fixture = await createFixture();
  try {
    fixture.physics.world.gravity.y = 0;
    const body = fixture.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(3, 3, 0),
    );
    fixture.physics.world.createCollider(RAPIER.ColliderDesc.ball(0.5), body);
    body.setLinvel({ x: 24, y: 0, z: 0 }, true);
    fixture.advance(1, { x: 20, y: 0, z: 0 });
    assert.ok(Math.abs(body.linvel().x - 24) < 0.001);
  } finally {
    fixture.dispose();
  }
});

test('standing still on a dynamic platform does not shove it sideways', async () => {
  const fixture = await createFixture(new Vector3(0, 2, 0));
  try {
    const platform = fixture.physics.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 1, 0),
    );
    fixture.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(3, 1, 3), platform);
    fixture.physics.update(1 / 60);
    fixture.advance(3);
    assert.ok(fixture.player.grounded);
    const position = platform.translation();
    assert.ok(Math.hypot(position.x, position.z) < 0.01);
  } finally {
    fixture.dispose();
  }
});

test('pushing remains consistent across render rates', async () => {
  const positions = [];
  for (const frameRate of [30, 60, 144, 240]) {
    const fixture = await createFixture();
    try {
      const body = fixture.physics.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(4, 3, 0),
      );
      fixture.physics.world.createCollider(
        RAPIER.ColliderDesc.cuboid(1, 3, 2).setFriction(0.6), body,
      );
      fixture.advance(2, { x: 20, y: 0, z: 0 }, frameRate);
      positions.push(new Vector3().copy(body.translation()));
    } finally {
      fixture.dispose();
    }
  }
  for (const position of positions) assert.ok(position.distanceTo(positions[0]) < 0.00001);
});

test('heavier props resist the same player push more than lighter props', async () => {
  const distances = [];
  for (const mass of [48, 1000]) {
    const fixture = await createFixture();
    try {
      const body = fixture.physics.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(4, 3, 0),
      );
      fixture.physics.world.createCollider(
        RAPIER.ColliderDesc.cuboid(1, 3, 2).setMass(mass).setFriction(0.6), body,
      );
      fixture.advance(2, { x: 20, y: 0, z: 0 });
      distances.push(body.translation().x - 4);
    } finally {
      fixture.dispose();
    }
  }
  assert.ok(distances[0] > 0.2);
  assert.ok(distances[1] < distances[0] * 0.5);
});
