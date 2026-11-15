import assert from 'node:assert/strict';
import test from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh,
  OctahedronGeometry, Quaternion, SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import { createPhysics } from '../src/physics/world.ts';
import { createPrimitiveColliders } from '../src/physics/colliders.ts';

function addProp(physics, geometry, position) {
  const mesh = new Mesh(geometry);
  mesh.position.copy(position);
  const body = physics.addDynamicBody(mesh, createPrimitiveColliders(geometry));
  return { mesh, body };
}

function simulate(physics, seconds) {
  for (let step = 0; step < seconds * 60; step++) physics.update(1 / 60);
  physics.syncMeshes();
}

test('every primitive gets a dynamic body and suspended shapes fall', async () => {
  const physics = await createPhysics();
  try {
    physics.addFloor(100, 100);
    const geometries = [
      new SphereGeometry(1), new BoxGeometry(2, 2, 2),
      new ConeGeometry(1, 2), new CylinderGeometry(1, 1, 2),
      new OctahedronGeometry(1), new TorusGeometry(2, 0.5),
    ];
    const props = geometries.map((geometry, index) =>
      addProp(physics, geometry, new Vector3(index * 6 - 15, 8, 0)));
    for (const { body } of props) assert.ok(body.isDynamic());
    simulate(physics, 0.5);
    for (const { mesh, body } of props) {
      assert.ok(body.translation().y < 7);
      assert.ok(mesh.position.y < 7);
      assert.ok(body.mass() > 0);
    }
  } finally {
    physics.dispose();
  }
});

test('a dropped sphere settles on the floor with little bounce', async () => {
  const physics = await createPhysics();
  try {
    physics.addFloor(100, 100);
    const { body } = addProp(physics, new SphereGeometry(1), new Vector3(0, 6, 0));
    simulate(physics, 5);
    assert.ok(Math.abs(body.translation().y - 1) < 0.05);
    assert.ok(Math.abs(body.linvel().y) < 0.05);
  } finally {
    physics.dispose();
  }
});

test('friction makes a moving sphere roll', async () => {
  const physics = await createPhysics();
  try {
    physics.addFloor(100, 100);
    const { body } = addProp(physics, new SphereGeometry(1), new Vector3(0, 1, 0));
    body.setLinvel({ x: 6, y: 0, z: 0 }, true);
    simulate(physics, 1);
    assert.ok(body.translation().x > 1);
    assert.ok(Math.abs(body.angvel().z) > 0.1);
    assert.ok(Math.abs(body.translation().y - 1) < 0.05);
  } finally {
    physics.dispose();
  }
});

test('objects can move beyond the finite floor and fall', async () => {
  const physics = await createPhysics();
  try {
    physics.addFloor(100, 100);
    const { body } = addProp(physics, new SphereGeometry(0.5), new Vector3(48, 0.5, 0));
    body.setLinvel({ x: 10, y: 0, z: 0 }, true);
    simulate(physics, 2);
    assert.ok(body.translation().x > 50.5);
    assert.ok(body.translation().y < -1);
  } finally {
    physics.dispose();
  }
});

test('dynamic objects collide with each other', async () => {
  const physics = await createPhysics();
  try {
    physics.addFloor(100, 100);
    addProp(physics, new BoxGeometry(2, 2, 2), new Vector3(0, 1, 0));
    const { body } = addProp(physics, new SphereGeometry(0.5), new Vector3(0, 5, 0));
    simulate(physics, 4);
    assert.ok(Math.abs(body.translation().y - 2.5) < 0.1);
  } finally {
    physics.dispose();
  }
});

test('the compound torus leaves its center open', async () => {
  const physics = await createPhysics();
  try {
    const { body } = addProp(physics, new TorusGeometry(2, 0.625), new Vector3(0, 6, 0));
    body.setGravityScale(0, true);
    physics.update(1 / 60);
    const throughCenter = new RAPIER.Ray({ x: 0, y: 6, z: 10 }, { x: 0, y: 0, z: -1 });
    const throughTube = new RAPIER.Ray({ x: 2, y: 6, z: 10 }, { x: 0, y: 0, z: -1 });
    assert.equal(physics.world.castRay(throughCenter, 20, true), null);
    assert.ok(physics.world.castRay(throughTube, 20, true));
  } finally {
    physics.dispose();
  }
});

test('mesh interpolation preserves parent transforms and interpolates rotation', async () => {
  const physics = await createPhysics();
  try {
    physics.world.gravity.y = 0;
    const parent = new Group();
    parent.position.set(7, 0, -3);
    parent.rotation.y = 0.6;
    const mesh = new Mesh(new BoxGeometry(2, 2, 2));
    mesh.position.set(1, 3, 2);
    parent.add(mesh);
    const startPosition = mesh.getWorldPosition(new Vector3());
    const startRotation = mesh.getWorldQuaternion(new Quaternion());
    const body = physics.addDynamicBody(mesh, createPrimitiveColliders(mesh.geometry));
    body.setLinvel({ x: 2, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 2, z: 0 }, true);
    physics.update(1 / 60);
    physics.update(1 / 120);
    physics.syncMeshes();
    const expectedPosition = startPosition.clone().lerp(body.translation(), 0.5);
    const expectedRotation = startRotation.clone().slerp(new Quaternion().copy(body.rotation()), 0.5);
    assert.ok(mesh.getWorldPosition(new Vector3()).distanceTo(expectedPosition) < 0.00001);
    assert.ok(mesh.getWorldQuaternion(new Quaternion()).angleTo(expectedRotation) < 0.00001);
    physics.reset();
    physics.syncMeshes();
    assert.ok(mesh.getWorldPosition(new Vector3()).distanceTo(body.translation()) < 0.00001);
  } finally {
    physics.dispose();
  }
});
