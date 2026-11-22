import type { LoadingManager } from 'three';
import bunnyUrl from '../assets/models/stanford-bunny.obj?url';
import type { Physics } from '../physics/world';
import { createObjProp } from './obj-prop';

/** The bunny's height in world units, from its base to the tips of its ears. */
export const bunnyHeight = 3;

/** The Stanford bunny, the full 1994 scan, as a dynamic prop. Its origin is at its base. */
export function createStanfordBunny(physics: Physics, manager?: LoadingManager) {
  return createObjProp(physics, {
    url: bunnyUrl,
    height: bunnyHeight,
    color: 0xd9a066,
    // Right of the spawn point, clear of the magenta sphere, turned to face the
    // spawn. The scan faces -X, so this turns that toward (-11, 5).
    position: { x: 11, z: 5 },
    rotationY: Math.atan2(5, 11),
    // The hull of all 35,947 scanned points has thousands of tiny facets and
    // an uneven base, so the bunny never stops rocking. A rough hull with a
    // flat bottom is close enough and settles at once.
    simplifiedCollider: { directions: 32, flatBase: 0.15, baseDirections: 12 },
  }, manager);
}
