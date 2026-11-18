import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3, type Object3D } from 'three';

const fixedTimeStep = 1 / 60;
const maxStepsPerFrame = 5;
const propDensity = 0.05;
const propGravityScale = 2;
const respawnBelowY = -100;
const respawnPosition = { x: 0, y: 40, z: 0 };
const respawnInterval = 1.5;

export async function createPhysics() {
  await RAPIER.init();

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = fixedTimeStep;
  let accumulator = 0;
  let respawnCooldown = 0;
  const objects: {
    mesh: Object3D;
    body: RAPIER.RigidBody;
    previousPosition: Vector3;
    previousRotation: Quaternion;
    initialRotation: Quaternion;
  }[] = [];
  const position = new Vector3();
  const rotation = new Quaternion();
  const currentRotation = new Quaternion();
  const parentRotation = new Quaternion();

  function captureTransforms() {
    for (const object of objects) {
      object.previousPosition.copy(object.body.translation());
      object.previousRotation.copy(object.body.rotation());
    }
  }

  function respawnFallenProp() {
    respawnCooldown = Math.max(0, respawnCooldown - fixedTimeStep);
    if (respawnCooldown > 0) return;
    const object = objects.find(({ body }) => body.isDynamic() && body.translation().y < respawnBelowY);
    if (!object) return;

    object.body.setTranslation(respawnPosition, true);
    object.body.setRotation(object.initialRotation, true);
    object.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    object.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    // Reset interpolation so teleporting doesn't draw a sweep from below the map.
    object.previousPosition.copy(respawnPosition);
    object.previousRotation.copy(object.initialRotation);
    world.propagateModifiedBodyPositionsToColliders();
    // Share the drop point without spawning multiple overlapping bodies.
    respawnCooldown = respawnInterval;
  }

  return {
    world,

    get interpolationAlpha() {
      return accumulator / fixedTimeStep;
    },

    findProp(handle: number) {
      const object = objects.find(({ body }) => body.handle === handle);
      return object ? { mesh: object.mesh, body: object.body } : undefined;
    },

    resetPropInterpolation(handle: number) {
      const object = objects.find(({ body }) => body.handle === handle);
      if (!object) return;
      object.previousPosition.copy(object.body.translation());
      object.previousRotation.copy(object.body.rotation());
    },

    addFloor(width: number, depth: number, surfaceY = 0, thickness = 0.5) {
      // The thickness extends below the visible surface.
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, surfaceY - thickness / 2, 0));
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(width / 2, thickness / 2, depth / 2)
          .setFriction(1)
          .setRestitution(0.05),
        body,
      );
      return body;
    },

    addDynamicBody(mesh: Object3D, colliders: RAPIER.ColliderDesc[]) {
      mesh.getWorldPosition(position);
      mesh.getWorldQuaternion(rotation);
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(position.x, position.y, position.z)
          .setRotation(rotation)
          .setGravityScale(propGravityScale)
          .setLinearDamping(0.6)
          .setAngularDamping(0.5)
          .setCcdEnabled(true),
      );

      // Collider dimensions are local to the body; callers account for mesh scale.
      for (const collider of colliders) {
        world.createCollider(collider.setDensity(propDensity).setFriction(1.9).setRestitution(0.08), body);
      }
      objects.push({
        mesh,
        body,
        previousPosition: position.clone(),
        previousRotation: rotation.clone(),
        initialRotation: rotation.clone(),
      });
      return body;
    },

    update(
      deltaSeconds: number,
      beforeStep?: (deltaSeconds: number) => void,
      afterStep?: (deltaSeconds: number) => boolean | void,
    ) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;

      // Discard excess elapsed time rather than building an unbounded backlog.
      accumulator = Math.min(
        accumulator + deltaSeconds,
        fixedTimeStep * maxStepsPerFrame,
      );

      let steps = 0;
      while (accumulator + Number.EPSILON >= fixedTimeStep) {
        captureTransforms();
        beforeStep?.(fixedTimeStep);
        world.step();
        respawnFallenProp();
        accumulator = Math.max(0, accumulator - fixedTimeStep);
        steps++;
        // A world transition must stop this world's remaining catch-up steps.
        if (afterStep?.(fixedTimeStep) === false) break;
      }
      return steps;
    },

    syncMeshes() {
      // Render between the two latest physics poses instead of jumping at 60 Hz.
      const alpha = accumulator / fixedTimeStep;
      for (const { mesh, body, previousPosition, previousRotation } of objects) {
        position.lerpVectors(previousPosition, body.translation(), alpha);
        currentRotation.copy(body.rotation());
        rotation.slerpQuaternions(previousRotation, currentRotation, alpha);

        if (mesh.parent) {
          mesh.parent.worldToLocal(position);
          mesh.parent.getWorldQuaternion(parentRotation).invert();
          rotation.premultiply(parentRotation);
        }
        mesh.position.copy(position);
        mesh.quaternion.copy(rotation);
      }
    },

    reset() {
      const remainingSeconds = accumulator;
      accumulator = 0;
      captureTransforms();
      return remainingSeconds;
    },

    dispose() {
      objects.length = 0;
      world.free();
    },
  };
}

export type Physics = Awaited<ReturnType<typeof createPhysics>>;
