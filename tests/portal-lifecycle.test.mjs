import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, Vector3 } from 'three';
import { createPortalEndpoint } from '../src/portals/portal.ts';
import { createPortalLifecycle } from '../src/portals/lifecycle.ts';
import { createPortalCrossingDetector } from '../src/portals/crossing.ts';

function fixture() {
  const world1 = { scene: new Scene() };
  const world2 = { scene: new Scene() };
  const a = createPortalEndpoint(world1, 8, 8);
  const b = createPortalEndpoint(world2, 8, 8);
  const pair = { a, b };
  const lifecycle = createPortalLifecycle(pair);
  const camera = new PerspectiveCamera(90, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  return { a, b, pair, lifecycle, camera, world1, world2 };
}

test('looking away before traversal leaves the initial portal pair open', () => {
  const { a, b, lifecycle, camera, world1 } = fixture();
  camera.rotation.y = Math.PI;
  assert.equal(lifecycle.update(world1, camera), false);
  assert.equal(a.closed, false);
  assert.equal(b.closed, false);
});

test('a traversed pair closes permanently once the return opening leaves the frustum', () => {
  const { a, b, lifecycle, camera, world2 } = fixture();
  lifecycle.arriveThrough(b);
  assert.equal(lifecycle.update(world2, camera), false);
  camera.rotation.y = Math.PI;
  assert.equal(lifecycle.update(world2, camera), true);
  assert.equal(lifecycle.closed, true);
  assert.equal(a.closed, true);
  assert.equal(b.closed, true);
  assert.equal(a.anchor.visible, false);
  assert.equal(b.anchor.visible, false);

  camera.rotation.y = 0;
  lifecycle.arriveThrough(b);
  assert.equal(lifecycle.update(world2, camera), false);
  assert.equal(lifecycle.closed, true);
});

test('partially visible and screen-filling openings remain open', () => {
  const { b, lifecycle, camera, world2 } = fixture();
  lifecycle.arriveThrough(b);
  b.anchor.position.x = 12;
  assert.equal(lifecycle.update(world2, camera), false, 'Left edge is still visible');
  b.anchor.position.x = 0;
  b.width = 100;
  b.height = 100;
  assert.equal(lifecycle.update(world2, camera), false, 'Opening covers the view even with all corners outside');
  b.width = 8;
  b.height = 8;
  b.anchor.position.x = 15;
  assert.equal(lifecycle.update(world2, camera), true);
});

test('a rotated opening outside a frustum corner closes even when its bounding box overlaps', () => {
  const { b, lifecycle, camera, world2 } = fixture();
  b.width = 4;
  b.height = 4;
  b.anchor.position.set(11.5, 11.5, 0);
  b.anchor.rotation.z = Math.PI / 4;
  lifecycle.arriveThrough(b);
  assert.equal(lifecycle.update(world2, camera), true);
});

test('prop occlusion does not count as leaving the camera frustum', () => {
  const { b, lifecycle, camera, world2 } = fixture();
  const blocker = new Mesh(new BoxGeometry(10, 10, 1), new MeshBasicMaterial());
  blocker.position.z = 5;
  world2.scene.add(blocker);
  lifecycle.arriveThrough(b);
  assert.equal(lifecycle.update(world2, camera), false);
  blocker.geometry.dispose();
  blocker.material.dispose();
});

test('frustum checks follow parent transforms and the current camera projection', () => {
  const { b, lifecycle, camera, world2 } = fixture();
  const parent = new Group();
  world2.scene.add(parent);
  parent.add(b.anchor);
  parent.position.set(8, 0, -10);
  parent.rotation.y = 0.6;
  lifecycle.arriveThrough(b);
  assert.equal(lifecycle.update(world2, camera), false);
  camera.aspect = 0.1;
  camera.updateProjectionMatrix();
  assert.equal(lifecycle.update(world2, camera), true);
});

test('the latest traversal selects which environment can close the connection', () => {
  const next = fixture();
  next.lifecycle.arriveThrough(next.b);
  next.lifecycle.arriveThrough(next.a);
  next.camera.rotation.y = Math.PI;
  assert.equal(next.lifecycle.update(next.world2, next.camera), false, 'Inactive environment cannot close the connection');
  next.camera.rotation.y = 0;
  assert.equal(next.lifecycle.update(next.world1, next.camera), false);
  next.camera.rotation.y = Math.PI;
  assert.equal(next.lifecycle.update(next.world1, next.camera), true);
});

test('a closed pair cannot produce crossings after detector resets or environment changes', () => {
  const { a, b, pair, lifecycle, camera, world1, world2 } = fixture();
  const detector = createPortalCrossingDetector(pair);
  lifecycle.arriveThrough(b);
  camera.rotation.y = Math.PI;
  assert.equal(lifecycle.update(world2, camera), true);
  for (const source of [a, b]) {
    detector.reset(source.environment, new Vector3(0, 0, 1));
    assert.equal(detector.update(source.environment, new Vector3(0, 0, -1)), undefined);
  }
  detector.arriveThrough(b, new Vector3(0, 0, 1));
  assert.equal(detector.update(world2, new Vector3(0, 0, -1)), undefined);
  assert.equal(detector.update(world1, new Vector3(0, 0, 1)), undefined);
});
