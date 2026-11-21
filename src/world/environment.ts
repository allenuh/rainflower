import {
  DirectionalLight,
  PointLight,
  Scene,
  ShaderMaterial,
  SpotLight,
  Texture,
  type BufferGeometry,
  type Material,
  type Mesh,
  type Object3D,
  type PerspectiveCamera,
  type WebGLRenderTarget,
} from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import type { Physics } from '../physics/world';
import type { PortalPair } from '../portals/portal';

export interface Environment {
  scene: Scene;
  physics: Physics;
  update: (deltaSeconds: number) => void;
  /** Report a camera this frame draws the scene with (main or portal view). */
  observe: (camera: PerspectiveCamera) => void;
  /** Called once per frame after every view has been drawn. */
  afterRender: () => void;
  stepHeight?: number;
  readonly disposed: boolean;
  dispose: () => void;
}

/** Release resources owned by one scene/model, counting shared resources once. */
export function disposeObjectResources(root: Object3D) {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  const targets = new Set<WebGLRenderTarget>();

  function collectTextures(value: unknown) {
    if (value instanceof Texture && !value.isRenderTargetTexture) textures.add(value);
    else if (Array.isArray(value)) value.forEach(collectTextures);
  }

  root.traverse((object) => {
    const renderable = object as Mesh;
    if (renderable.geometry) geometries.add(renderable.geometry);
    if (renderable.material) {
      const list = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
      list.forEach((material) => materials.add(material));
    }
    if (object instanceof Reflector) targets.add(object.getRenderTarget());
    if (object instanceof DirectionalLight || object instanceof PointLight || object instanceof SpotLight) {
      object.shadow.dispose();
    }
  });
  if (root instanceof Scene) {
    collectTextures(root.background);
    collectTextures(root.environment);
    if (root.overrideMaterial) materials.add(root.overrideMaterial);
  }
  for (const material of materials) {
    Object.values(material).forEach(collectTextures);
    if (material instanceof ShaderMaterial) {
      Object.values(material.uniforms).forEach((uniform) => collectTextures(uniform.value));
    }
  }
  targets.forEach((target) => target.dispose());
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

export function createEnvironment(
  scene: Scene,
  physics: Physics,
  { update, observe, afterRender, dispose: disposeWorld, stepHeight }: {
    update?: (deltaSeconds: number) => void;
    observe?: (camera: PerspectiveCamera) => void;
    afterRender?: () => void;
    dispose?: () => void;
    stepHeight?: number;
  } = {},
): Environment {
  let disposed = false;
  return {
    scene,
    physics,
    stepHeight,
    get disposed() { return disposed; },
    update(deltaSeconds) {
      if (!disposed) update?.(deltaSeconds);
    },
    observe(camera) {
      if (!disposed) observe?.(camera);
    },
    afterRender() {
      if (!disposed) afterRender?.();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeWorld?.();
      disposeWorld = undefined;
      update = undefined;
      observe = undefined;
      afterRender = undefined;
      disposeObjectResources(scene);
      scene.clear();
      scene.background = null;
      scene.environment = null;
      scene.fog = null;
      scene.overrideMaterial = null;
      physics.dispose();
    },
  };
}

/** Unload only after both ends have closed, preserving the current environment. */
export function unloadInactiveEnvironment(pair: PortalPair, active: Environment): boolean {
  if (!pair.a.closed || !pair.b.closed) return false;
  let unloaded = false;
  for (const endpoint of [pair.a, pair.b]) {
    const environment = endpoint.environment;
    endpoint.anchor.removeFromParent();
    if (environment !== active && !environment.disposed) {
      environment.dispose();
      unloaded = true;
    }
  }
  return unloaded;
}
