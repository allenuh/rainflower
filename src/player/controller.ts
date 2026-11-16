import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3, type Vector3Like } from 'three';

export const playerEyeHeight = 5;
const capsuleHeight = 5.5;
const capsuleRadius = 0.5;
const contactOffset = 0.02;

export function createPlayer(world: RAPIER.World, spawnFeet: Vector3Like) {
  const centerHeight = capsuleHeight / 2;
  const eyeOffset = playerEyeHeight - centerHeight;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(spawnFeet.x, spawnFeet.y + centerHeight + contactOffset, spawnFeet.z)
      .lockRotations(),
  );
  const collider = world.createCollider(
    // Rapier's half-height excludes the two rounded end caps.
    RAPIER.ColliderDesc.capsule(centerHeight - capsuleRadius, capsuleRadius).setMass(80),
    body,
  );
  const controller = world.createCharacterController(contactOffset);
  controller.setSlideEnabled(true);
  controller.setMaxSlopeClimbAngle(Math.PI / 4);
  controller.setMinSlopeSlideAngle(Math.PI / 4);
  controller.enableSnapToGround(0.2);
  controller.disableAutostep();
  controller.setApplyImpulsesToDynamicBodies(false);

  const previousPosition = new Vector3().copy(body.translation());
  const desiredMovement = new Vector3();
  const correctedMovement = new Vector3();
  const nextPosition = new Vector3();
  let verticalVelocity = 0;
  let grounded = false;

  return {
    body,
    collider,

    get grounded() {
      return grounded;
    },

    update(deltaSeconds: number, horizontalVelocity: Vector3Like) {
      previousPosition.copy(body.translation());

      // Kinematic bodies need their gravity integrated explicitly.
      verticalVelocity += world.gravity.y * deltaSeconds;
      desiredMovement.set(
        horizontalVelocity.x * deltaSeconds,
        verticalVelocity * deltaSeconds,
        horizontalVelocity.z * deltaSeconds,
      );

      controller.computeColliderMovement(
        collider,
        desiredMovement,
        RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        (obstacle) => obstacle.handle !== collider.handle,
      );
      controller.computedMovement(correctedMovement);
      grounded = controller.computedGrounded();
      if (grounded && verticalVelocity < 0) verticalVelocity = 0;

      nextPosition.copy(body.translation()).add(correctedMovement);
      body.setNextKinematicTranslation(nextPosition);
    },

    copyCameraPosition(target: Vector3, alpha: number) {
      target.lerpVectors(previousPosition, body.translation(), alpha);
      target.y += eyeOffset;
      return target;
    },

    resetInterpolation() {
      previousPosition.copy(body.translation());
    },

    dispose() {
      world.removeCharacterController(controller);
      world.removeRigidBody(body);
    },
  };
}
