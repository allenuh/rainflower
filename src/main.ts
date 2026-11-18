import './style.css';

import {
  PCFShadowMap,
  PerspectiveCamera,
  WebGLRenderer,
  Vector3,
} from 'three';

import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createEnvironments } from './world/environments';
import { createPortalRenderer } from './portals/renderer';
import { createPortalCrossingDetector } from './portals/crossing';
import type { PortalCrossing } from './portals/crossing';
import { traversePortal } from './portals/portal';
import { createPortalLifecycle } from './portals/lifecycle';
import { createPhysicsDebug } from './physics/debug';
import { createPlayer, playerEyeHeight } from './player/controller';
import { createPropInteraction } from './player/prop-interaction';

const camera = new PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

const renderer = new WebGLRenderer();
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const controls = new PointerLockControls(camera, renderer.domElement);

renderer.domElement.addEventListener('click', () => {
  if (!controls.isLocked) controls.lock();
});

const moveSpeed = 20;
const maxDeltaSeconds = 0.05;
const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
const pressedKeys = new Set<string>();

const movementVelocity = new Vector3();
const inputDirection = new Vector3();
const forward = new Vector3();
const right = new Vector3();
let lastTime: number | undefined;

window.addEventListener('keydown', (event) => {
  if (!controls.isLocked || !movementKeys.has(event.code)) return;

  event.preventDefault();
  pressedKeys.add(event.code);
});

window.addEventListener('keyup', (event) => {
  pressedKeys.delete(event.code);
});

function resetMovement() {
  pressedKeys.clear();
  movementVelocity.set(0, 0, 0);
  lastTime = undefined;
}

window.addEventListener('blur', resetMovement);
controls.addEventListener('lock', resetMovement);
controls.addEventListener('unlock', resetMovement);

function updateMovementVelocity() {
  inputDirection.set(0, 0, 0);
  if (controls.isLocked) {
    inputDirection.set(
      Number(pressedKeys.has('KeyD')) - Number(pressedKeys.has('KeyA')),
      0,
      Number(pressedKeys.has('KeyS')) - Number(pressedKeys.has('KeyW')),
    ).normalize();
  }

  // Camera right remains horizontal during pointer-lock yaw and pitch.
  right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  forward.crossVectors(camera.up, right).normalize();

  movementVelocity.x =
    (right.x * inputDirection.x - forward.x * inputDirection.z) * moveSpeed;
  movementVelocity.z =
    (right.z * inputDirection.x - forward.z * inputDirection.z) * moveSpeed;
}

async function start() {
  const environments = await createEnvironments();
  let activeEnvironment = environments.world1;
  const portals = createPortalRenderer(renderer, environments.portalPair);
  const portalLifecycle = createPortalLifecycle(environments.portalPair);
  const player = createPlayer(activeEnvironment.physics.world, new Vector3(
    camera.position.x,
    camera.position.y - playerEyeHeight,
    camera.position.z,
  ), { stepHeight: activeEnvironment.stepHeight });
  // Both worlds need their initial colliders registered before movement casts,
  // including the first cast immediately after arriving in a destination.
  for (const environment of [environments.world1, environments.world2]) {
    environment.physics.update(environment.physics.world.timestep);
    environment.physics.reset();
  }
  const portalCrossings = createPortalCrossingDetector(environments.portalPair);
  portalCrossings.reset(activeEnvironment, player.body.translation());
  let interaction = createPropInteraction(activeEnvironment.physics, player.body);
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyE' || !controls.isLocked || event.repeat) return;
    event.preventDefault();
    interaction.pressE(camera);
  });
  renderer.domElement.addEventListener('mousedown', (event) => {
    if (event.button === 0 && controls.isLocked) interaction.throwHeld(camera);
  });
  let physicsDebug = createPhysicsDebug(activeEnvironment.physics.world);
  activeEnvironment.scene.add(physicsDebug.mesh);

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'F3') return;
    event.preventDefault();
    if (!event.repeat) physicsDebug.mesh.visible = !physicsDebug.mesh.visible;
  });

  document.addEventListener('visibilitychange', () => {
    resetMovement();
    activeEnvironment.physics.reset();
    player.resetInterpolation();
    portalCrossings.reset(activeEnvironment, player.body.translation());
  });

  renderer.setAnimationLoop((time: number) => {
    if (document.hidden) return;

    const deltaSeconds = lastTime === undefined
      ? 0
      : Math.min((time - lastTime) / 1000, maxDeltaSeconds);
    lastTime = time;

    updateMovementVelocity();
    let remainingSeconds = deltaSeconds;
    while (true) {
      const physics = activeEnvironment.physics;
      let crossing: PortalCrossing | undefined;
      physics.update(remainingSeconds, (stepSeconds) => {
        player.update(stepSeconds, movementVelocity);
      }, () => {
        crossing = portalCrossings.update(activeEnvironment, player.body.translation());
        if (crossing) return false;
      });
      if (!crossing) break;

      // Hand off unconsumed time so a low frame rate neither skips destination
      // movement nor runs the transferred player against the old physics world.
      remainingSeconds = physics.reset();
      interaction.dropHeld(camera);
      if (!traversePortal(crossing.source, crossing.destination, player, camera, movementVelocity)) break;
      activeEnvironment = crossing.destination.environment;
      activeEnvironment.physics.reset();
      portalCrossings.arriveThrough(crossing.destination, player.body.translation());
      portalLifecycle.arriveThrough(crossing.destination);
      interaction = createPropInteraction(activeEnvironment.physics, player.body);

      const debugVisible = physicsDebug.mesh.visible;
      physicsDebug.mesh.removeFromParent();
      physicsDebug.dispose();
      physicsDebug = createPhysicsDebug(activeEnvironment.physics.world);
      physicsDebug.mesh.visible = debugVisible;
      activeEnvironment.scene.add(physicsDebug.mesh);
      physics.syncMeshes();
      renderer.domElement.dispatchEvent(new CustomEvent('portal-crossing', { detail: crossing }));
    }
    const physics = activeEnvironment.physics;
    player.copyCameraPosition(camera.position, physics.interpolationAlpha);
    activeEnvironment.update(deltaSeconds);
    interaction.update(camera);
    physics.syncMeshes();
    physicsDebug.update();
    portalLifecycle.update(activeEnvironment, camera);
    portals.render(activeEnvironment, camera, deltaSeconds);
    renderer.render(activeEnvironment.scene, camera);
  });
}

start().catch((error) => console.error('Unable to initialize physics:', error));
