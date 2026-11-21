import assert from 'node:assert/strict';
import test from 'node:test';
import {
  Box3, BoxGeometry, Frustum, Matrix4, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera,
  PlaneGeometry, Vector3,
} from 'three';
import { setBoundsWithoutTextBoxes } from '../src/player/prop-interaction.ts';
import {
  anchorTextBox, findAimedTextBox, pickAnotherIndex, pressTextBoxKey, wrapText,
} from '../src/ui/text-box.ts';

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

/**
 * A 1-unit cube prop at the origin with a balloon 4 units above it: 2x1 when
 * closed, with two pages, 6x3 and 6x2.
 */
function propWithTextBox() {
  const prop = new Mesh(new BoxGeometry(1, 1, 1));
  const balloon = new Mesh(new PlaneGeometry(1, 1).translate(0, 0.5, 0), new MeshBasicMaterial());
  anchorTextBox(balloon, {
    lift: 4,
    pointer: 'down',
    closed: { texture: null, width: 2, height: 1 },
    decks: [[{ texture: null, width: 6, height: 3 }, { texture: null, width: 6, height: 2 }]],
  });
  prop.add(balloon);
  return prop;
}

const handleOf = (prop) => prop.children[0].userData.textBox;

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
  assert.ok(prop.children[0].userData.textBox);
});

test('F opens a text box, turns its pages, then closes it', () => {
  const handle = handleOf(propWithTextBox());
  assert.equal(handle.pageCount, 2);
  assert.equal(handle.page, -1);
  handle.advance();
  assert.equal(handle.page, 0);
  handle.advance();
  assert.equal(handle.page, 1);
  handle.advance();
  assert.equal(handle.page, -1);
});

test('an open text box closes once the camera walks out of range', () => {
  const prop = propWithTextBox();
  prop.updateMatrixWorld();
  const handle = handleOf(prop);
  handle.advance();

  prop.children[0].onBeforeRender(null, null, cameraLookingAt(new Vector3(0, 5, 15), new Vector3()));
  assert.equal(handle.page, 0);
  prop.children[0].onBeforeRender(null, null, cameraLookingAt(new Vector3(0, 5, 40), new Vector3()));
  assert.equal(handle.page, -1);
});

/** Two props with text boxes, side by side, and one far away. */
function propsScene() {
  const scene = new Object3D();
  const [left, right, far] = Array.from({ length: 3 }, propWithTextBox);
  left.position.set(-6, 0, 0);
  right.position.set(6, 0, 0);
  far.position.set(0, 0, -60);
  scene.add(left, right, far);
  scene.updateMatrixWorld();
  return { scene, left, right, far };
}

test('F picks the in-range text box nearest the centre of view', () => {
  const { scene, left, right, far } = propsScene();
  // Aimed at the right prop's balloon from 12 units away.
  const camera = cameraLookingAt(new Vector3(6, 5, 12), new Vector3(6, 5, 0));
  assert.equal(findAimedTextBox(scene, camera), handleOf(right));

  // Aimed straight down the middle, toward the far prop that's out of range.
  const middle = cameraLookingAt(new Vector3(0, 5, 12), new Vector3(0, 0, -60));
  assert.equal(findAimedTextBox(scene, middle), undefined);
  assert.notEqual(findAimedTextBox(scene, camera), handleOf(left));
  assert.notEqual(findAimedTextBox(scene, camera), handleOf(far));
});

test('only one text box is open at a time, and F aimed at nothing closes it', () => {
  const { scene, left, right } = propsScene();
  const atLeft = cameraLookingAt(new Vector3(-6, 5, 12), new Vector3(-6, 5, 0));
  const atRight = cameraLookingAt(new Vector3(6, 5, 12), new Vector3(6, 5, 0));
  const atNothing = cameraLookingAt(new Vector3(0, 5, 12), new Vector3(0, 30, 12));

  assert.equal(pressTextBoxKey(scene, atLeft), true);
  assert.equal(handleOf(left).page, 0);
  assert.equal(pressTextBoxKey(scene, atRight), true);
  assert.equal(handleOf(left).page, -1);
  assert.equal(handleOf(right).page, 0);
  assert.equal(pressTextBoxKey(scene, atNothing), true);
  assert.equal(handleOf(right).page, -1);
});

test('F reports no interaction when aimed at nothing with nothing open', () => {
  const { scene, left, right } = propsScene();
  const atNothing = cameraLookingAt(new Vector3(0, 5, 12), new Vector3(0, 30, 12));

  assert.equal(pressTextBoxKey(scene, atNothing), false);
  assert.equal(handleOf(left).page, -1);
  assert.equal(handleOf(right).page, -1);
});

test('pickAnotherIndex never repeats the previous index', () => {
  // Sweep the whole range of random values.
  for (let previous = 0; previous < 4; previous++) {
    const picks = new Set();
    for (let step = 0; step < 100; step++) picks.add(pickAnotherIndex(4, previous, () => step / 100));
    assert.equal(picks.has(previous), false);
    assert.equal(picks.size, 3);
  }
  assert.equal(pickAnotherIndex(1, 0, () => 0.9), 0);
  assert.equal(pickAnotherIndex(3, -1, () => 0.9), 2);
});

test('a random text box opens the entry it picks, and pages through that entry', () => {
  const balloon = new Mesh(new PlaneGeometry(1, 1).translate(0, 0.5, 0), new MeshBasicMaterial());
  const page = (height) => ({ texture: null, width: 6, height });
  const picked = [];
  const handle = anchorTextBox(balloon, {
    lift: 4,
    pointer: 'down',
    closed: page(1),
    decks: [[page(3)], [page(3), page(2)], [page(2)]],
    pickDeck(count, previous) {
      picked.push(previous);
      return (previous + 1) % count;
    },
  });

  handle.advance();
  assert.equal(handle.page, 0);
  assert.equal(handle.pageCount, 1); // Entry 0.
  handle.advance();
  assert.equal(handle.page, -1);
  handle.advance();
  assert.equal(handle.pageCount, 2); // Entry 1, which has two pages.
  handle.advance();
  assert.equal(handle.page, 1);
  handle.advance();
  assert.equal(handle.page, -1);
  assert.deepEqual(picked, [-1, 0]);
});
