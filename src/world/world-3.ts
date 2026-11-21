import { Color, HemisphereLight, Mesh, PlaneGeometry, Scene, ShaderMaterial } from 'three';
import groundVertexShader from '../shaders/ground.vert.glsl?raw';
import groundFragmentShader from '../shaders/depth-cue-ground.frag.glsl?raw';
import RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '../physics/world';
import { playerEyeHeight } from '../player/controller';
import { createPinkSphere } from './pink-sphere';
import { createStarfieldSky } from './starfield';

export function createWorld3(physics: Physics) {
  const scene = new Scene();
  const starfield = createStarfieldSky();
  scene.add(starfield.sky);
  // Faint cool starlight for any lit props added later.
  scene.add(new HemisphereLight('#8090c0', '#101018', 0.25));

  // A flat, unlit dark yellow plain that dims with distance toward the horizon.
  const plainSize = 5000;
  const ground = new Mesh(
    new PlaneGeometry(plainSize, plainSize),
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
  // The visible plain re-centers under whichever camera draws it (main or
  // portal view), so its edge never comes into view. Its flat color is shaded
  // only by distance from the camera, which makes the move invisible.
  ground.frustumCulled = false;
  ground.onBeforeRender = (_renderer, _scene, camera) => {
    ground.position.x = camera.matrixWorld.elements[12];
    ground.position.z = camera.matrixWorld.elements[14];
    ground.updateMatrixWorld();
  };
  scene.add(ground);
  // The floor collider and player walls stay put at the plain's full size.
  physics.addFloor(plainSize, plainSize);
  physics.addPlayerBounds(plainSize, plainSize);

  // Floating at eye height far out on the plain. It casts no light.
  const sphereRadius = 2.5;
  const sphere = createPinkSphere(sphereRadius);
  sphere.position.set(-750, playerEyeHeight, 500);
  scene.add(sphere);
  // A fixed collider so the player walks into the sphere, not through it.
  const sphereBody = physics.world.createRigidBody(
    RAPIER.RigidBodyDesc.fixed().setTranslation(sphere.position.x, sphere.position.y, sphere.position.z),
  );
  physics.world.createCollider(RAPIER.ColliderDesc.ball(sphereRadius), sphereBody);

  return { scene, sky: starfield.sky, starfield, sphere };
}
