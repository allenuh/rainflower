import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion, Vector3, type Object3D, type Vector3Like } from 'three';

const fixedTimeStep = 1 / 60;
const maxStepsPerFrame = 5;
const propDensity = 0.05;
// Twice Earth's gravity; the player falls under this, props under propGravityScale times it.
const gravity = -9.81 * 2;
const propGravityScale = 2;
const respawnBelowY = -100;
const respawnPosition = { x: 0, y: 40, z: 0 };
const respawnInterval = 1.5;

/**
 * Collision group bits. Rapier packs a collider's groups as
 * `(membership << 16) | filter`; two colliders interact only when each one's
 * membership intersects the other's filter. Colliders default to every bit,
 * so the player's capsule is a PLAYER member without opting in.
 */
export const PLAYER = 1 << 0;
export const BARRIER = 1 << 1;
const allGroups = 0xffff;
// Props ignore player barriers, so they can still leave a bounded area.
const propGroups = (allGroups << 16) | (allGroups & ~BARRIER);
// Barriers block only the player.
const barrierGroups = (BARRIER << 16) | PLAYER;

export interface PlayerBarrier {
  position: Vector3Like;
  halfExtents: Vector3Like;
  rotation?: RAPIER.Rotation;
}

export async function createPhysics() {
  await RAPIER.init();

  const world = new RAPIER.World({ x: 0, y: gravity, z: 0 });
  world.timestep = fixedTimeStep;
  let accumulator = 0;
  let respawnCooldown = 0;
  let disposed = false;
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
  const respawnListeners = new Set<(mesh: Object3D) => void>();

  function captureTransforms() {
    for (const object of objects) {
      object.previousPosition.copy(object.body.translation());
      object.previousRotation.copy(object.body.rotation());
    }
  }

  /**
   * An invisible, fixed cuboid wall that blocks only the player; props pass
   * through it. Shown only by the physics debug view.
   */
  function addPlayerBarrier({ position, halfExtents, rotation = { x: 0, y: 0, z: 0, w: 1 } }: PlayerBarrier) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed()
      .setTranslation(position.x, position.y, position.z)
      .setRotation(rotation));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        .setFriction(0)
        .setCollisionGroups(barrierGroups),
      body,
    );
    return body;
  }

  function respawnFallenProp() {
    respawnCooldown = Math.max(0, respawnCooldown - fixedTimeStep);
    if (respawnCooldown > 0) return;
    const object = objects.find(({ body }) => body.isDynamic() && body.translation().y < respawnBelowY);
    if (!object) return;
    respawnObject(object);
  }

  function respawnObject(object: (typeof objects)[number]) {
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
    for (const listener of respawnListeners) listener(object.mesh);
  }

  return {
    world,
    get disposed() { return disposed; },

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

    addPlayerBarrier,

    /**
     * Wall the player into a `width` x `depth` rectangle centered on `center`
     * (x/z), rising from `surfaceY`: four player barriers whose inner faces lie
     * exactly on its edges. Match a floor made by addFloor with the same size.
     */
    addPlayerBounds(
      width: number,
      depth: number,
      { center = { x: 0, z: 0 }, surfaceY = 0, height = 50, thickness = 1 }: {
        center?: { x: number; z: number };
        surfaceY?: number;
        height?: number;
        thickness?: number;
      } = {},
    ) {
      const y = surfaceY + height / 2;
      const halfHeight = height / 2;
      const halfThickness = thickness / 2;
      // The X walls span the corners so there are no gaps where walls meet.
      const xOffset = width / 2 + halfThickness;
      const zOffset = depth / 2 + halfThickness;
      return [
        { x: xOffset, z: 0, halfX: halfThickness, halfZ: depth / 2 + thickness },
        { x: -xOffset, z: 0, halfX: halfThickness, halfZ: depth / 2 + thickness },
        { x: 0, z: zOffset, halfX: width / 2, halfZ: halfThickness },
        { x: 0, z: -zOffset, halfX: width / 2, halfZ: halfThickness },
      ].map(({ x, z, halfX, halfZ }) => addPlayerBarrier({
        position: { x: center.x + x, y, z: center.z + z },
        halfExtents: { x: halfX, y: halfHeight, z: halfZ },
      }));
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
        world.createCollider(collider
          .setDensity(propDensity)
          .setFriction(1.9)
          .setRestitution(0.08)
          .setCollisionGroups(propGroups), body);
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

    /** Listen for props sent back to the drop point; returns an unsubscribe. */
    onRespawn(listener: (mesh: Object3D) => void) {
      respawnListeners.add(listener);
      return () => { respawnListeners.delete(listener); };
    },

    /** Send a dynamic prop to the drop point now, as if it had fallen. */
    respawn(mesh: Object3D) {
      if (disposed) return false;
      const object = objects.find((candidate) => candidate.mesh === mesh);
      if (!object || !object.body.isDynamic()) return false;
      respawnObject(object);
      return true;
    },

    /** Remove a prop's body (and its colliders) from the simulation. */
    removeBody(mesh: Object3D) {
      if (disposed) return false;
      const index = objects.findIndex((object) => object.mesh === mesh);
      if (index === -1) return false;
      world.removeRigidBody(objects[index].body);
      objects.splice(index, 1);
      return true;
    },

    update(
      deltaSeconds: number,
      beforeStep?: (deltaSeconds: number) => void,
      afterStep?: (deltaSeconds: number) => boolean | void,
    ) {
      if (disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;

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
      if (disposed) return 0;
      const remainingSeconds = accumulator;
      accumulator = 0;
      captureTransforms();
      return remainingSeconds;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      accumulator = 0;
      objects.length = 0;
      respawnListeners.clear();
      world.free();
    },
  };
}

export type Physics = Awaited<ReturnType<typeof createPhysics>>;
