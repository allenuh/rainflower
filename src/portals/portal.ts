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
  readonly closed: boolean;
  close: () => void;
  // A hidden endpoint is drawn and traversed as if closed, but can be revealed.
  readonly hidden: boolean;
  hide: () => void;
  reveal: () => void;
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
  let closed = false;
  let hidden = false;
  return {
    environment, anchor, width, height,
    get closed() { return closed; },
    close() {
      closed = true;
      anchor.visible = false;
    },
    get hidden() { return hidden; },
    hide() {
      hidden = true;
      anchor.visible = false;
    },
    reveal() {
      hidden = false;
      anchor.visible = !closed;
    },
  };
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
): boolean {
  if (source.closed || destination.closed) return false;
  const transform = getPortalTransform(source, destination, new Matrix4());
  const position = new Vector3().copy(player.body.translation()).applyMatrix4(transform);
  const previous = new Vector3().copy(player.previousPosition).applyMatrix4(transform);
  const rotation = new Quaternion().setFromRotationMatrix(transform);

  // Map the completed movement's full position, including its overshoot past
  // the threshold, instead of snapping the player to the center of the exit.
  // The interpolation origin is mapped too: the transform is rigid, so the
  // rendered camera continues along the same path instead of jumping to the
  // latest physics pose on the crossing frame.
  player.transferToWorld(destination.environment.physics.world, position, {
    stepHeight: destination.environment.stepHeight,
  }, previous);
  // The main camera has no parent, so its local pose is its world pose.
  camera.position.applyMatrix4(transform);
  camera.quaternion.premultiply(rotation).normalize();
  movementVelocity.applyQuaternion(rotation);
  camera.updateMatrixWorld(true);
  return true;
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

const viewerLocal = new Vector3();

/**
 * The rendered camera trails the physics body by up to one fixed step, so on
 * the frame after a traversal it can still lie behind the exit. Behind the
 * exit corresponds to the entrance's front: the camera hasn't visually
 * crossed yet. Drawing the exit's world from there would replace the world
 * around the entrance, leaving only the exit's edges. Instead, map the camera
 * back so the frame is drawn from the entrance's world, through the entrance.
 * Returns false, leaving `target` untouched, once the camera is in front of
 * the exit.
 */
export function updateTrailingCamera(
  exit: PortalEndpoint,
  entrance: PortalEndpoint,
  viewer: PerspectiveCamera,
  target: PerspectiveCamera,
): boolean {
  viewer.updateWorldMatrix(true, false);
  exit.anchor.updateWorldMatrix(true, false);
  viewerLocal.setFromMatrixPosition(viewer.matrixWorld);
  exit.anchor.worldToLocal(viewerLocal);
  if (viewerLocal.z > 0) return false;
  updatePortalCamera(exit, entrance, viewer, target);
  return true;
}

const projected = new Vector3();

/**
 * Bottom-left-origin pixel rectangle bounding a frustum-clipped polygon
 * (from clipPortalToFrustum) on a `width` x `height` target, padded so
 * bilinear sampling at the opening's edge reads freshly drawn texels.
 */
export function getPortalScissor(
  polygon: readonly Vector3[],
  camera: PerspectiveCamera,
  width: number,
  height: number,
  target: Vector4,
  padding = 1,
): Vector4 {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of polygon) {
    projected.copy(point).project(camera);
    minX = Math.min(minX, projected.x);
    minY = Math.min(minY, projected.y);
    maxX = Math.max(maxX, projected.x);
    maxY = Math.max(maxY, projected.y);
  }
  const left = Math.max(0, Math.floor((minX * 0.5 + 0.5) * width) - padding);
  const bottom = Math.max(0, Math.floor((minY * 0.5 + 0.5) * height) - padding);
  const right = Math.min(width, Math.ceil((maxX * 0.5 + 0.5) * width) + padding);
  const top = Math.min(height, Math.ceil((maxY * 0.5 + 0.5) * height) + padding);
  return target.set(left, bottom, Math.max(0, right - left), Math.max(0, top - bottom));
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
