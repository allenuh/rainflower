import type { LoadingManager } from 'three';
import suzanneUrl from '../assets/models/suzanne.obj?url';
import type { Physics } from '../physics/world';
import { createObjProp } from './obj-prop';

/** Suzanne's height in world units, from her chin to the top of her head. */
export const suzanneHeight = 3;

/**
 * Blender's monkey head, as a dynamic prop. Her origin is at her chin, which
 * she balances on: on her own she topples over, so extra weight just above
 * her chin keeps her upright, rocking when knocked.
 */
export function createSuzanne(physics: Physics, manager?: LoadingManager) {
  return createObjProp(physics, {
    url: suzanneUrl,
    height: suzanneHeight,
    color: 0xb8b8b8,
    // Left of the spawn point, clear of the teapot, turned to face the spawn.
    position: { x: -11, z: 3 },
    rotationY: Math.atan2(11, 7),
    ballastRatio: 4,
  }, manager);
}
