import RAPIER from '@dimforge/rapier3d-compat';

const fixedTimeStep = 1 / 60;
const maxStepsPerFrame = 5;

export async function createPhysics() {
  await RAPIER.init();

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = fixedTimeStep;
  let accumulator = 0;

  return {
    world,

    update(deltaSeconds: number) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;

      // Discard excess elapsed time rather than building an unbounded backlog.
      accumulator = Math.min(
        accumulator + deltaSeconds,
        fixedTimeStep * maxStepsPerFrame,
      );

      let steps = 0;
      while (accumulator + Number.EPSILON >= fixedTimeStep) {
        world.step();
        accumulator = Math.max(0, accumulator - fixedTimeStep);
        steps++;
      }
      return steps;
    },

    reset() {
      accumulator = 0;
    },

    dispose() {
      world.free();
    },
  };
}
