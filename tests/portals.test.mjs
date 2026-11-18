import assert from 'node:assert/strict';
import test from 'node:test';
import { Euler, Group, Matrix4, PerspectiveCamera, Quaternion, Scene, Vector3 } from 'three';
import { createPortalEndpoint, getPortalTransform, updatePortalCamera } from '../src/portals/portal.ts';

const tolerance = 1e-9;

function endpoint(position = [0, 0, 0], yaw = 0) {
  const portal = createPortalEndpoint({ scene: new Scene() }, 8, 8);
  portal.anchor.position.set(...position);
  portal.anchor.rotation.y = yaw;
  return portal;
}

function assertVector(actual, expected) {
  assert.ok(actual.distanceTo(expected) < tolerance,
    `Expected ${expected.toArray()}, got ${actual.toArray()}`);
}

function assertMatrix(actual, expected) {
  actual.elements.forEach((value, index) => {
    assert.ok(Math.abs(value - expected.elements[index]) < tolerance,
      `Matrix element ${index}: ${value} != ${expected.elements[index]}`);
  });
}

test('the initial pair maps between floor-aligned openings without changing eye height', () => {
  const source = endpoint([0, 4, -12]);
  const destination = endpoint([0, 4, 0], Math.PI);
  const target = new Matrix4();
  assert.equal(getPortalTransform(source, destination, target), target);
  assertVector(new Vector3(0, 5, -12).applyMatrix4(target), new Vector3(0, 5, 0));
  assertVector(new Vector3(0, 5, -13).applyMatrix4(target), new Vector3(0, 5, -1));
});

test('facing portals turn lateral and depth offsets through the opening', () => {
  const source = endpoint([10, 4, 20]);
  const destination = endpoint([-7, 6, -30]);
  const transform = getPortalTransform(source, destination, new Matrix4());
  assertVector(new Vector3(12, 7, 25).applyMatrix4(transform), new Vector3(-9, 9, -35));
  assertVector(new Vector3(0, 0, -1).transformDirection(transform), new Vector3(0, 0, 1));
});

test('differently rotated portals map entry movement to the exit outward normal', () => {
  const source = endpoint([2, 4, 8], Math.PI / 3);
  const destination = endpoint([-9, 4, 5], -Math.PI / 2);
  const transform = getPortalTransform(source, destination, new Matrix4());
  const intoSource = new Vector3(0, 0, -1).applyQuaternion(source.anchor.quaternion);
  const outOfDestination = new Vector3(0, 0, 1).applyQuaternion(destination.anchor.quaternion);
  assertVector(intoSource.transformDirection(transform), outOfDestination);
});

test('a camera pose preserves relative yaw, pitch, and unit scale through rotated portals', () => {
  const source = endpoint([3, 4, -5], Math.PI / 4);
  const destination = endpoint([-12, 7, 6], -Math.PI / 3);
  const relativeRotation = new Quaternion().setFromEuler(new Euler(0.35, -0.6, 0, 'YXZ'));
  const localPose = new Matrix4().compose(
    new Vector3(1.5, 1, 3), relativeRotation, new Vector3(1, 1, 1),
  );
  const transform = getPortalTransform(source, destination, new Matrix4());
  const sourcePose = new Matrix4().multiplyMatrices(source.anchor.matrixWorld, localPose);
  const mappedPose = sourcePose.clone().premultiply(transform);
  const expectedPose = destination.anchor.matrixWorld.clone()
    .multiply(new Matrix4().makeRotationY(Math.PI)).multiply(localPose);
  assertMatrix(mappedPose, expectedPose);

  const rotation = new Quaternion();
  const scale = new Vector3();
  mappedPose.decompose(new Vector3(), rotation, scale);
  const expectedRotation = destination.anchor.quaternion.clone()
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI))
    .multiply(relativeRotation);
  assert.ok(1 - Math.abs(rotation.dot(expectedRotation)) < tolerance);
  assertVector(scale, new Vector3(1, 1, 1));
});

test('reverse transforms restore both position and orientation', () => {
  const source = endpoint([8, 3, -2], 0.7);
  const destination = endpoint([-20, 9, 14], -1.2);
  const forward = getPortalTransform(source, destination, new Matrix4());
  const reverse = getPortalTransform(destination, source, new Matrix4());
  assertMatrix(reverse.clone().multiply(forward), new Matrix4());
  const pose = new Matrix4().compose(
    new Vector3(13, 5, 7),
    new Quaternion().setFromEuler(new Euler(-0.4, 0.8, 0.1, 'YXZ')),
    new Vector3(1, 1, 1),
  );
  assertMatrix(pose.clone().premultiply(forward).premultiply(reverse), pose);
});

test('mapping refreshes moved anchors and rigid parents without a render pass', () => {
  const source = endpoint([2, 4, -3]);
  const destination = endpoint([-1, 4, 7]);
  const parent = new Group();
  source.environment.scene.add(parent);
  parent.add(source.anchor);
  const before = getPortalTransform(source, destination, new Matrix4());

  parent.position.set(10, 2, 5);
  parent.rotation.y = Math.PI / 2;
  destination.environment.scene.position.set(-6, 0, 2);
  destination.anchor.position.x += 3;
  const transform = getPortalTransform(source, destination, new Matrix4());
  assert.notDeepEqual(transform.elements, before.elements);
  const entryPoint = source.anchor.localToWorld(new Vector3(1, 2, -0.5));
  const exitPoint = destination.anchor.localToWorld(new Vector3(-1, 2, 0.5));
  assertVector(entryPoint.applyMatrix4(transform), exitPoint);
});

test('a destination camera projects matching portal points to the same screen rays', () => {
  const source = endpoint([3, 4, -8], 0.3);
  const destination = endpoint([-10, 6, 20], -Math.PI / 3);
  const viewer = new PerspectiveCamera(75, 16 / 9, 0.1, 1000);
  const portalCamera = new PerspectiveCamera();
  const transform = getPortalTransform(source, destination, new Matrix4());

  for (const [x, yaw, pitch] of [[0, 0.1, -0.2], [5, -0.3, 0.25], [-4, 0.4, -0.1]]) {
    viewer.position.set(x, 5, 12);
    viewer.rotation.set(pitch, yaw, 0, 'YXZ');
    updatePortalCamera(source, destination, viewer, portalCamera);
    for (const [localX, localY] of [[-4, -4], [4, -4], [4, 4], [-4, 4], [0, 0]]) {
      const point = source.anchor.localToWorld(new Vector3(localX, localY, 0));
      const destinationPoint = point.clone().applyMatrix4(transform);
      assertVector(point.project(viewer), destinationPoint.project(portalCamera));
    }
  }
});

test('moving the viewer sideways produces destination parallax instead of a fixed view', () => {
  const source = endpoint([0, 4, -12]);
  const destination = endpoint([0, 4, 0], Math.PI);
  const viewer = new PerspectiveCamera(90, 1, 0.1, 1000);
  const portalCamera = new PerspectiveCamera();
  const object = new Vector3(2, 5, -4);
  viewer.position.set(0, 5, 10);
  updatePortalCamera(source, destination, viewer, portalCamera);
  const centered = object.clone().project(portalCamera);
  assert.ok(Math.abs(centered.x - 2 / 26) < tolerance);

  viewer.position.x = 4;
  updatePortalCamera(source, destination, viewer, portalCamera);
  const offset = object.clone().project(portalCamera);
  assert.ok(Math.abs(offset.x - (-2 / 26)) < tolerance);
  assert.ok(offset.x < centered.x);
});

test('portal cameras preserve lens offsets and refresh projection after resizing', () => {
  const source = endpoint();
  const destination = endpoint([10, 0, 0], Math.PI / 2);
  const viewer = new PerspectiveCamera(63, 16 / 9, 0.25, 700);
  const portalCamera = new PerspectiveCamera();
  viewer.zoom = 1.4;
  viewer.filmOffset = 2;
  viewer.setViewOffset(1920, 1080, 100, 20, 1280, 800);
  viewer.updateProjectionMatrix();
  updatePortalCamera(source, destination, viewer, portalCamera);
  assertMatrix(portalCamera.projectionMatrix, viewer.projectionMatrix);
  assertMatrix(portalCamera.projectionMatrixInverse, viewer.projectionMatrixInverse);
  assert.equal(portalCamera.near, 0.25);
  assert.equal(portalCamera.far, 700);

  viewer.clearViewOffset();
  viewer.aspect = 0.75;
  viewer.updateProjectionMatrix();
  updatePortalCamera(source, destination, viewer, portalCamera);
  assertMatrix(portalCamera.projectionMatrix, viewer.projectionMatrix);
  assertMatrix(portalCamera.projectionMatrixInverse, viewer.projectionMatrixInverse);
});

test('portal cameras use a parented viewer world pose without modifying the viewer', () => {
  const source = endpoint([1, 4, -5], -0.2);
  const destination = endpoint([-12, 4, 2], Math.PI / 2);
  const viewer = new PerspectiveCamera();
  const parent = new Group();
  parent.position.set(4, 0, 7);
  parent.rotation.y = 0.6;
  parent.add(viewer);
  viewer.position.set(2, 5, 3);
  viewer.rotation.set(-0.2, 0.1, 0, 'YXZ');
  viewer.updateWorldMatrix(true, false);
  const originalPose = viewer.matrixWorld.clone();
  const portalCamera = new PerspectiveCamera();
  updatePortalCamera(source, destination, viewer, portalCamera);
  const expected = getPortalTransform(source, destination, new Matrix4()).multiply(originalPose);
  assertMatrix(portalCamera.matrixWorld, expected);
  assertMatrix(viewer.matrixWorld, originalPose);
});
