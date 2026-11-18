import RAPIER from '@dimforge/rapier3d-compat';
import { Box3, Quaternion, Vector3, type Camera } from 'three';
import type { Physics } from '../physics/world';

const pickupRange = 10;
const throwSpeed = 28;
type Prop = NonNullable<ReturnType<Physics['findProp']>>;

export function createPropInteraction(physics: Physics, playerBody: RAPIER.RigidBody) {
  const { world } = physics;
  const eye = new Vector3();
  const direction = new Vector3();
  const viewRotation = new Quaternion();
  const rotation = new Quaternion();
  const position = new Vector3();
  const offset = new Vector3();
  let held: {
    prop: Prop;
    distance: number;
    centerOffset: Vector3;
    relativeRotation: Quaternion;
    colliders: { collider: RAPIER.Collider; enabled: boolean }[];
  } | undefined;

  function readView(camera: Camera) {
    camera.getWorldPosition(eye);
    camera.getWorldDirection(direction);
    camera.getWorldQuaternion(viewRotation);
  }

  function findTarget() {
    const hit = world.castRay(
      new RAPIER.Ray(eye, direction), pickupRange, true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, playerBody,
    );
    const body = hit?.collider.parent();
    return body?.isDynamic() ? physics.findProp(body.handle) : undefined;
  }

  function pickUp(prop: Prop) {
    const { body, mesh } = prop;
    const bounds = new Box3().setFromObject(mesh, true);
    const radius = bounds.getSize(new Vector3()).length() / 2;
    const bodyRotation = new Quaternion().copy(body.rotation());
    const centerOffset = bounds.getCenter(new Vector3()).sub(body.translation())
      .applyQuaternion(bodyRotation.clone().invert());
    const colliders = Array.from({ length: body.numColliders() }, (_, index) => {
      const collider = body.collider(index);
      return {
        collider,
        enabled: collider.isEnabled(),
      };
    });
    held = {
      prop, centerOffset, colliders,
      distance: Math.max(4, radius + 1.5),
      relativeRotation: viewRotation.clone().invert().multiply(bodyRotation),
    };
    for (const { collider } of colliders) collider.setEnabled(false);
    body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.resetForces(true);
    body.resetTorques(true);
  }

  function followView() {
    if (!held) return;
    rotation.copy(viewRotation).multiply(held.relativeRotation);
    offset.copy(held.centerOffset).applyQuaternion(rotation);
    position.copy(eye).addScaledVector(direction, held.distance).sub(offset);
    const { body } = held.prop;
    body.setTranslation(position, true);
    body.setRotation(rotation, true);
    body.setNextKinematicTranslation(position);
    body.setNextKinematicRotation(rotation);
    physics.resetPropInterpolation(body.handle);
  }

  function release(camera: Camera, throwing: boolean) {
    if (!held) return false;
    readView(camera);
    followView();
    const { body } = held.prop;
    body.setTranslation(position, true);
    body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    for (const { collider, enabled } of held.colliders) collider.setEnabled(enabled);
    body.setLinvel(throwing ? direction.clone().multiplyScalar(throwSpeed) : { x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    physics.resetPropInterpolation(body.handle);
    world.propagateModifiedBodyPositionsToColliders();
    held = undefined;
    return true;
  }

  return {
    get holding() { return !!held; },

    pressE(camera: Camera) {
      if (held) { release(camera, false); return; }
      readView(camera);
      const target = findTarget();
      if (!target) return;
      pickUp(target);
      followView();
    },

    throwHeld(camera: Camera) {
      return release(camera, true);
    },

    dropHeld(camera: Camera) {
      return release(camera, false);
    },

    update(camera: Camera) {
      if (!held) return;
      readView(camera);
      followView();
    },
  };
}
