import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3, type Object3D } from 'three';

const fixedTimeStep = 1 / 60;
const maxStepsPerFrame = 5;

export async function createPhysics() {
  await RAPIER.init();

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = fixedTimeStep;
  let accumulator = 0;
  const objects: {
    mesh: Object3D;
    body: RAPIER.RigidBody;
    previousPosition: Vector3;
    previousRotation: Quaternion;
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

  return {
    world,

    get interpolationAlpha() {
      return accumulator / fixedTimeStep;
    },

    addFloor(width: number, depth: number) {
      // Its top is y = 0; the thickness extends below the visible floor.
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.25, 0));
      world.createCollider(
        RAPIER.ColliderDesc.cuboid(width / 2, 0.25, depth / 2)
          .setFriction(0.7)
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
          .setLinearDamping(0.05)
          .setAngularDamping(0.1)
          .setCcdEnabled(true),
      );

      // Collider dimensions are local to the body; callers account for mesh scale.
      for (const collider of colliders) {
        world.createCollider(collider.setDensity(1).setFriction(0.6).setRestitution(0.08), body);
      }
      objects.push({
        mesh,
        body,
        previousPosition: position.clone(),
        previousRotation: rotation.clone(),
      });
      return body;
    },

    update(deltaSeconds: number, beforeStep?: (deltaSeconds: number) => void) {
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
        accumulator = Math.max(0, accumulator - fixedTimeStep);
        steps++;
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
      accumulator = 0;
      captureTransforms();
    },

    dispose() {
      objects.length = 0;
      world.free();
    },
  };
}

export type Physics = Awaited<ReturnType<typeof createPhysics>>;
