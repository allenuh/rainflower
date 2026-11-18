import { Matrix4, Object3D, Plane, Quaternion, Vector3, Vector4, type PerspectiveCamera } from 'three';
import type { Environment } from '../world/environments';
import type { createPlayer } from '../player/controller';

export interface PortalEndpoint {
  environment: Environment;
  // The opening is centered in local XY; +Z is the outward-facing normal.
  // Anchors and their parents must use rigid transforms with unit scale.
  anchor: Object3D;
  width: number;
  height: number;
}

export interface PortalPair {
  a: PortalEndpoint;
  b: PortalEndpoint;
}

const halfTurn = new Matrix4().makeRotationY(Math.PI);
const exitPlane = new Plane();
const clipPlane = new Vector4();
const farCorner = new Vector4();
const exitClipOffset = 0.01;

export function createPortalEndpoint(
  environment: Environment,
  width: number,
  height: number,
): PortalEndpoint {
  const anchor = new Object3D();
  environment.scene.add(anchor);
  return { environment, anchor, width, height };
}

/** Premultiply a world-space pose by this matrix to map it through the portal. */
export function getPortalTransform(
  source: PortalEndpoint,
  destination: PortalEndpoint,
  target: Matrix4,
): Matrix4 {
  source.anchor.updateWorldMatrix(true, false);
  destination.anchor.updateWorldMatrix(true, false);

  return target.copy(source.anchor.matrixWorld).invert()
    .premultiply(halfTurn)
    .premultiply(destination.anchor.matrixWorld);
}

/** Move the upright player between physics worlds and preserve portal-relative aim/movement. */
export function traversePortal(
  source: PortalEndpoint,
  destination: PortalEndpoint,
  player: ReturnType<typeof createPlayer>,
  camera: PerspectiveCamera,
  movementVelocity: Vector3,
): void {
  const transform = getPortalTransform(source, destination, new Matrix4());
  const position = new Vector3().copy(player.body.translation()).applyMatrix4(transform);
  const rotation = new Quaternion().setFromRotationMatrix(transform);

  // Map the completed movement's full position, including its overshoot past
  // the threshold, instead of snapping the player to the center of the exit.
  player.transferToWorld(destination.environment.physics.world, position, {
    stepHeight: destination.environment.stepHeight,
  });
  camera.quaternion.premultiply(rotation).normalize();
  movementVelocity.applyQuaternion(rotation);
  player.copyCameraPosition(camera.position, 1);
  camera.updateMatrixWorld(true);
}

/** Keep the viewer's lens while moving its complete world-space pose through the pair. */
export function updatePortalCamera(
  source: PortalEndpoint,
  destination: PortalEndpoint,
  viewer: PerspectiveCamera,
  target: PerspectiveCamera,
): void {
  viewer.updateWorldMatrix(true, false);
  getPortalTransform(source, destination, target.matrix).multiply(viewer.matrixWorld);
  target.matrix.decompose(target.position, target.quaternion, target.scale);
  target.updateMatrixWorld(true);

  target.near = viewer.near;
  target.far = viewer.far;
  target.fov = viewer.fov;
  target.aspect = viewer.aspect;
  target.zoom = viewer.zoom;
  target.layers.mask = viewer.layers.mask;
  // Copy the actual matrices, including any asymmetric lens/view offsets.
  target.projectionMatrix.copy(viewer.projectionMatrix);
  target.projectionMatrixInverse.copy(viewer.projectionMatrixInverse);
}

/** Apply after updatePortalCamera; keep only the exit's outward (+Z) half-space. */
export function clipPortalCamera(
  destination: PortalEndpoint,
  camera: PerspectiveCamera,
): boolean {
  destination.anchor.updateWorldMatrix(true, false);
  camera.updateWorldMatrix(true, false);
  // Move the plane slightly into the destination to avoid showing the exit edge.
  exitPlane.setComponents(0, 0, 1, -exitClipOffset)
    .applyMatrix4(destination.anchor.matrixWorld)
    .applyMatrix4(camera.matrixWorldInverse);
  clipPlane.set(exitPlane.normal.x, exitPlane.normal.y, exitPlane.normal.z, exitPlane.constant);

  // Lengyel's oblique near-plane projection. Using the inverse also handles
  // asymmetric lenses; x/y projection and the perspective divide stay unchanged.
  farCorner.set(Math.sign(clipPlane.x), Math.sign(clipPlane.y), 1, 1)
    .applyMatrix4(camera.projectionMatrixInverse);
  const denominator = clipPlane.dot(farCorner);
  // No retained geometry lies inside this view's far plane. Avoid inverting
  // a degenerate projection when the player is looking away from the opening.
  if (denominator <= 1e-6) return false;
  clipPlane.multiplyScalar(2 / denominator);

  const projection = camera.projectionMatrix.elements;
  projection[2] = clipPlane.x - projection[3];
  projection[6] = clipPlane.y - projection[7];
  projection[10] = clipPlane.z - projection[11];
  projection[14] = clipPlane.w - projection[15];
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return true;
}
