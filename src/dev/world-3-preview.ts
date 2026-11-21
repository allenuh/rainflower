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
  // T toggles the star tint off and back to its starting strength.
  const tintStrength = uniforms.uTintStrength.value;
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'KeyT' || event.repeat) return;
    uniforms.uTintStrength.value = uniforms.uTintStrength.value > 0 ? 0 : tintStrength;
  });
  // 1, 2 and 3 toggle the bright, medium and faint star layers.
  const layerKeys = ['Digit1', 'Digit2', 'Digit3'] as const;
  window.addEventListener('keydown', (event) => {
    const layer = layerKeys.indexOf(event.code as typeof layerKeys[number]);
    if (layer < 0 || event.repeat) return;
    const mask = uniforms.uLayerMask.value;
    mask.setComponent(layer, mask.getComponent(layer) > 0.5 ? 0 : 1);
  });

  // Pixel loupe: crops of the real canvas, magnified without smoothing.
  const captures: { label: string; image: HTMLCanvasElement }[] = [];
  const loupe = document.createElement('canvas');
  loupe.style.cssText = 'position:fixed;inset:0;margin:auto;display:none;image-rendering:pixelated;';
  document.body.appendChild(loupe);

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
    /** Render now and keep a crop of the canvas, in canvas pixels. */
    capture(label: string, x: number, y: number, width: number, height: number) {
      renderer.render(world.scene, camera);
      const image = document.createElement('canvas');
      image.width = width;
      image.height = height;
      image.getContext('2d')!.drawImage(renderer.domElement, x, y, width, height, 0, 0, width, height);
      captures.push({ label, image });
    },
    /** Show the kept crops side by side, magnified `scale` times; none hides. */
    showCaptures(scale = 6) {
      if (!captures.length) {
        loupe.style.display = 'none';
        return;
      }
      const gap = 8;
      const labelHeight = 18;
      const width = captures.reduce((sum, { image }) => sum + image.width * scale + gap, gap);
      const height = Math.max(...captures.map(({ image }) => image.height)) * scale + labelHeight + gap * 2;
      loupe.width = width;
      loupe.height = height;
      const context = loupe.getContext('2d')!;
      context.imageSmoothingEnabled = false;
      context.fillStyle = '#333';
      context.fillRect(0, 0, width, height);
      context.fillStyle = '#fff';
      context.font = '13px monospace';
      let left = gap;
      for (const { label, image } of captures) {
        context.fillText(label, left, gap + 12);
        context.drawImage(image, left, gap + labelHeight, image.width * scale, image.height * scale);
        left += image.width * scale + gap;
      }
      loupe.style.display = 'block';
    },
    clearCaptures() {
      captures.length = 0;
      loupe.style.display = 'none';
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
