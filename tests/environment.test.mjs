import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BoxGeometry, DirectionalLight, Mesh, MeshPhongMaterial, PerspectiveCamera,
  PlaneGeometry, Scene, ShaderMaterial, Texture, Vector3, WebGLRenderTarget,
} from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { createPhysics } from '../src/physics/world.ts';
import { createPlayer } from '../src/player/controller.ts';
import { createEnvironment, unloadInactiveEnvironment } from '../src/world/environment.ts';
import { createPortalEndpoint, traversePortal } from '../src/portals/portal.ts';
import { createPortalLifecycle } from '../src/portals/lifecycle.ts';

function trackDisposal(resource) {
  let count = 0;
  resource.addEventListener('dispose', () => { count++; });
  return () => count;
}

test('environment disposal releases shared materials, textures, shadows, and reflection targets once', async () => {
  const physics = await createPhysics();
  const scene = new Scene();
  const texture = new Texture();
  const geometry = new BoxGeometry();
  const material = new MeshPhongMaterial({ map: texture });
  const shader = new ShaderMaterial({ uniforms: { maps: { value: [texture, texture] } } });
  scene.add(new Mesh(geometry, material), new Mesh(geometry, [material, shader]));
  scene.background = texture;
  scene.environment = texture;
  const light = new DirectionalLight();
  light.shadow.map = new WebGLRenderTarget(16, 16);
  light.shadow.mapPass = new WebGLRenderTarget(16, 16);
  scene.add(light);
  const water = new Reflector(new PlaneGeometry(10, 10), {
    textureWidth: 16, textureHeight: 16, multisample: 0,
  });
  scene.add(water);
  const counts = [
    geometry, material, shader, texture, light.shadow.map, light.shadow.mapPass,
    water.geometry, water.material, water.getRenderTarget(),
  ].map(trackDisposal);
  let updates = 0;
  let cancellations = 0;
  const environment = createEnvironment(scene, physics, {
    update: () => { updates++; },
    dispose: () => { cancellations++; },
  });
  environment.update(1 / 60);
  environment.dispose();
  environment.dispose();
  environment.update(1 / 60);
  physics.dispose();

  assert.equal(environment.disposed, true);
  assert.equal(physics.disposed, true);
  assert.equal(cancellations, 1);
  assert.equal(updates, 1);
  counts.forEach((count) => assert.equal(count(), 1));
  assert.equal(scene.children.length, 0);
  assert.equal(scene.background, null);
  assert.equal(scene.environment, null);
  assert.equal(physics.update(1 / 60), 0);
  assert.equal(physics.reset(), 0);
  assert.doesNotThrow(() => physics.syncMeshes());
});

async function fixture() {
  const physics1 = await createPhysics();
  const physics2 = await createPhysics();
  physics1.addFloor(100, 100);
  physics2.addFloor(100, 100);
  for (const physics of [physics1, physics2]) {
    physics.update(physics.world.timestep);
    physics.reset();
  }
  const world1 = createEnvironment(new Scene(), physics1);
  const world2 = createEnvironment(new Scene(), physics2);
  const a = createPortalEndpoint(world1, 8, 8);
  const b = createPortalEndpoint(world2, 8, 8);
  a.anchor.position.y = 4;
  b.anchor.position.y = 4;
  b.anchor.rotation.y = Math.PI;
  const pair = { a, b };
  return { world1, world2, a, b, pair, lifecycle: createPortalLifecycle(pair) };
}

test('an inactive environment is retained while the visible return entrance is still open', async () => {
  const { world1, world2, a, b, pair, lifecycle } = await fixture();
  const player = createPlayer(world1.physics.world, new Vector3(0, 0, -0.25));
  const camera = new PerspectiveCamera(75, 1.5, 0.1, 1000);
  const velocity = new Vector3(0, 0, -20);
  try {
    assert.equal(unloadInactiveEnvironment(pair, world1), false);
    camera.rotation.y = Math.PI;
    traversePortal(a, b, player, camera, velocity);
    lifecycle.arriveThrough(b);
    assert.equal(lifecycle.update(world2, camera), false);
    assert.equal(unloadInactiveEnvironment(pair, world2), false);
    assert.equal(world1.disposed, false);
    assert.equal(world1.physics.disposed, false);
    assert.equal(world2.disposed, false);
    assert.equal(a.anchor.parent, world1.scene);
    assert.equal(b.anchor.parent, world2.scene);
  } finally {
    player.dispose();
    world1.dispose();
    world2.dispose();
  }
});

test('closure unloads only the world left behind in either direction and active physics keeps running', async () => {
  for (const reverse of [false, true]) {
    const { world1, world2, a, b, pair, lifecycle } = await fixture();
    const source = reverse ? b : a;
    const destination = reverse ? a : b;
    const sourceWorld = source.environment;
    const active = destination.environment;
    const feet = source.anchor.localToWorld(new Vector3(0, -4, -0.25));
    const player = createPlayer(sourceWorld.physics.world, feet);
    const camera = new PerspectiveCamera(75, 1.5, 0.1, 1000);
    camera.quaternion.copy(source.anchor.quaternion);
    const velocity = new Vector3(0, 0, -20).applyQuaternion(source.anchor.quaternion);
    const oldGeometry = new BoxGeometry();
    const oldMaterial = new MeshPhongMaterial();
    sourceWorld.scene.add(new Mesh(oldGeometry, oldMaterial));
    const geometryDisposed = trackDisposal(oldGeometry);
    const materialDisposed = trackDisposal(oldMaterial);
    try {
      assert.equal(traversePortal(source, destination, player, camera, velocity), true);
      lifecycle.arriveThrough(destination);
      assert.equal(lifecycle.update(active, camera), true);
      assert.equal(unloadInactiveEnvironment(pair, active), true);
      assert.equal(unloadInactiveEnvironment(pair, active), false);
      assert.equal(sourceWorld.disposed, true);
      assert.equal(sourceWorld.physics.disposed, true);
      assert.equal(sourceWorld.scene.children.length, 0);
      assert.equal(active.disposed, false);
      assert.equal(active.physics.disposed, false);
      assert.equal(geometryDisposed(), 1);
      assert.equal(materialDisposed(), 1);
      assert.equal(a.anchor.parent, null);
      assert.equal(b.anchor.parent, null);
      for (let step = 0; step < 60; step++) {
        active.physics.update(1 / 60, (dt) => player.update(dt, velocity));
      }
      active.physics.syncMeshes();
      assert.equal(player.body.isValid(), true);
      assert.equal(player.grounded, true);
      assert.ok(player.body.translation().y > 2.7 && player.body.translation().y < 2.9);
    } finally {
      player.dispose();
      world1.dispose();
      world2.dispose();
    }
  }
});
