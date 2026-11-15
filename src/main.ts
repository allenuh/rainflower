import './style.css';

import {
  Color,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
  Vector3,
} from 'three';

import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import groundVertexShader from './shaders/ground.vert.glsl?raw';
import groundFragmentShader from './shaders/ground.frag.glsl?raw';

const scene = new Scene();

const ground = new Mesh(
  new PlaneGeometry(100, 100),
  new ShaderMaterial({
    vertexShader: groundVertexShader,
    fragmentShader: groundFragmentShader,
    uniforms: {
      uColor: { value: new Color(0x808080) },
    },
  }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const camera = new PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

const renderer = new WebGLRenderer();
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

const player = {
  position: new Vector3(camera.position.x, 0, camera.position.z),
  velocity: new Vector3(),
  eyeHeight: camera.position.y,
};

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
  player.velocity.x = 0;
  player.velocity.z = 0;
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

  // Leave vertical velocity independent for gravity.
  player.velocity.x =
    (right.x * inputDirection.x - forward.x * inputDirection.z) * moveSpeed;
  player.velocity.z =
    (right.z * inputDirection.x - forward.z * inputDirection.z) * moveSpeed;
}

function updatePlayer(deltaSeconds: number) {
  // Future gravity and collision resolution belong here, before camera sync.
  player.position.addScaledVector(player.velocity, deltaSeconds);
}

function animate(time: number) {
  const deltaSeconds = lastTime === undefined
    ? 0
    : Math.min((time - lastTime) / 1000, maxDeltaSeconds);
  lastTime = time;

  updateMovementVelocity();
  updatePlayer(deltaSeconds);

  camera.position.copy(player.position);
  camera.position.y += player.eyeHeight;
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
