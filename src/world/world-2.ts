import {
  Color,
  CubeCamera,
  Fog,
  HalfFloatType,
  LinearMipmapLinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  MeshPhongMaterial,
  PlaneGeometry,
  Scene,
  WebGLCubeRenderTarget,
  type Material,
  type WebGLRenderer,
} from 'three';
import type { Physics } from '../physics/world';
import { createCheckerboardMarbleMaterial } from './marble';
import { createSunsetSky } from './sunset';
import { createWater } from './water';

export function createWorld2(physics: Physics, renderer: WebGLRenderer) {
  const scene = new Scene();
  scene.background = new Color('#4a2c1c');
  // Fade distant geometry into the sunset horizon; the skydome opts out of fog.
  scene.fog = new Fog('#dc790f', 70, 200); // Start/end distances in world units.
  const { sky, sunLight, fillLight, sunDirection, sunRadius } = createSunsetSky();
  scene.add(sky, sunLight, sunLight.target, fillLight);

  const upperWidth = 200;
  const upperDepth = 100;
  const lowerSize = 1000;
  const upperY = 0;
  const lowerY = -2.5;
  const stepHeight = upperY - lowerY;
  const wallCenterY = (upperY + lowerY) / 2;
  const floorMaterial = createCheckerboardMarbleMaterial({
    tileSize: 10, // World units per square; larger values make larger tiles.
    whiteScale: 0.06, // Larger values make the marble details smaller.
    redScale: 0.18,
    sideTopY: upperY,
  });
  const skyEnvironment = captureSkyEnvironment(renderer, sky);
  floorMaterial.envMap = skyEnvironment.texture;
  // All marble faces share this material and the lifetime of its reflection map.
  floorMaterial.addEventListener('dispose', () => skyEnvironment.dispose());

  function addFloor(
    width: number,
    depth: number,
    surfaceY: number,
    material: Material,
    thickness?: number,
  ) {
    const floor = new Mesh(new PlaneGeometry(width, depth), material);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = surfaceY;
    scene.add(floor);
    physics.addFloor(width, depth, surfaceY, thickness);
  }

  addFloor(upperWidth, upperDepth, upperY, floorMaterial, stepHeight);
  addFloor(lowerSize, lowerSize, lowerY, new MeshPhongMaterial({ color: 0x808080 }));

  // Cosmetic water covers the lower floor; the original floor keeps its collider.
  const waterY = upperY - 0.5;
  const water = createWater(lowerSize, lowerSize, waterY, {
    direction: sunDirection,
    radius: sunRadius,
    color: sunLight.color,
  });
  scene.add(water.mesh);

  // Plane normals face outward; each wall joins the two floor elevations.
  for (const sign of [-1, 1]) {
    const endWall = new Mesh(new PlaneGeometry(upperWidth, stepHeight), floorMaterial);
    endWall.position.set(0, wallCenterY, sign * upperDepth / 2);
    endWall.rotation.y = sign === 1 ? 0 : Math.PI;
    scene.add(endWall);

    const sideWall = new Mesh(new PlaneGeometry(upperDepth, stepHeight), floorMaterial);
    sideWall.position.set(sign * upperWidth / 2, wallCenterY, 0);
    sideWall.rotation.y = sign * Math.PI / 2;
    scene.add(sideWall);
  }

  return { scene, stepHeight, updateWater: water.update };
}

function captureSkyEnvironment(renderer: WebGLRenderer, sky: Mesh) {
  const captureScene = new Scene();
  // Capture only the dome, without reparenting the visible sky or the floors.
  captureScene.add(sky.clone());
  const environment = new WebGLCubeRenderTarget(256, {
    type: HalfFloatType,
    colorSpace: LinearSRGBColorSpace,
    generateMipmaps: true,
    minFilter: LinearMipmapLinearFilter,
  });
  try {
    new CubeCamera(0.1, 100, environment).update(renderer, captureScene);
    return environment;
  } catch (error) {
    environment.dispose();
    throw error;
  }
}
