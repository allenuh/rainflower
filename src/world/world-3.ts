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
