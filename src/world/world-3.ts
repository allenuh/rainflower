import { Color, HemisphereLight, Mesh, PlaneGeometry, Scene, ShaderMaterial } from 'three';
import groundVertexShader from '../shaders/ground.vert.glsl?raw';
import groundFragmentShader from '../shaders/depth-cue-ground.frag.glsl?raw';
import type { Physics } from '../physics/world';
import { createStarfieldSky } from './starfield';

export function createWorld3(physics: Physics) {
  const scene = new Scene();
  const starfield = createStarfieldSky();
  scene.add(starfield.sky);
  // Faint cool starlight for any lit props added later.
  scene.add(new HemisphereLight('#8090c0', '#101018', 0.25));

  // A flat, unlit dark yellow plain that dims with distance toward the horizon.
  const ground = new Mesh(
    new PlaneGeometry(2000, 2000),
    new ShaderMaterial({
      vertexShader: groundVertexShader,
      fragmentShader: groundFragmentShader,
      uniforms: {
        uColor: { value: new Color('#6b6512') },
        uHorizonColor: { value: new Color('#1c1b08') },
        uFalloffDistance: { value: 12 },
        uFalloffExponent: { value: 0.7 },
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
