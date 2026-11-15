import { Scene, WebGLRenderer } from 'three';

const scene = new Scene();

const renderer = new WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
