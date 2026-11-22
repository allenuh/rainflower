import assert from 'node:assert/strict';
import test from 'node:test';
import { simplifiedHullPoints } from '../src/physics/simplified-hull.ts';

/** A dense, bumpy blob of points (x, y, z triples), y from about 0 up to 2. */
function bumpyBlob() {
  const points = [];
  for (let i = 0; i < 4000; i++) {
    // Deterministic spiral over a sphere, with ripples, so the test is repeatable.
    const y = 1 - (2 * (i + 0.5)) / 4000;
    const angle = i * 2.399963;
    const ring = Math.sqrt(1 - y * y);
    const ripple = 1 + 0.05 * Math.sin(i * 0.37);
    points.push(Math.cos(angle) * ring * ripple, 1 + y * ripple, Math.sin(angle) * ring * ripple);
  }
  return points;
}

const options = { directions: 32, flatBase: 0.15, baseDirections: 12 };
const triples = (points) => Array.from({ length: points.length / 3 }, (_, i) => [...points.slice(i * 3, i * 3 + 3)]);

test('a simplified hull keeps at most one point per sampled direction', () => {
  const result = simplifiedHullPoints(bumpyBlob(), options);
  assert.ok(result.length / 3 <= options.directions + options.baseDirections);
  assert.ok(result.length / 3 >= 8);
});

test('points near the bottom are flattened onto one plane', () => {
  const blob = bumpyBlob();
  let lowest = Infinity;
  for (let i = 1; i < blob.length; i += 3) lowest = Math.min(lowest, blob[i]);
  const result = triples(simplifiedHullPoints(blob, options));
  const base = result.filter(([, y]) => y <= lowest + options.flatBase);
  assert.ok(base.length >= 3, 'enough points for a flat base');
  for (const [, y] of base) assert.equal(y, Math.fround(lowest));
});

test('a simplified hull still reaches close to the top of the shape', () => {
  const blob = bumpyBlob();
  let lowest = Infinity;
  let highest = -Infinity;
  for (let i = 1; i < blob.length; i += 3) {
    lowest = Math.min(lowest, blob[i]);
    highest = Math.max(highest, blob[i]);
  }
  const result = triples(simplifiedHullPoints(blob, options));
  const top = Math.max(...result.map(([, y]) => y));
  // Rough by design: within 2% of the shape's height.
  assert.ok(top <= highest + 1e-6);
  assert.ok(highest - top < 0.02 * (highest - lowest), `top ${top} vs ${highest}`);
});
