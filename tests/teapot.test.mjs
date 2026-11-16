import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { Box3, Group, Matrix4, Mesh, SphereGeometry, Vector3 } from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { createPhysics } from '../src/physics/world.ts';
import { createTeapotColliders } from '../src/physics/teapot.ts';
import { createPlayer } from '../src/player/controller.ts';

function createModelFixture() {
  const modelUrl = new URL('../src/assets/models/utah-teapot.obj', import.meta.url);
  const model = new OBJLoader().parse(readFileSync(modelUrl, 'utf8'));
  model.rotation.x = -Math.PI / 2;
  const bounds = new Box3().setFromObject(model);
  model.scale.setScalar(4.5 / bounds.getSize(new Vector3()).y);
  bounds.setFromObject(model);
  const center = bounds.getCenter(new Vector3());
  model.position.set(-center.x, -bounds.min.y, -center.z);
  model.updateMatrix();
  const teapot = new Group();
  teapot.add(model);
  teapot.rotation.y = Math.PI / 6;
  return { model, teapot };
}

function simulate(physics, seconds) {
  for (let step = 0; step < seconds * 60; step++) physics.update(1 / 60);
  physics.syncMeshes();
}

test('teapot collision parts cover the features while preserving the handle hole', async () => {
  const physics = await createPhysics();
  try {
    const body = physics.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    for (const collider of createTeapotColliders(new Matrix4())) {
      physics.world.createCollider(collider, body);
    }
    physics.update(1 / 60);
    for (const [x, z, expectedHit] of [
      [-2.4, 1.6, false], // Handle opening.
      [-2.4, 2.15, true], // Handle rim.
      [0, 1.2, true], // Body.
      [0, 2.9, true], // Lid knob.
      [2.7, 1.9, true], // Spout.
    ]) {
      const ray = new RAPIER.Ray({ x, y: -5, z }, { x: 0, y: 1, z: 0 });
      assert.equal(Boolean(physics.world.castRay(ray, 10, true)), expectedHit);
    }
  } finally {
    physics.dispose();
  }
});

test('the rotated and scaled teapot falls and settles with its mesh on the floor', async () => {
  const physics = await createPhysics();
  try {
    physics.addFloor(100, 100);
    const { model, teapot } = createModelFixture();
    teapot.position.set(-7, 8, -6);
    const body = physics.addDynamicBody(teapot, createTeapotColliders(model.matrix));
    assert.ok(body.isDynamic());
    simulate(physics, 0.5);
    assert.ok(teapot.position.y < 7);
    simulate(physics, 5);
    const visualBounds = new Box3().setFromObject(teapot, true);
    assert.ok(Math.abs(visualBounds.min.y) < 0.1, `Visual base: ${visualBounds.min.y}`);
    assert.ok(Math.abs(body.linvel().y) < 0.1);
    assert.ok(teapot.position.distanceTo(body.translation()) < 0.001);
  } finally {
    physics.dispose();
  }
});

test('a moving sphere transfers momentum to the teapot', async () => {
  const physics = await createPhysics();
  try {
    // Isolate object-to-object response from floor friction and gravity.
    physics.world.gravity.y = 0;
    const { model, teapot } = createModelFixture();
    teapot.position.y = 4;
    const body = physics.addDynamicBody(teapot, createTeapotColliders(model.matrix));
    const sphere = new Mesh(new SphereGeometry(1));
    sphere.position.set(-8, 6, 0);
    const ball = physics.addDynamicBody(sphere, [RAPIER.ColliderDesc.ball(1)]);
    ball.setLinvel({ x: 10, y: 0, z: 0 }, true);
    simulate(physics, 2);
    assert.ok(teapot.position.x > 0.05, `Teapot displacement: ${teapot.position.x}`);
    assert.ok(body.linvel().x > 0.05);
  } finally {
    physics.dispose();
  }
});

test('the player pushes the teapot without launching its compound body', async () => {
  const physics = await createPhysics();
  let player;
  try {
    physics.addFloor(100, 100);
    const { model, teapot } = createModelFixture();
    teapot.position.x = 6;
    const body = physics.addDynamicBody(teapot, createTeapotColliders(model.matrix));
    player = createPlayer(physics.world, new Vector3());
    physics.update(physics.world.timestep);
    let maxSpeed = 0;
    let maxUpwardVelocity = 0;
    const initialCenterHeight = body.worldCom().y;
    let maxCenterHeight = initialCenterHeight;
    for (let step = 0; step < 120; step++) {
      physics.update(1 / 60, (delta) => player.update(delta, { x: 20, y: 0, z: 0 }));
      const velocity = body.linvel();
      maxSpeed = Math.max(maxSpeed, Math.hypot(velocity.x, velocity.z));
      maxUpwardVelocity = Math.max(maxUpwardVelocity, velocity.y);
      maxCenterHeight = Math.max(maxCenterHeight, body.worldCom().y);
    }
    assert.ok(body.translation().x > 6.1);
    // Angled contacts can redirect uncapped pushes slightly above walking speed.
    assert.ok(maxSpeed < 25, `Peak horizontal speed: ${maxSpeed}`);
    // Fast uncapped shoves can tip the teapot and redirect motion upwards at contacts.
    assert.ok(maxUpwardVelocity < 10, `Peak upward velocity: ${maxUpwardVelocity}`);
    // Light props can ride up the capsule, but should not launch far above it.
    const capsuleHeight = 2 * (player.collider.halfHeight() + player.collider.radius());
    assert.ok(maxCenterHeight < initialCenterHeight + capsuleHeight,
      `Peak center height: ${maxCenterHeight}`);
  } finally {
    player?.dispose();
    physics.dispose();
  }
});
