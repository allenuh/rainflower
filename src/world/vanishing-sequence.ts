import type { Object3D } from 'three';
import type { Physics } from '../physics/world';
import type { createVanishingProps } from './vanishing-props';

type VanishingProps = ReturnType<typeof createVanishingProps>;

/**
 * Every time `anchor` is sent back to the drop point, count it. Once the count
 * reaches `firstRespawns`, the first stage's prop is armed to vanish when
 * unseen, the next stage one respawn later, and so on. When every stage has
 * vanished, the anchor itself is armed; `complete` turns true once it's gone.
 */
export function createVanishingSequence(
  vanishing: VanishingProps,
  physics: Physics,
  { anchor, stages, firstRespawns }: {
    anchor: Object3D;
    stages: readonly string[];
    firstRespawns: number;
  },
) {
  // A stage slot is unfilled until provided; null means it will never arrive.
  const slots = new Map<string, Object3D | null | undefined>(stages.map((name) => [name, undefined]));
  let respawns = 0;
  physics.onRespawn((mesh) => {
    if (mesh === anchor) respawns++;
  });

  function update() {
    let remaining = 0;
    stages.forEach((name, index) => {
      const prop = slots.get(name);
      if (prop === null) return;
      if (prop === undefined || !vanishing.hasVanished(prop)) remaining++;
      if (prop && respawns >= firstRespawns + index) vanishing.add(prop);
    });
    if (remaining === 0) vanishing.add(anchor);
  }

  return {
    get respawns() { return respawns; },
    get complete() { return vanishing.hasVanished(anchor); },

    /** Fill a stage once its prop exists; `undefined` skips the stage. */
    provide(name: string, prop: Object3D | undefined) {
      if (!slots.has(name)) throw new Error(`Unknown vanishing stage: ${name}`);
      slots.set(name, prop ?? null);
      update();
    },

    update,
  };
}
