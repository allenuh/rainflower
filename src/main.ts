import './style.css';

import {
  PCFShadowMap,
  PerspectiveCamera,
  WebGLRenderer,
  Vector3,
} from 'three';

import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createEnvironments } from './world/environments';
import { unloadInactiveEnvironment } from './world/environment';
import { createPortalRenderer } from './portals/renderer';
import { createPortalCrossingDetector } from './portals/crossing';
import type { PortalCrossing } from './portals/crossing';
import { traversePortal, updateTrailingCamera, type PortalEndpoint } from './portals/portal';
import { createPortalLifecycle } from './portals/lifecycle';
import { createPhysicsDebug } from './physics/debug';
import { createPlayer, playerEyeHeight } from './player/controller';
import { createPropInteraction } from './player/prop-interaction';
import { pressTextBoxKey } from './ui/text-box';

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

function runWhenIdle(task: () => void) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(task, { timeout: 500 });
  } else {
    setTimeout(task, 100);
  }
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
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyF' || !controls.isLocked || event.repeat) return;
    event.preventDefault();
    // Open, page through or close the text box you're looking at.
    pressTextBoxKey(activeEnvironment.scene, camera);
  });
  renderer.domElement.addEventListener('mousedown', (event) => {
    if (event.button === 0 && controls.isLocked) interaction.throwHeld(camera);
  });
  // Set by a traversal until the rendered camera has crossed too.
  let trailing: { exit: PortalEndpoint; entrance: PortalEndpoint } | undefined;
  const trailingCamera = new PerspectiveCamera();
  let physicsDebug = createPhysicsDebug(activeEnvironment.physics.world);
  activeEnvironment.scene.add(physicsDebug.mesh);

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'F3') return;
    event.preventDefault();
    if (!event.repeat) physicsDebug.mesh.visible = !physicsDebug.mesh.visible;
  });

  if (import.meta.env.DEV) {
    // Playtesting shortcut: send the green sphere back to the drop point, as
    // if it had fallen off the map. Counts toward world 1's vanishing sequence.
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'F4') return;
      event.preventDefault();
      if (!event.repeat) environments.respawnSphere();
    });
  }

  document.addEventListener('visibilitychange', () => {
    resetMovement();
    activeEnvironment.physics.reset();
    player.resetInterpolation();
    portalCrossings.reset(activeEnvironment, player.body.translation());
  });

  // Compile both worlds for both outputs (canvas and portal render target)
  // before the first frame, then again for world 1 once its teapot arrives.
  await portals.prewarm(camera);
  environments.world1AssetsReady
    .then(() => portals.prewarm(camera, [environments.world1]))
    .catch((error) => console.error('Unable to pre-warm late assets:', error));

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
      trailing = { exit: crossing.destination, entrance: crossing.source };
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
    // Right after a traversal the interpolated camera can still be short of
    // the exit plane; draw that frame from the entrance's side instead.
    let viewEnvironment = activeEnvironment;
    let viewCamera = camera;
    if (trailing && !trailing.exit.closed && !trailing.entrance.closed
      && updateTrailingCamera(trailing.exit, trailing.entrance, camera, trailingCamera)) {
      viewEnvironment = trailing.entrance.environment;
      viewCamera = trailingCamera;
    } else {
      trailing = undefined;
    }
    // The portal view updates the other world, so each is updated once.
    viewEnvironment.update(deltaSeconds);
    interaction.update(camera);
    physics.syncMeshes();
    physicsDebug.update();
    // Until the camera has visually arrived, the player is still looking
    // through the entrance, so the return entrance can't close yet.
    if (!trailing && portalLifecycle.update(activeEnvironment, camera)) {
      // Closing hides both ends immediately; tearing down the old world
      // (GPU deletes, freeing its Rapier world) waits until the browser is
      // idle so it never lands on the frame the player crosses.
      portals.dispose();
      const survivor = activeEnvironment;
      runWhenIdle(() => {
        unloadInactiveEnvironment(environments.portalPair, survivor);
        // Render lists can retain objects from the previous main-camera scene.
        renderer.renderLists.dispose();
      });
    }
    portals.render(viewEnvironment, viewCamera, deltaSeconds);
    viewEnvironment.observe(viewCamera);
    renderer.render(viewEnvironment.scene, viewCamera);
    // Props no view could see this frame vanish before the next one.
    environments.world1.afterRender();
    environments.world2.afterRender();
  });
}

start().catch((error) => console.error('Unable to initialize physics:', error));
