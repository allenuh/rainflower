import { Frustum, Matrix4, Vector3, type PerspectiveCamera } from 'three';
import type { Environment } from '../world/environments';
import type { PortalEndpoint, PortalPair } from './portal';

export function createPortalLifecycle(pair: PortalPair) {
  let returnEntrance: PortalEndpoint | undefined;
  const frustum = new Frustum();
  const viewProjection = new Matrix4();

  function isInFrustum(entrance: PortalEndpoint, viewer: PerspectiveCamera) {
    viewer.updateWorldMatrix(true, false);
    entrance.anchor.updateWorldMatrix(true, false);
    viewProjection.multiplyMatrices(viewer.projectionMatrix, viewer.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjection, viewer.coordinateSystem);

    const halfWidth = entrance.width / 2;
    const halfHeight = entrance.height / 2;
    let polygon = [
      new Vector3(-halfWidth, -halfHeight, 0),
      new Vector3(halfWidth, -halfHeight, 0),
      new Vector3(halfWidth, halfHeight, 0),
      new Vector3(-halfWidth, halfHeight, 0),
    ].map((corner) => corner.applyMatrix4(entrance.anchor.matrixWorld));

    // Clip the actual rectangle against all six planes. A center/corner-only
    // test would incorrectly close partially visible or screen-filling portals.
    for (const plane of frustum.planes) {
      const clipped: Vector3[] = [];
      let previous = polygon[polygon.length - 1];
      let previousDistance = plane.distanceToPoint(previous) + 1e-6;
      for (const point of polygon) {
        const distance = plane.distanceToPoint(point) + 1e-6;
        if ((distance >= 0) !== (previousDistance >= 0)) {
          clipped.push(new Vector3().lerpVectors(previous, point,
            previousDistance / (previousDistance - distance)));
        }
        if (distance >= 0) clipped.push(point);
        previous = point;
        previousDistance = distance;
      }
      if (clipped.length === 0) return false;
      polygon = clipped;
    }
    return true;
  }

  return {
    get closed() { return pair.a.closed || pair.b.closed; },

    arriveThrough(exit: PortalEndpoint) {
      if (pair.a.closed || pair.b.closed) return;
      returnEntrance = exit;
    },

    // Returns true only on the frame that permanently closes the connection.
    update(environment: Environment, viewer: PerspectiveCamera): boolean {
      if (!returnEntrance || returnEntrance.environment !== environment
        || pair.a.closed || pair.b.closed) return false;
      if (isInFrustum(returnEntrance, viewer)) return false;

      pair.a.close();
      pair.b.close();
      returnEntrance = undefined;
      return true;
    },
  };
}
