import { Color, LoadingManager, Mesh, PlaneGeometry, Scene, ShaderMaterial } from 'three';
import groundVertexShader from '../shaders/ground.vert.glsl?raw';
import groundFragmentShader from '../shaders/ground.frag.glsl?raw';
import type { Physics } from '../physics/world';
import { createSky } from './sky';
import { createPrimitives } from './primitives';
import { createTeapot } from './teapot';
import { createSuzanne } from './suzanne';
import { disposeObjectResources } from './environment';
import { createVanishingProps } from './vanishing-props';
import { createVanishingSequence } from './vanishing-sequence';
import { addSuzanneNote, addTeapotNote, addWorld1Notes } from './world-1-notes';
import { obfuscateAllTextBoxes } from '../ui/text-box';

// Sphere respawns that arm the first stage; each later stage needs one more.
const firstVanishingRespawns = 5;
// Sphere respawns after which every text box's writing scrambles for good.
const obfuscationRespawns = 5;
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
  addWorld1Notes(scene, primitives.props);
  // Armed props are removed for good the first frame no view can see them.
  // Each respawn of the green sphere arms the next prop in `vanishingStages`.
  const { sphere } = primitives.props;
  const vanishing = createVanishingProps(physics, primitives.keyLight);
  const sequence = createVanishingSequence(vanishing, physics, {
    anchor: sphere,
    stages: vanishingStages,
    firstRespawns: firstVanishingRespawns,
  });
  let sphereRespawns = 0;
  physics.onRespawn((mesh) => {
    if (mesh === sphere && ++sphereRespawns === obfuscationRespawns) obfuscateAllTextBoxes();
  });
  // Props outside the sequence, like the magenta sphere, never vanish.
  for (const name of vanishingStages) {
    if (name !== 'teapot') sequence.provide(name, primitives.props[name]);
  }
  const loadingManager = new LoadingManager();
  // Resolves once late-loaded assets are in the scene (or failed to load), so
  // their shaders can be pre-warmed before the player first sees them.
  const teapotReady = createTeapot(physics, loadingManager)
    .then((teapot) => {
      if (teapot && physics.disposed) disposeObjectResources(teapot);
      else if (teapot) {
        addTeapotNote(teapot);
        scene.add(teapot);
      }
      sequence.provide('teapot', teapot);
    })
    .catch((error) => {
      sequence.provide('teapot', undefined);
      if (!physics.disposed) console.error('Unable to load the Utah teapot:', error);
    });
  // Suzanne isn't part of the vanishing sequence.
  const suzanneReady = createSuzanne(physics, loadingManager)
    .then((suzanne) => {
      if (suzanne && physics.disposed) disposeObjectResources(suzanne);
      else if (suzanne) {
        addSuzanneNote(suzanne);
        scene.add(suzanne);
      }
    })
    .catch((error) => {
      if (!physics.disposed) console.error('Unable to load Suzanne:', error);
    });
  const ready = Promise.all([teapotReady, suzanneReady]).then(() => undefined);

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
