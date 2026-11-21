import { Color, LoadingManager, Mesh, PlaneGeometry, Scene, ShaderMaterial } from 'three';
import groundVertexShader from '../shaders/ground.vert.glsl?raw';
import groundFragmentShader from '../shaders/ground.frag.glsl?raw';
import type { Physics } from '../physics/world';
import { createSky } from './sky';
import { createPrimitives } from './primitives';
import { createTeapot } from './teapot';
import { disposeObjectResources } from './environment';
import { createVanishingProps } from './vanishing-props';
import { createVanishingSequence } from './vanishing-sequence';

// Sphere respawns that arm the first stage; each later stage needs one more.
const firstVanishingRespawns = 5;
// The cylinder sits beside the spawn point, so its absence is felt last.
const vanishingStages = ['cube', 'torus', 'cone', 'diamond', 'teapot', 'cylinder'] as const;

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
  const { width, height } = ground.geometry.parameters;
  physics.addFloor(width, height);
  // Keep the player on the checkerboard; props can still go over the edge.
  physics.addPlayerBounds(width, height);
  const primitives = createPrimitives(physics);
  scene.add(primitives.group);
  // Armed props are removed for good the first frame no view can see them.
  // Each respawn of the green sphere arms the next prop in `vanishingStages`.
  const { sphere } = primitives.props;
  const vanishing = createVanishingProps(physics, primitives.keyLight);
  const sequence = createVanishingSequence(vanishing, physics, {
    anchor: sphere,
    stages: vanishingStages,
    firstRespawns: firstVanishingRespawns,
  });
  for (const [name, prop] of Object.entries(primitives.props)) {
    if (prop !== sphere) sequence.provide(name, prop);
  }
  const loadingManager = new LoadingManager();
  // Resolves once late-loaded assets are in the scene (or failed to load), so
  // their shaders can be pre-warmed before the player first sees them.
  const ready = createTeapot(physics, loadingManager)
    .then((teapot) => {
      if (teapot && physics.disposed) disposeObjectResources(teapot);
      else if (teapot) scene.add(teapot);
      sequence.provide('teapot', teapot);
    })
    .catch((error) => {
      sequence.provide('teapot', undefined);
      if (!physics.disposed) console.error('Unable to load the Utah teapot:', error);
    });

  return {
    scene,
    sky,
    ready,
    observe: vanishing.observe,
    afterRender() {
      vanishing.afterRender();
      sequence.update();
    },
    get sequenceComplete() { return sequence.complete; },
    respawnSphere: () => physics.respawn(sphere),
    dispose: () => loadingManager.abort(),
  };
}
