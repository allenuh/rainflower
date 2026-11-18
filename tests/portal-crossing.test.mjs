import assert from 'node:assert/strict';
import test from 'node:test';
import RAPIER from '@dimforge/rapier3d-compat';
import { Group, Scene, Vector3 } from 'three';
import { createPortalEndpoint } from '../src/portals/portal.ts';
import { createPortalCrossingDetector } from '../src/portals/crossing.ts';
import { createPhysics } from '../src/physics/world.ts';
import { createPlayer } from '../src/player/controller.ts';

function fixture() {
  const world1 = { scene: new Scene() };
  const world2 = { scene: new Scene() };
  const a = createPortalEndpoint(world1, 8, 8);
  const b = createPortalEndpoint(world2, 8, 8);
  return { world1, world2, a, b, detector: createPortalCrossingDetector({ a, b }) };
}

test('crossings are seeded silently and only fire when moving front to back', () => {
  const { world1, a, b, detector } = fixture();
  assert.equal(detector.update(world1, new Vector3(0, 1, 3)), undefined);
  assert.equal(detector.update(world1, new Vector3(0, 1, 2)), undefined);
  const crossing = detector.update(world1, new Vector3(0, 1, -2));
  assert.equal(crossing.source, a);
  assert.equal(crossing.destination, b);
  assert.equal(crossing.fraction, 0.5);
  assert.deepEqual(crossing.point.toArray(), [0, 1, 0]);
  assert.equal(detector.update(world1, new Vector3(0, 1, -2)), undefined);
  assert.equal(detector.update(world1, new Vector3(0, 1, -3)), undefined);
  assert.equal(detector.update(world1, new Vector3(0, 1, 2)), undefined);
  assert.ok(detector.update(world1, new Vector3(0, 1, -2)));
  // Reported points remain snapshots after subsequent samples.
  assert.deepEqual(crossing.point.toArray(), [0, 1, 0]);
});

test('landing on the plane counts once, without retriggering while on or behind it', () => {
  const { world1, detector } = fixture();
  detector.reset(world1, new Vector3(0, 0, 1));
  assert.equal(detector.update(world1, new Vector3()).fraction, 1);
  assert.equal(detector.update(world1, new Vector3()), undefined);
  assert.equal(detector.update(world1, new Vector3(0, 0, -1)), undefined);
  detector.reset(world1, new Vector3());
  assert.equal(detector.update(world1, new Vector3(0, 0, -1)), undefined);
});

test('crossings must intersect the rectangular opening, including its boundary', () => {
  const { world1, detector } = fixture();
  for (const [x, y] of [[4.01, 0], [-4.01, 0], [0, 4.01], [0, -4.01]]) {
    detector.reset(world1, new Vector3(x, y, 1));
    assert.equal(detector.update(world1, new Vector3(x, y, -1)), undefined);
  }
  for (const [x, y] of [[4, 4], [-4, -4], [0, 0]]) {
    detector.reset(world1, new Vector3(x, y, 1));
    assert.ok(detector.update(world1, new Vector3(x, y, -1)));
  }
});

test('fast diagonal movement checks the plane intersection instead of either endpoint', () => {
  const { world1, detector } = fixture();
  detector.reset(world1, new Vector3(-6, 0, 100));
  const crossing = detector.update(world1, new Vector3(6, 0, -100));
  assert.equal(crossing.fraction, 0.5);
  assert.deepEqual(crossing.point.toArray(), [0, 0, 0]);

  detector.reset(world1, new Vector3(10, 0, 1));
  assert.equal(detector.update(world1, new Vector3(0, 0, -3)), undefined);
  detector.reset(world1, new Vector3(0, 10, 1));
  assert.equal(detector.update(world1, new Vector3(0, 0, -3)), undefined);
  detector.reset(world1, new Vector3(0, 0, 2));
  assert.equal(detector.update(world1, new Vector3(3, 0, 2)), undefined);
});

test('both endpoints detect crossings using their current parented world transforms', () => {
  const { world1, world2, a, b, detector } = fixture();
  const parent = new Group();
  world2.scene.add(parent);
  parent.add(b.anchor);
  for (const [source, destination] of [[a, b], [b, a]]) {
    source.anchor.position.set(5, 4, -7);
    source.anchor.rotation.y = 0.6;
    parent.position.set(-3, 2, 10);
    parent.rotation.set(0.2, -1.1, 0.1);
    const start = source.anchor.localToWorld(new Vector3(1, 1, 3));
    const end = source.anchor.localToWorld(new Vector3(1, 1, -1));
    const expected = source.anchor.localToWorld(new Vector3(1, 1, 0));
    detector.reset(source.environment, start);
    const crossing = detector.update(source.environment, end);
    assert.equal(crossing.source, source);
    assert.equal(crossing.destination, destination);
    assert.ok(Math.abs(crossing.fraction - 0.75) < 1e-9);
    assert.ok(crossing.point.distanceTo(expected) < 1e-9);
  }
});

test('environment changes and resets never turn discontinuous movement into a crossing', () => {
  const { world1, world2, a, b, detector } = fixture();
  detector.reset(world1, new Vector3(0, 0, 1));
  assert.equal(detector.update(world2, new Vector3(0, 0, -1)), undefined);
  assert.equal(detector.update(world2, new Vector3(0, 0, 1)), undefined);
  const reverse = detector.update(world2, new Vector3(0, 0, -1));
  assert.equal(reverse.source, b);
  assert.equal(reverse.destination, a);
  detector.reset(world1, new Vector3(0, 0, -10));
  assert.equal(detector.update(world1, new Vector3(0, 0, -11)), undefined);
  const unrelated = { scene: new Scene() };
  detector.reset(unrelated, new Vector3(0, 0, 1));
  assert.equal(detector.update(unrelated, new Vector3(0, 0, -1)), undefined);
});

test('arrival suppresses immediate reverse crossings and repeated jitter around the exit plane', () => {
  const { world2, b, detector } = fixture();
  detector.arriveThrough(b, new Vector3(0, 0, 0.00001));
  for (const z of [-0.00001, 0, 0.02, -0.02, 0.09, -0.01, -0.2]) {
    assert.equal(detector.update(world2, new Vector3(0, 0, z)), undefined);
  }
});

test('moving clear of the exit rearms a deliberate return without a time-based cooldown', () => {
  const { world2, a, b, detector } = fixture();
  detector.arriveThrough(b, new Vector3(0, 0, 0));
  assert.equal(detector.update(world2, new Vector3(0, 0, 0.2)), undefined);
  const crossing = detector.update(world2, new Vector3(0, 0, -0.1));
  assert.equal(crossing.source, b);
  assert.equal(crossing.destination, a);
  assert.ok(crossing.point.distanceTo(new Vector3()) < 1e-9);

  // A fast traversal may already put the arrival beyond the clearance.
  detector.arriveThrough(b, new Vector3(0, 0, 0.3));
  assert.equal(detector.update(world2, new Vector3(0, 0, -0.1)).source, b);
});

test('pausing near the exit preserves the arrival guard while environment changes clear it', () => {
  const { world1, world2, a, b, detector } = fixture();
  detector.arriveThrough(b, new Vector3(0, 0, 0.01));
  detector.reset(world2, new Vector3(0, 0, 0.01));
  assert.equal(detector.update(world2, new Vector3(0, 0, -0.01)), undefined);
  detector.reset(world1, new Vector3(0, 0, 0.01));
  assert.equal(detector.update(world1, new Vector3(0, 0, -0.01)).source, a);
});

test('the arrival guard follows a rotated and parented exit in either direction', () => {
  const { a, b, detector } = fixture();
  for (const source of [a, b]) {
    const parent = new Group();
    source.environment.scene.add(parent);
    parent.add(source.anchor);
    parent.position.set(-10, 2, 8);
    parent.rotation.set(0.2, 1.1, -0.1);
    source.anchor.position.set(3, 4, -2);
    source.anchor.rotation.y = -0.6;
    const point = (z) => source.anchor.localToWorld(new Vector3(1, 1, z));
    detector.arriveThrough(source, point(0.01));
    assert.equal(detector.update(source.environment, point(-0.01)), undefined);
    assert.equal(detector.update(source.environment, point(0.2)), undefined);
    assert.equal(detector.update(source.environment, point(-0.2)).source, source);
  }
});

async function replay(frameTimes, blocked = false) {
  const physics = await createPhysics();
  const { world1, a, detector } = fixture();
  a.anchor.position.y = 4;
  physics.addFloor(100, 100);
  if (blocked) {
    physics.world.createCollider(RAPIER.ColliderDesc.cuboid(10, 5, 0.1).setTranslation(0, 5, 1));
  }
  const player = createPlayer(physics.world, new Vector3(0, 0, 3));
  const crossings = [];
  let completedSteps = 0;
  try {
    physics.update(physics.world.timestep);
    detector.reset(world1, player.body.translation());
    for (const delta of frameTimes) {
      physics.update(delta, (step) => {
        player.update(step, { x: 0, y: 0, z: -20 });
      }, (step) => {
        assert.ok(Math.abs(step - physics.world.timestep) < 1e-8);
        completedSteps++;
        const crossing = detector.update(world1, player.body.translation());
        if (crossing) {
          assert.ok(player.body.translation().z <= 0, 'Movement must be committed before detection');
          crossings.push(crossing);
        }
      });
    }
    return { crossings, completedSteps };
  } finally {
    player.dispose();
    physics.dispose();
  }
}

test('completed physics steps detect one crossing at different render rates and catch-up frames', async () => {
  const schedules = [30, 60, 144, 240].map((rate) => Array.from({ length: rate }, () => 1 / rate));
  schedules.push(Array.from({ length: 40 }, () => [0, 0.005, 0.05, 0.02]).flat());
  let expectedCrossing;
  for (const schedule of schedules) {
    const { crossings, completedSteps } = await replay(schedule);
    assert.equal(crossings.length, 1);
    assert.equal(completedSteps, Math.round(schedule.reduce((sum, delta) => sum + delta, 0) * 60));
    assert.ok(Math.abs(crossings[0].point.z) < 1e-9);
    assert.ok(Math.abs(crossings[0].point.x) <= 4);
    assert.ok(crossings[0].point.y > 0 && crossings[0].point.y < 8);
    expectedCrossing ??= crossings[0].point;
    assert.ok(crossings[0].point.distanceTo(expectedCrossing) < 1e-6);
  }
});

test('movement blocked by a collider never produces a crossing from input velocity alone', async () => {
  const { crossings } = await replay(Array(60).fill(1 / 60), true);
  assert.equal(crossings.length, 0);
});
