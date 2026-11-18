import { Color, LoadingManager, Mesh, PlaneGeometry, Scene, ShaderMaterial } from 'three';
import groundVertexShader from '../shaders/ground.vert.glsl?raw';
import groundFragmentShader from '../shaders/ground.frag.glsl?raw';
import type { Physics } from '../physics/world';
import { createSky } from './sky';
import { createPrimitives } from './primitives';
import { createTeapot } from './teapot';
import { disposeObjectResources } from './environment';

export function createWorld1(physics: Physics) {
  const scene = new Scene();
  const sky = createSky();
  scene.add(sky);

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
  physics.addFloor(ground.geometry.parameters.width, ground.geometry.parameters.height);
  scene.add(createPrimitives(physics));
  const loadingManager = new LoadingManager();
  createTeapot(physics, loadingManager)
    .then((teapot) => {
      if (!teapot) return;
      if (physics.disposed) disposeObjectResources(teapot);
      else scene.add(teapot);
    })
    .catch((error) => {
      if (!physics.disposed) console.error('Unable to load the Utah teapot:', error);
    });

  return { scene, sky, dispose: () => loadingManager.abort() };
}
