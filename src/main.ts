import './style.css';

import {
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';

import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

const scene = new Scene();

const ground = new Mesh(
  new PlaneGeometry(100, 100),
  new MeshBasicMaterial({ color: 0x808080 }),
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

controls.addEventListener('change', () => {
  renderer.render(scene, camera);
});

renderer.render(scene, camera);
