// TEMPORARY dev-only preview of world 3 until it has a portal; served at
// /world-3.html. Delete this file and world-3.html when world 3 joins
// environments.ts. Movement is a trimmed copy of main.ts, without portals.
import '../style.css';

import { MathUtils, PerspectiveCamera, Vector3, WebGLRenderer } from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createPhysics } from '../physics/world';
import { createPlayer, playerEyeHeight } from '../player/controller';
import { createWorld3 } from '../world/world-3';

const camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 5, 10);

// Match main.ts (no setPixelRatio) so pixel-sized stars look as they do in game.
const renderer = new WebGLRenderer();
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
window.addEventListener('keyup', (event) => pressedKeys.delete(event.code));

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
  right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  forward.crossVectors(camera.up, right).normalize();
  movementVelocity.x = (right.x * inputDirection.x - forward.x * inputDirection.z) * moveSpeed;
  movementVelocity.z = (right.z * inputDirection.x - forward.z * inputDirection.z) * moveSpeed;
}

async function start() {
  const physics = await createPhysics();
  const world = createWorld3(physics);
  const player = createPlayer(physics.world, new Vector3(
    camera.position.x,
    camera.position.y - playerEyeHeight,
    camera.position.z,
  ));
  physics.update(physics.world.timestep);
  physics.reset();

  const { uniforms } = world.starfield;
  // C toggles the debug view of the star lattice cells.
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyC' || event.repeat) return;
    uniforms.uDebugCells.value = uniforms.uDebugCells.value > 0.5 ? 0 : 1;
  });

  // Screenshot helpers: aim without pointer lock and tweak uniforms live.
  (window as unknown as { __preview: unknown }).__preview = {
    camera,
    uniforms,
    look(yawDegrees: number, pitchDegrees: number) {
      camera.rotation.set(
        MathUtils.degToRad(pitchDegrees),
        MathUtils.degToRad(yawDegrees),
        0,
        'YXZ',
      );
    },
  };

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
    renderer.render(world.scene, camera);
  });
}

start().catch((error) => console.error('Unable to start the world 3 preview:', error));
