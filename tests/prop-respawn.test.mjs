import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Mesh, Quaternion, SphereGeometry, Vector3 } from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPhysics } from '../src/physics/world.ts';
import { createPrimitiveColliders } from '../src/physics/colliders.ts';

function addProp(physics, geometry, position) {
  const mesh = new Mesh(geometry);
  mesh.position.copy(position);
  mesh.rotation.y = Math.PI / 6;
  return { mesh, body: physics.addDynamicBody(mesh, createPrimitiveColliders(geometry)) };
}

test('a fallen prop respawns at the center with its original orientation and cleared motion', async () => {
  const physics = await createPhysics();
  try {
    const { mesh, body } = addProp(physics, new BoxGeometry(2, 2, 2), new Vector3(70, -101, 30));
    const originalRotation = mesh.quaternion.clone();
    body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    body.setLinvel({ x: 10, y: -30, z: 5 }, true);
    body.setAngvel({ x: 4, y: 2, z: 3 }, true);
    physics.update(1 / 60);
    assert.deepEqual({ ...body.translation() }, { x: 0, y: 40, z: 0 });
    assert.equal(new Vector3().copy(body.linvel()).length(), 0);
    assert.equal(new Vector3().copy(body.angvel()).length(), 0);
    assert.ok(new Quaternion().copy(body.rotation()).angleTo(originalRotation) < 0.00001);
    physics.syncMeshes();
    assert.ok(mesh.position.distanceTo(new Vector3(0, 40, 0)) < 0.00001,
      'Interpolation should snap to the respawn point');
    physics.update(1 / 60);
    assert.ok(body.translation().y < 40);
    assert.ok(body.linvel().y < 0);
  } finally {
    physics.dispose();
  }
});

test('multiple fallen props use the shared drop point without spawning on top of each other', async () => {
  const physics = await createPhysics();
  try {
    const first = addProp(physics, new SphereGeometry(3.125), new Vector3(60, -101, 0));
    const second = addProp(physics, new SphereGeometry(3.125), new Vector3(-60, -101, 0));
    physics.update(1 / 60);
    assert.equal(first.body.translation().y, 40);
    assert.ok(second.body.translation().y < -100);
    let secondRespawned = false;
    for (let tick = 0; tick < 120; tick++) {
      physics.update(1 / 60);
      if (second.body.translation().y === 40) {
        secondRespawned = true;
        const separation = new Vector3().copy(first.body.translation()).distanceTo(second.body.translation());
        assert.ok(separation > 6.25, 'The spheres must not overlap when the second respawns');
        break;
      }
    }
    assert.ok(secondRespawned);
  } finally {
    physics.dispose();
  }
});

test('respawned props drop back onto the floor and settle', async () => {
  const physics = await createPhysics();
  try {
    physics.addFloor(100, 100);
    const { body } = addProp(physics, new SphereGeometry(1), new Vector3(60, -101, 0));
    for (let tick = 0; tick < 600; tick++) physics.update(1 / 60);
    assert.ok(Math.abs(body.translation().x) < 0.01);
    assert.ok(Math.abs(body.translation().z) < 0.01);
    assert.ok(Math.abs(body.translation().y - 1) < 0.05);
    assert.ok(Math.abs(body.linvel().y) < 0.05);
  } finally {
    physics.dispose();
  }
});


test('respawn listeners hear fallen props and forced respawns, but not held props', async () => {
  const physics = await createPhysics();
  try {
    const fallen = addProp(physics, new SphereGeometry(1), new Vector3(60, -101, 0));
    const held = addProp(physics, new SphereGeometry(1), new Vector3(-20, 5, 0));
    const heard = [];
    const unsubscribe = physics.onRespawn((mesh) => heard.push(mesh));
    physics.update(1 / 60);
    assert.deepEqual(heard, [fallen.mesh]);

    assert.equal(physics.respawn(fallen.mesh), true);
    assert.deepEqual({ ...fallen.body.translation() }, { x: 0, y: 40, z: 0 });
    assert.deepEqual(heard, [fallen.mesh, fallen.mesh]);

    held.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    assert.equal(physics.respawn(held.mesh), false);
    assert.equal(heard.length, 2);

    unsubscribe();
    physics.respawn(fallen.mesh);
    assert.equal(heard.length, 2);
  } finally {
    physics.dispose();
  }
});
