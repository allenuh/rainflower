import { Matrix4, Vector3, type Vector3Like } from 'three';
import type { Environment } from '../world/environments';
import type { PortalEndpoint, PortalPair } from './portal';

export interface PortalCrossing {
  source: PortalEndpoint;
  destination: PortalEndpoint;
  // World-space point on the source plane and fraction of the completed movement.
  point: Vector3;
  fraction: number;
}

/** Track a point crossing the opening; capsule clearance and traversal are separate. */
export function createPortalCrossingDetector(pair: PortalPair) {
  let previousEnvironment: Environment | undefined;
  const previousPosition = new Vector3();
  const previousLocal = new Vector3();
  const currentLocal = new Vector3();
  const inverseAnchor = new Matrix4();

  function reset(environment: Environment, position: Vector3Like) {
    previousEnvironment = environment;
    previousPosition.copy(position);
  }

  return {
    // Reseed after discontinuous movement so a teleport isn't treated as walking.
    reset,

    update(environment: Environment, position: Vector3Like): PortalCrossing | undefined {
      if (previousEnvironment !== environment) {
        reset(environment, position);
        return;
      }

      const source = pair.a.environment === environment ? pair.a
        : pair.b.environment === environment ? pair.b : undefined;
      let crossing: PortalCrossing | undefined;

      if (source) {
        source.anchor.updateWorldMatrix(true, false);
        inverseAnchor.copy(source.anchor.matrixWorld).invert();
        previousLocal.copy(previousPosition).applyMatrix4(inverseAnchor);
        currentLocal.copy(position).applyMatrix4(inverseAnchor);

        // +Z is the entrance front. Landing exactly on the plane counts once.
        if (previousLocal.z > 0 && currentLocal.z <= 0) {
          const fraction = previousLocal.z / (previousLocal.z - currentLocal.z);
          const x = previousLocal.x + (currentLocal.x - previousLocal.x) * fraction;
          const y = previousLocal.y + (currentLocal.y - previousLocal.y) * fraction;
          if (Math.abs(x) <= source.width / 2 && Math.abs(y) <= source.height / 2) {
            crossing = {
              source,
              destination: source === pair.a ? pair.b : pair.a,
              point: new Vector3().lerpVectors(previousPosition, position, fraction),
              fraction,
            };
          }
        }
      }

      previousPosition.copy(position);
      return crossing;
    },
  };
}
