import assert from 'node:assert/strict';
import test from 'node:test';
import { Object3D } from 'three';
import { createVanishingSequence } from '../src/world/vanishing-sequence.ts';

function fixture(stages = ['cube', 'torus', 'teapot']) {
  const listeners = new Set();
  const physics = {
    onRespawn(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
  const armed = new Set();
  const vanished = new Set();
  const vanishing = {
    add(prop) { if (!vanished.has(prop)) armed.add(prop); },
    hasVanished: (prop) => vanished.has(prop),
  };
  const anchor = new Object3D();
  const props = Object.fromEntries(stages.map((name) => [name, new Object3D()]));
  const sequence = createVanishingSequence(vanishing, physics, { anchor, stages, firstRespawns: 5 });
  return {
    sequence, anchor, props, armed,
    respawn(mesh = anchor, times = 1) {
      for (let i = 0; i < times; i++) listeners.forEach((listener) => listener(mesh));
      sequence.update();
    },
    vanish(prop) {
      armed.delete(prop);
      vanished.add(prop);
      sequence.update();
    },
  };
}

test('stages arm one per anchor respawn, starting at the first threshold', () => {
  const { sequence, props, armed, respawn } = fixture();
  sequence.provide('cube', props.cube);
  sequence.provide('torus', props.torus);
  sequence.provide('teapot', props.teapot);
  respawn(undefined, 4);
  assert.equal(armed.size, 0);
  respawn();
  assert.deepEqual([...armed], [props.cube]);
  respawn();
  assert.deepEqual([...armed], [props.cube, props.torus]);
  respawn();
  assert.equal(armed.has(props.teapot), true);
});

test('only respawns of the anchor count', () => {
  const { sequence, props, armed, respawn } = fixture(['cube']);
  sequence.provide('cube', props.cube);
  respawn(props.cube, 10);
  assert.equal(sequence.respawns, 0);
  assert.equal(armed.size, 0);
});

test('a late stage arms on arrival once its count has passed, and a failed one is skipped', () => {
  const { sequence, props, armed, respawn } = fixture();
  sequence.provide('cube', props.cube);
  sequence.provide('torus', props.torus);
  respawn(undefined, 7);
  assert.equal(armed.has(props.teapot), false);
  sequence.provide('teapot', props.teapot);
  assert.equal(armed.has(props.teapot), true);

  const skipped = fixture();
  skipped.sequence.provide('cube', skipped.props.cube);
  skipped.sequence.provide('torus', skipped.props.torus);
  skipped.sequence.provide('teapot', undefined);
  skipped.respawn(undefined, 6);
  skipped.vanish(skipped.props.cube);
  skipped.vanish(skipped.props.torus);
  assert.equal(skipped.armed.has(skipped.anchor), true, 'A skipped stage does not hold up the anchor');
});

test('the anchor arms only after every other stage has vanished, and completes when it vanishes', () => {
  const { sequence, props, armed, anchor, respawn, vanish } = fixture();
  for (const [name, prop] of Object.entries(props)) sequence.provide(name, prop);
  respawn(undefined, 7);
  vanish(props.cube);
  vanish(props.torus);
  assert.equal(armed.has(anchor), false);
  vanish(props.teapot);
  assert.equal(armed.has(anchor), true);
  assert.equal(sequence.complete, false);
  vanish(anchor);
  assert.equal(sequence.complete, true);
});

test('a stage that has not arrived holds up the anchor', () => {
  const { sequence, props, armed, anchor, respawn, vanish } = fixture();
  sequence.provide('cube', props.cube);
  sequence.provide('torus', props.torus);
  respawn(undefined, 10);
  vanish(props.cube);
  vanish(props.torus);
  assert.equal(armed.has(anchor), false);
});
