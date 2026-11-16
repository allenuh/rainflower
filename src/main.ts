import './style.css';

import {
  PCFShadowMap,
  PerspectiveCamera,
  WebGLRenderer,
  Vector3,
} from 'three';

import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createWorld2 } from './world/world-2';
import { createPhysics } from './physics/world';
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
  const physics = await createPhysics();
  const { scene, stepHeight } = createWorld2(physics);
  const player = createPlayer(physics.world, new Vector3(
    camera.position.x,
    camera.position.y - playerEyeHeight,
    camera.position.z,
  ), { stepHeight: stepHeight + 0.1 });
  // Register the initial colliders in Rapier's query structures before movement casts.
  physics.update(physics.world.timestep);
  const interaction = createPropInteraction(physics, player.body);
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyE' || !controls.isLocked || event.repeat) return;
    event.preventDefault();
    interaction.pressE(camera);
  });
  renderer.domElement.addEventListener('mousedown', (event) => {
    if (event.button === 0 && controls.isLocked) interaction.throwHeld(camera);
  });
  const physicsDebug = createPhysicsDebug(physics.world);
  scene.add(physicsDebug.mesh);

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'F3') return;
    event.preventDefault();
    if (!event.repeat) physicsDebug.mesh.visible = !physicsDebug.mesh.visible;
  });

  document.addEventListener('visibilitychange', () => {
    resetMovement();
    physics.reset();
    player.resetInterpolation();
  });

  renderer.setAnimationLoop((time: number) => {
    if (document.hidden) return;

    const deltaSeconds = lastTime === undefined
      ? 0
      : Math.min((time - lastTime) / 1000, maxDeltaSeconds);
    lastTime = time;

    updateMovementVelocity();
    physics.update(deltaSeconds, (stepSeconds) => {
      player.update(stepSeconds, movementVelocity);
    });
    player.copyCameraPosition(camera.position, physics.interpolationAlpha);
    interaction.update(camera);
    physics.syncMeshes();
    physicsDebug.update();
    renderer.render(scene, camera);
  });
}

start().catch((error) => console.error('Unable to initialize physics:', error));
