import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Box3, BoxGeometry, Frustum, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera,
  PlaneGeometry, Vector3,
} from 'three';
import { setBoundsWithoutTextBoxes } from '../src/player/prop-interaction.ts';
import { anchorTextBox, wrapText } from '../src/ui/text-box.ts';

// One unit per character keeps the expected widths easy to read.
const measure = (text) => text.length;

test('wrapText breaks at spaces without exceeding the width', () => {
  assert.deepEqual(wrapText('the quick brown fox jumps', 10, measure), ['the quick', 'brown fox', 'jumps']);
  assert.deepEqual(wrapText('  spaced   out  ', 20, measure), ['spaced out']);
  assert.deepEqual(wrapText('', 10, measure), []);
});

test('wrapText splits a word longer than a whole line', () => {
  assert.deepEqual(wrapText('a supercalifragilistic word', 8, measure), ['a', 'supercal', 'ifragili', 'stic', 'word']);
});

/** A 1-unit cube prop at the origin with a 6x3 balloon 4 units above it. */
function propWithTextBox() {
  const prop = new Mesh(new BoxGeometry(1, 1, 1));
  const width = 6;
  const height = 3;
  const lift = 4;
  const balloon = new Mesh(
    new PlaneGeometry(width, height).translate(0, height / 2, 0),
    new MeshBasicMaterial(),
  );
  anchorTextBox(balloon, { width, height, lift });
  prop.add(balloon);
  return prop;
}

function cameraLookingAt(position, target) {
  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  return camera;
}

/** The check vanishing-props.ts makes: does the camera see the prop's bounds? */
function seesProp(camera, prop) {
  const frustum = new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
  );
  return frustum.intersectsBox(new Box3().setFromObject(prop));
}

test('a prop counts as seen while only its text box is in view', () => {
  // A narrow view of the balloon (y 4 to 7) that leaves the cube below the frame.
  const camera = cameraLookingAt(new Vector3(0, 5.5, 10), new Vector3(0, 5.5, 0));
  const bare = new Mesh(new BoxGeometry(1, 1, 1));

  assert.equal(seesProp(camera, bare), false);
  assert.equal(seesProp(camera, propWithTextBox()), true);
});

test('a prop with a text box is unseen once neither is in view', () => {
  const camera = cameraLookingAt(new Vector3(0, 30, 0), new Vector3(0, 60, 0));
  assert.equal(seesProp(camera, propWithTextBox()), false);
});

test('a text box faces the camera above its anchor, whatever its prop\'s rotation', () => {
  const prop = propWithTextBox();
  prop.position.set(2, 0, -3);
  prop.rotation.set(1.2, 0.4, 2.5);
  prop.updateMatrixWorld();
  const camera = cameraLookingAt(new Vector3(10, 8, 10), new Vector3(0, 0, 0));
  const [balloon] = prop.children;

  balloon.onBeforeRender(null, null, camera);
  const position = new Vector3().setFromMatrixPosition(balloon.matrixWorld);
  assert.deepEqual(position.toArray().map((value) => +value.toFixed(6)), [2, 4, -3]);
  const facing = new Vector3(0, 0, 1).transformDirection(balloon.matrixWorld);
  const toCamera = new Vector3(0, 0, 1).transformDirection(camera.matrixWorld);
  assert.ok(facing.distanceTo(toCamera) < 1e-6);
});

test('pick-up bounds leave out text boxes and keep them attached', () => {
  const prop = propWithTextBox();
  const bounds = setBoundsWithoutTextBoxes(new Box3(), prop, true);

  assert.deepEqual(bounds.min.toArray(), [-0.5, -0.5, -0.5]);
  assert.deepEqual(bounds.max.toArray(), [0.5, 0.5, 0.5]);
  assert.equal(prop.children.length, 1);
  assert.equal(prop.children[0].userData.textBox, true);
});
