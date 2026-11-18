import {
  Color,
  Fog,
  Mesh,
  MeshPhongMaterial,
  PlaneGeometry,
  Scene,
  type Material,
} from 'three';
import type { Physics } from '../physics/world';
import { createMarbleMaterial } from './marble';
import { createSunsetSky } from './sunset';
import { createWater } from './water';

export function createWorld2(physics: Physics) {
  const scene = new Scene();
  scene.background = new Color('#4a2c1c');
  // Fade distant geometry into the sunset horizon; the skydome opts out of fog.
  scene.fog = new Fog('#dc790f', 70, 200); // Start/end distances in world units.
  const { sky, sunLight, fillLight, sunDirection, sunRadius } = createSunsetSky();
  scene.add(sky, sunLight, sunLight.target, fillLight);

  const upperSize = 75;
  const lowerSize = 500;
  const upperY = 0;
  const lowerY = -2.5;
  const stepHeight = upperY - lowerY;
  const wallCenterY = (upperY + lowerY) / 2;
  const floorMaterial = createMarbleMaterial({ sideTopY: upperY });

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

  addFloor(upperSize, upperSize, upperY, floorMaterial, stepHeight);
  addFloor(lowerSize, lowerSize, lowerY, new MeshPhongMaterial({ color: 0xffffff }));

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
    const endWall = new Mesh(new PlaneGeometry(upperSize, stepHeight), floorMaterial);
    endWall.position.set(0, wallCenterY, sign * upperSize / 2);
    endWall.rotation.y = sign === 1 ? 0 : Math.PI;
    scene.add(endWall);

    const sideWall = new Mesh(new PlaneGeometry(upperSize, stepHeight), floorMaterial);
    sideWall.position.set(sign * upperSize / 2, wallCenterY, 0);
    sideWall.rotation.y = sign * Math.PI / 2;
    scene.add(sideWall);
  }

  return { scene, stepHeight, updateWater: water.update };
}
