import RAPIER from '@dimforge/rapier3d-compat';
import { Vector3, type Vector3Like } from 'three';

export const playerEyeHeight = 5;
const capsuleHeight = 5.5;
const capsuleRadius = 0.5;
const contactOffset = 0.02;
const stalledFloorNudge = 0.05;
const playerMass = 80;
const pushAcceleration = 12;
const centerHeight = capsuleHeight / 2;
type PlayerOptions = { stepHeight?: number };

function createPlayerPhysics(
  world: RAPIER.World,
  center: Vector3Like,
  options: PlayerOptions,
) {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(center.x, center.y, center.z)
      .lockRotations(),
  );
  const collider = world.createCollider(
    // Rapier's half-height excludes the two rounded end caps.
    RAPIER.ColliderDesc.capsule(centerHeight - capsuleRadius, capsuleRadius).setMass(playerMass),
    body,
  );
  const controller = world.createCharacterController(contactOffset);
  controller.setSlideEnabled(true);
  controller.setMaxSlopeClimbAngle(Math.PI / 4);
  controller.setMinSlopeSlideAngle(Math.PI / 4);
  controller.enableSnapToGround(0.2);
  if (options.stepHeight !== undefined) {
    controller.enableAutostep(options.stepHeight, 0.2, false);
  } else {
    controller.disableAutostep();
  }
  // Apply our bounded impulses below instead of also applying automatic impulses.
  controller.setApplyImpulsesToDynamicBodies(false);

  return { body, collider, controller };
}

export function createPlayer(
  world: RAPIER.World,
  spawnFeet: Vector3Like,
  options: PlayerOptions = {},
) {
  const eyeOffset = playerEyeHeight - centerHeight;
  let { body, collider, controller } = createPlayerPhysics(world, {
    x: spawnFeet.x,
    y: spawnFeet.y + centerHeight + contactOffset,
    z: spawnFeet.z,
  }, options);

  const previousPosition = new Vector3().copy(body.translation());
  const desiredMovement = new Vector3();
  const correctedMovement = new Vector3();
  const nextPosition = new Vector3();
  const pushDirection = new Vector3();
  const impulse = new Vector3();
  const pushedBodies = new Set<number>();
  let verticalVelocity = 0;
  let grounded = false;
  let normalNudge = controller.normalNudgeFactor();

  function computeMovement() {
    controller.computeColliderMovement(
      collider,
      desiredMovement,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      (obstacle) => obstacle.handle !== collider.handle,
    );
    controller.computedMovement(correctedMovement);
  }

  function pushObjects(deltaSeconds: number, horizontalVelocity: Vector3Like) {
    pushedBodies.clear();
    let remainingImpulse = playerMass * pushAcceleration * deltaSeconds;

    for (let index = 0; index < controller.numComputedCollisions() && remainingImpulse > 0; index++) {
      const collision = controller.computedCollision(index);
      const obstacle = collision?.collider;
      const object = obstacle?.parent();
      if (!collision || !object?.isDynamic() || pushedBodies.has(object.handle)) continue;

      // Ignore supporting surfaces and undersides; walking must not kick props upwards.
      if (Math.abs(collision.normal1.y) > 0.7) continue;
      pushDirection.set(-collision.normal1.x, 0, -collision.normal1.z).normalize();
      const approachSpeed = horizontalVelocity.x * pushDirection.x
        + horizontalVelocity.z * pushDirection.z;
      if (approachSpeed <= 0) continue;

      const velocity = object.linvel();
      const currentSpeed = velocity.x * pushDirection.x + velocity.z * pushDirection.z;
      const speedIncrease = approachSpeed - currentSpeed;
      if (speedIncrease <= 0) continue;

      const magnitude = Math.min(object.mass() * speedIncrease, remainingImpulse);
      if (magnitude <= 0) continue;

      // Center-of-mass impulses avoid abrupt spin. Floor friction still produces rolling.
      object.applyImpulse(impulse.copy(pushDirection).multiplyScalar(magnitude), true);
      remainingImpulse -= magnitude;
      pushedBodies.add(object.handle);
    }
  }

  return {
    get body() { return body; },
    get collider() { return collider; },

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

      computeMovement();
      // A shallow cast against a large flat floor can stall on a support contact.
      // Retry with more clearance only when that contact is the sole obstruction.
      if (
        Math.hypot(correctedMovement.x, correctedMovement.z)
          < Math.hypot(desiredMovement.x, desiredMovement.z) * 0.5
        && controller.numComputedCollisions() === 1
        && (controller.computedCollision(0)?.normal1.y ?? 0) > 0.999
      ) {
        controller.setNormalNudgeFactor(stalledFloorNudge);
        computeMovement();
        controller.setNormalNudgeFactor(normalNudge);
      }
      grounded = controller.computedGrounded();
      if (grounded && verticalVelocity < 0) verticalVelocity = 0;
      pushObjects(deltaSeconds, horizontalVelocity);

      nextPosition.copy(body.translation()).add(correctedMovement);
      body.setNextKinematicTranslation(nextPosition);
    },

    copyCameraPosition(target: Vector3, alpha: number) {
      target.lerpVectors(previousPosition, body.translation(), alpha);
      target.y += eyeOffset;
      return target;
    },

    /** Body center at the start of the latest physics step (interpolation origin). */
    get previousPosition(): Readonly<Vector3> {
      return previousPosition;
    },

    resetInterpolation() {
      previousPosition.copy(body.translation());
    },

    /**
     * Pass `previousCenter` (the interpolation origin mapped into the
     * destination) to keep the rendered camera continuous across the switch;
     * omitting it snaps interpolation to the new center.
     */
    transferToWorld(
      destination: RAPIER.World,
      center: Vector3Like,
      options: PlayerOptions = {},
      previousCenter?: Vector3Like,
    ) {
      // Rapier bodies belong to one world. Recreate the capsule/controller while
      // preserving the player's integrated falling speed across upright portals.
      const next = createPlayerPhysics(destination, center, options);
      world.removeCharacterController(controller);
      world.removeRigidBody(body);
      world = destination;
      ({ body, collider, controller } = next);
      normalNudge = controller.normalNudgeFactor();
      grounded = false;
      previousPosition.copy(previousCenter ?? body.translation());
      world.propagateModifiedBodyPositionsToColliders();
    },

    dispose() {
      world.removeCharacterController(controller);
      world.removeRigidBody(body);
    },
  };
}
