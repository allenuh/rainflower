import assert from 'node:assert/strict';
import test from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { Box3, BoxGeometry, Group, Mesh, PerspectiveCamera, TorusGeometry, Vector3 } from 'three';
import { createPhysics } from '../src/physics/world.ts';
import { createPrimitiveColliders } from '../src/physics/colliders.ts';
import { createPlayer } from '../src/player/controller.ts';
import { createPropInteraction } from '../src/player/prop-interaction.ts';

async function createFixture() {
  const physics = await createPhysics();
  physics.world.gravity.y = 0;
  physics.addFloor(100, 100);
  const player = createPlayer(physics.world, new Vector3(0, 0, 10));
  const camera = new PerspectiveCamera(75, 1, 0.1, 1000);
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 5, 0);
  const interaction = createPropInteraction(physics, player.body);
  return {
    physics, player, camera, interaction,
    addProp(geometry = new BoxGeometry(2, 2, 2), position = new Vector3(0, 5, 4)) {
      const mesh = new Mesh(geometry);
      mesh.position.copy(position);
      const body = physics.addDynamicBody(mesh, createPrimitiveColliders(geometry));
      physics.update(physics.world.timestep);
      physics.syncMeshes();
      return { mesh, body };
    },
    advance(seconds) {
      for (let frame = 0; frame < Math.round(seconds * 60); frame++) {
        interaction.update(camera);
        physics.syncMeshes();
      }
    },
    pickUp() {
      interaction.pressE(camera);
      assert.ok(interaction.holding);
      physics.syncMeshes();
    },
    dispose() {
      player.dispose();
      physics.dispose();
    },
  };
}

test('E picks up instantly and the next E press drops the prop', async () => {
  const f = await createFixture();
  try {
    const { body } = f.addProp();
    f.pickUp();
    assert.ok(body.isKinematic());
    assert.equal(body.collider(0).isEnabled(), false);
    f.advance(0.5);
    assert.ok(f.interaction.holding);
    f.interaction.pressE(f.camera);
    assert.equal(f.interaction.holding, false);
    assert.ok(body.isDynamic());
    assert.ok(body.collider(0).isEnabled());
    assert.equal(new Vector3().copy(body.linvel()).length(), 0);
    f.advance(1);
    assert.equal(f.interaction.holding, false);
    f.physics.world.gravity.y = -9.81;
    f.physics.update(1 / 60);
    assert.ok(body.linvel().y < 0);
  } finally { f.dispose(); }
});

test('a held prop follows camera position and rotation without falling', async () => {
  const f = await createFixture();
  try {
    const { mesh, body } = f.addProp();
    f.pickUp();
    f.physics.world.gravity.y = -9.81;
    const initialRotation = mesh.quaternion.clone();
    f.camera.position.set(3, 7, 6);
    f.camera.lookAt(-7, 7, 6);
    f.advance(1 / 60);
    const offset = mesh.position.clone().sub(f.camera.position);
    assert.ok(Math.abs(offset.length() - 4) < 0.00001);
    assert.ok(offset.normalize().dot(f.camera.getWorldDirection(new Vector3())) > 0.99999);
    assert.ok(initialRotation.angleTo(mesh.quaternion) > 0.5);
    const heldPosition = new Vector3().copy(body.translation());
    for (let tick = 0; tick < 60; tick++) f.physics.update(1 / 60);
    assert.ok(heldPosition.distanceTo(body.translation()) < 0.00001);
  } finally { f.dispose(); }
});

test('ground, out-of-range props, and props behind walls cannot be picked up', async () => {
  const f = await createFixture();
  try {
    const { body } = f.addProp();
    f.camera.lookAt(0, -10, 10);
    f.interaction.pressE(f.camera);
    f.advance(1);
    assert.equal(f.interaction.holding, false);
    f.camera.lookAt(0, 5, 0);
    body.setTranslation({ x: 0, y: 5, z: -10 }, true);
    f.physics.update(1 / 60);
    f.interaction.pressE(f.camera);
    f.advance(1);
    assert.equal(f.interaction.holding, false);
    body.setTranslation({ x: 0, y: 5, z: 4 }, true);
    f.physics.world.createCollider(RAPIER.ColliderDesc.cuboid(3, 5, 0.25).setTranslation(0, 5, 7));
    f.physics.update(1 / 60);
    f.interaction.pressE(f.camera);
    f.advance(1);
    assert.equal(f.interaction.holding, false);
  } finally { f.dispose(); }
});

test('compound props restore every collider and their physical properties on release', async () => {
  const f = await createFixture();
  try {
    const { body } = f.addProp(new TorusGeometry(2, 0.625));
    f.camera.lookAt(2, 5, 4); // Aim at the tube instead of through the opening.
    const mass = body.mass();
    f.pickUp();
    assert.equal(body.numColliders(), 16);
    for (let i = 0; i < body.numColliders(); i++) assert.equal(body.collider(i).isEnabled(), false);
    f.interaction.pressE(f.camera);
    assert.equal(f.interaction.holding, false);
    f.physics.update(1 / 60);
    assert.ok(body.isDynamic());
    assert.equal(body.gravityScale(), 2);
    assert.ok(Math.abs(body.mass() - mass) < 0.00001);
    for (let i = 0; i < body.numColliders(); i++) assert.ok(body.collider(i).isEnabled());
  } finally { f.dispose(); }
});

test('throwing uses the current aim and does not automatically reacquire the prop', async () => {
  const f = await createFixture();
  try {
    const { body } = f.addProp();
    f.pickUp();
    f.camera.lookAt(10, 8, 8);
    const expected = f.camera.getWorldDirection(new Vector3()).multiplyScalar(42);
    assert.ok(f.interaction.throwHeld(f.camera));
    assert.ok(new Vector3().copy(body.linvel()).distanceTo(expected) < 0.00001);
    assert.ok(body.isDynamic() && body.collider(0).isEnabled());
    f.advance(1);
    assert.equal(f.interaction.holding, false);
    assert.equal(f.interaction.throwHeld(f.camera), false);
  } finally { f.dispose(); }
});

test('drop restores collisions at the held position without repositioning the prop', async () => {
  const f = await createFixture();
  try {
    const { body } = f.addProp();
    f.pickUp();
    f.camera.lookAt(0, -10, 10);
    f.advance(1 / 60);
    const position = new Vector3().copy(body.translation());
    f.interaction.pressE(f.camera);
    assert.equal(f.interaction.holding, false);
    assert.ok(body.collider(0).isEnabled());
    assert.ok(position.distanceTo(body.translation()) < 0.00001);
  } finally { f.dispose(); }
});

test('pressing E without a target does not defer pickup until a target appears', async () => {
  const f = await createFixture();
  try {
    const { body } = f.addProp();
    f.camera.lookAt(0, 5, 20);
    f.interaction.pressE(f.camera);
    assert.equal(f.interaction.holding, false);
    f.camera.lookAt(0, 5, 0);
    f.advance(1);
    assert.equal(f.interaction.holding, false);
    f.pickUp();
    assert.ok(body.isKinematic());
  } finally { f.dispose(); }
});

test('held props are exempt from fallen-prop respawning', async () => {
  const f = await createFixture();
  try {
    const { body } = f.addProp();
    f.pickUp();
    f.camera.position.y = -200;
    f.camera.lookAt(0, -200, 0);
    f.advance(1 / 60);
    for (let tick = 0; tick < 120; tick++) f.physics.update(1 / 60);
    assert.ok(f.interaction.holding);
    assert.ok(body.translation().y < -100);
  } finally { f.dispose(); }
});

test('off-center model groups are held by their visible center', async () => {
  const f = await createFixture();
  try {
    const group = new Group();
    const mesh = new Mesh(new BoxGeometry(2, 2, 2));
    mesh.position.y = 1.5;
    group.add(mesh);
    group.position.set(0, 3.5, 4);
    const body = f.physics.addDynamicBody(group, [
      RAPIER.ColliderDesc.cuboid(1, 1, 1).setTranslation(0, 1.5, 0),
    ]);
    f.physics.update(1 / 60);
    f.pickUp();
    const center = new Box3().setFromObject(group, true).getCenter(new Vector3());
    assert.ok(center.distanceTo(new Vector3(0, 5, 6)) < 0.00001);
    assert.ok(Math.abs(body.translation().y - 3.5) < 0.00001);
  } finally { f.dispose(); }
});
