import { Color, HemisphereLight, Mesh, MeshPhongMaterial, PlaneGeometry, Scene } from 'three';
import type { Physics } from '../physics/world';

export function createWorld2(physics: Physics) {
  const scene = new Scene();
  scene.background = new Color(0x000000);
  scene.add(new HemisphereLight(0xffffff, 0x444444, 2));

  const upperWidth = 200;
  const upperDepth = 100;
  const lowerSize = 500;
  const upperY = 0;
  const lowerY = -2.5;
  const stepHeight = upperY - lowerY;
  const wallCenterY = (upperY + lowerY) / 2;
  const material = new MeshPhongMaterial({ color: 0x808080 });

  function addFloor(width: number, depth: number, surfaceY: number, thickness?: number) {
    const floor = new Mesh(new PlaneGeometry(width, depth), material);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = surfaceY;
    scene.add(floor);
    physics.addFloor(width, depth, surfaceY, thickness);
  }

  addFloor(upperWidth, upperDepth, upperY, stepHeight);
  addFloor(lowerSize, lowerSize, lowerY);

  // Plane normals face outward; each wall joins the two floor elevations.
  for (const sign of [-1, 1]) {
    const endWall = new Mesh(new PlaneGeometry(upperWidth, stepHeight), material);
    endWall.position.set(0, wallCenterY, sign * upperDepth / 2);
    endWall.rotation.y = sign === 1 ? 0 : Math.PI;
    scene.add(endWall);

    const sideWall = new Mesh(new PlaneGeometry(upperDepth, stepHeight), material);
    sideWall.position.set(sign * upperWidth / 2, wallCenterY, 0);
    sideWall.rotation.y = sign * Math.PI / 2;
    scene.add(sideWall);
  }

  return { scene, stepHeight };
}
