import { Frustum, Matrix4, Vector3, type PerspectiveCamera } from 'three';
import type { Environment } from '../world/environments';
import type { PortalEndpoint, PortalPair } from './portal';

const frustum = new Frustum();
const viewProjection = new Matrix4();

/**
 * Clip the opening's rectangle against all six planes of the camera frustum
 * and return the visible world-space polygon (empty when none of it is in
 * view). A center/corner-only test would wrongly reject partially visible or
 * screen-filling openings.
 */
export function clipPortalToFrustum(endpoint: PortalEndpoint, camera: PerspectiveCamera): Vector3[] {
  camera.updateWorldMatrix(true, false);
  endpoint.anchor.updateWorldMatrix(true, false);
  viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(viewProjection, camera.coordinateSystem);

  const halfWidth = endpoint.width / 2;
  const halfHeight = endpoint.height / 2;
  let polygon = [
    new Vector3(-halfWidth, -halfHeight, 0),
    new Vector3(halfWidth, -halfHeight, 0),
    new Vector3(halfWidth, halfHeight, 0),
    new Vector3(-halfWidth, halfHeight, 0),
  ].map((corner) => corner.applyMatrix4(endpoint.anchor.matrixWorld));

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
    if (clipped.length === 0) return clipped;
    polygon = clipped;
  }
  return polygon;
}

/**
 * The opening counterpart of closing: a hidden pair appears only on a frame
 * where no view could see `entrance`. Call observe() with every camera that
 * draws the entrance's world, then afterRender() once the frame is drawn.
 */
export function createPortalReveal(pair: PortalPair, entrance: PortalEndpoint) {
  let seen = false;

  return {
    observe(viewer: PerspectiveCamera) {
      if (!seen && entrance.hidden && clipPortalToFrustum(entrance, viewer).length > 0) seen = true;
    },

    // Returns true only on the frame that reveals the pair.
    afterRender(ready: boolean): boolean {
      const reveal = ready && !seen && entrance.hidden && !pair.a.closed && !pair.b.closed;
      seen = false;
      if (!reveal) return false;
      pair.a.reveal();
      pair.b.reveal();
      return true;
    },
  };
}

export function createPortalLifecycle(pair: PortalPair) {
  let returnEntrance: PortalEndpoint | undefined;

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
      if (clipPortalToFrustum(returnEntrance, viewer).length > 0) return false;

      pair.a.close();
      pair.b.close();
      returnEntrance = undefined;
      return true;
    },
  };
}
