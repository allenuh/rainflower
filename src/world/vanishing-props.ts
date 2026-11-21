import {
  Box3,
  Frustum,
  Matrix4,
  Vector3,
  type DirectionalLight,
  type Object3D,
  type PerspectiveCamera,
} from 'three';
import type { Physics } from '../physics/world';
import { disposeObjectResources } from './environment';

const frustum = new Frustum();
const viewProjection = new Matrix4();
const bounds = new Box3();
const corner = new Vector3();
const lightDirection = new Vector3();
const lightTarget = new Vector3();
const shadowMin = new Vector3();
const shadowMax = new Vector3();

/**
 * Props that are permanently removed on the first frame no rendered view can
 * see them, like the portal's return entrance closing once out of view.
 *
 * Call observe() with every camera that draws this world in a frame (the main
 * view, portal views), then afterRender() once the frame has been drawn.
 */
export function createVanishingProps(physics: Physics, light: DirectionalLight) {
  const props = new Set<Object3D>();
  const seen = new Set<Object3D>();

  /**
   * World-space box holding the prop and the shadow it casts onto the floor
   * (y = 0): its AABB expanded by its corners projected along the light. The
   * hull of the prop and its floor shadow, which also bounds shadows cast on
   * other props, lies inside it, so neither can be on screen when it's culled.
   */
  function getSightVolume(prop: Object3D, target: Box3) {
    target.setFromObject(prop);
    if (target.isEmpty() || !light.castShadow) return target;

    light.updateWorldMatrix(true, false);
    light.target.updateWorldMatrix(true, false);
    lightDirection.setFromMatrixPosition(light.matrixWorld);
    lightTarget.setFromMatrixPosition(light.target.matrixWorld);
    lightDirection.subVectors(lightTarget, lightDirection).normalize();
    // A light at or below the horizon casts no shadow onto the floor.
    if (lightDirection.y > -1e-3) return target;

    const { min, max } = target;
    shadowMin.copy(min);
    shadowMax.copy(max);
    for (let index = 0; index < 8; index++) {
      corner.set(
        index & 1 ? max.x : min.x,
        index & 2 ? max.y : min.y,
        index & 4 ? max.z : min.z,
      );
      if (corner.y <= 0) continue;
      corner.addScaledVector(lightDirection, corner.y / -lightDirection.y);
      shadowMin.min(corner);
      shadowMax.max(corner);
    }
    min.copy(shadowMin);
    max.copy(shadowMax);
    return target;
  }

  function remove(prop: Object3D) {
    props.delete(prop);
    prop.removeFromParent();
    physics.removeBody(prop);
    disposeObjectResources(prop);
  }

  return {
    add(prop: Object3D) {
      if (!physics.disposed) props.add(prop);
    },

    observe(camera: PerspectiveCamera) {
      if (physics.disposed || props.size === seen.size) return;
      camera.updateWorldMatrix(true, false);
      viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(viewProjection, camera.coordinateSystem);
      for (const prop of props) {
        if (seen.has(prop)) continue;
        if (frustum.intersectsBox(getSightVolume(prop, bounds))) seen.add(prop);
      }
    },

    afterRender() {
      if (physics.disposed) {
        props.clear();
        seen.clear();
        return;
      }
      for (const prop of props) {
        if (!seen.has(prop)) remove(prop);
      }
      seen.clear();
    },
  };
}
