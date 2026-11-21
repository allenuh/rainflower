import {
  AmbientLight,
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshPhongMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  ShadowMaterial,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
  type ColorRepresentation,
} from 'three';
import { createPrimitiveColliders } from '../physics/colliders';
import type { Physics } from '../physics/world';

export function createPrimitives(physics: Physics) {
  const group = new Group();
  const shapes: Mesh[] = [];

  function addShape(
    geometry: BufferGeometry,
    color: ColorRepresentation,
    x: number,
    y: number,
    z: number,
  ) {
    const mesh = new Mesh(geometry, new MeshPhongMaterial({
      color,
      specular: 0xffffff,
      shininess: 100,
    }));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    shapes.push(mesh);
    return mesh;
  }

  const sphere = addShape(new SphereGeometry(2, 32, 24), 0x15df35, -15, 2, -10);
  const cone = addShape(new ConeGeometry(3.125, 6.25, 64), 0x153bff, 35, 3.125, -20);
  const cylinder = addShape(new CylinderGeometry(2.5, 2.5, 4.5, 32), 0xff1818, 3, 2.25, -1);
  const cube = addShape(new BoxGeometry(4.5, 4.5, 4.5), 0xb020ff, 6.5, 2.25, -26);
  cube.rotation.y = Math.PI / 6;

  const ring = addShape(new TorusGeometry(2, 0.625, 12, 48), 0x00ddff, -15, 6, -31);
  ring.rotation.set(Math.PI / 5, Math.PI / 6, -Math.PI / 8);
  const diamond = addShape(new OctahedronGeometry(2.625), 0xffcc00, 13, 12, -17);
  diamond.rotation.set(0.2, Math.PI / 4, 0.2);

  // Register after applying the initial rotations. Every current prop is dynamic.
  for (const mesh of shapes) {
    physics.addDynamicBody(mesh, createPrimitiveColliders(mesh.geometry));
  }

  group.add(new AmbientLight(0xffffff, 0.2));

  const keyLight = new DirectionalLight(0xffffff, 2.5);
  keyLight.position.set(-8, 14, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.left = -20;
  keyLight.shadow.camera.right = 20;
  keyLight.shadow.camera.top = 20;
  keyLight.shadow.camera.bottom = -20;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 60;
  keyLight.shadow.normalBias = 0.03;
  group.add(keyLight);

  // Receive shadows without changing the checkerboard's custom shader.
  const shadows = new Mesh(
    new PlaneGeometry(100, 100),
    new ShadowMaterial({ opacity: 0.55 }),
  );
  shadows.rotation.x = -Math.PI / 2;
  shadows.position.y = 0.01;
  shadows.receiveShadow = true;
  group.add(shadows);

  return { group, props: { sphere, cone, cylinder, cube, torus: ring, diamond }, keyLight };
}
