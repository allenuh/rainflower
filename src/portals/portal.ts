import { Matrix4, Object3D, type PerspectiveCamera } from 'three';
import type { Environment } from '../world/environments';

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
