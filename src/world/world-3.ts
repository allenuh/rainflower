import { Color, HemisphereLight, Mesh, PlaneGeometry, Scene, ShaderMaterial } from 'three';
import groundVertexShader from '../shaders/ground.vert.glsl?raw';
import groundFragmentShader from '../shaders/night-ground.frag.glsl?raw';
import type { Physics } from '../physics/world';
import { createStarfieldSky } from './starfield';

export function createWorld3(physics: Physics) {
  const scene = new Scene();
  const starfield = createStarfieldSky();
  scene.add(starfield.sky);
  // Faint cool starlight for any lit props added later.
  scene.add(new HemisphereLight('#8090c0', '#101018', 0.25));

  const ground = new Mesh(
    new PlaneGeometry(100, 100),
    new ShaderMaterial({
      vertexShader: groundVertexShader,
      fragmentShader: groundFragmentShader,
      uniforms: {
        uColorA: { value: new Color('#0b0c12') },
        uColorB: { value: new Color('#25273a') },
        uCellSize: { value: 4 },
      },
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  const { width, height } = ground.geometry.parameters;
  physics.addFloor(width, height);
  physics.addPlayerBounds(width, height);

  return { scene, sky: starfield.sky, starfield };
}
