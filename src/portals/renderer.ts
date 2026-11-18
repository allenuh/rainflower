import {
  HalfFloatType,
  Mesh,
  PerspectiveCamera,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import type { Environment } from '../world/environments';
import { clipPortalCamera, updatePortalCamera, type PortalEndpoint, type PortalPair } from './portal';

function createView(source: PortalEndpoint, destination: PortalEndpoint) {
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType });
  target.texture.name = `${source.anchor.name}-view`;
  const material = new ShaderMaterial({
    name: 'PortalSurface',
    uniforms: { portalTexture: { value: target.texture } },
    vertexShader: `
      varying vec4 vPortalPosition;

      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vPortalPosition = gl_Position;
      }
    `,
    fragmentShader: `
      uniform sampler2D portalTexture;
      varying vec4 vPortalPosition;

      void main() {
        // Sample the matching screen-space ray, rather than stretching mesh UVs.
        vec2 uv = vPortalPosition.xy / vPortalPosition.w * 0.5 + 0.5;
        gl_FragColor = texture2D(portalTexture, uv);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const surface = new Mesh(new PlaneGeometry(source.width, source.height), material);
  surface.name = `${source.anchor.name}-surface`;
  source.anchor.add(surface);

  return { source, destination, target, surface, camera: new PerspectiveCamera() };
}

export function createPortalRenderer(renderer: WebGLRenderer, pair: PortalPair) {
  const views = [createView(pair.a, pair.b), createView(pair.b, pair.a)];
  const size = new Vector2();
  const localViewerPosition = new Vector3();
  const viewport = new Vector4();
  const scissor = new Vector4();

  return {
    render(environment: Environment, viewer: PerspectiveCamera, deltaSeconds: number) {
      viewer.updateWorldMatrix(true, false);
      renderer.getDrawingBufferSize(size);

      for (const view of views) {
        if (view.source.environment !== environment || !view.surface.visible) continue;
        localViewerPosition.setFromMatrixPosition(viewer.matrixWorld);
        view.source.anchor.worldToLocal(localViewerPosition);
        // The entrance is one-sided, with its front facing local +Z.
        if (localViewerPosition.z <= 0) continue;

        if (view.target.width !== size.x || view.target.height !== size.y) {
          view.target.setSize(size.x, size.y);
        }
        updatePortalCamera(view.source, view.destination, viewer, view.camera);
        if (!clipPortalCamera(view.destination, view.camera)) continue;
        view.destination.environment.update(deltaSeconds);

        const previousTarget = renderer.getRenderTarget();
        const previousCubeFace = renderer.getActiveCubeFace();
        const previousMipmapLevel = renderer.getActiveMipmapLevel();
        const previousScissorTest = renderer.getScissorTest();
        const previousXrEnabled = renderer.xr.enabled;
        renderer.getViewport(viewport);
        renderer.getScissor(scissor);
        const visibility = views.map(({ surface }) => surface.visible);

        try {
          // No portals appear in destination captures, including water reflections.
          views.forEach(({ surface }) => { surface.visible = false; });
          renderer.xr.enabled = false;
          renderer.setRenderTarget(view.target);
          renderer.setScissorTest(false);
          if (!renderer.autoClear) renderer.clear();
          renderer.render(view.destination.environment.scene, view.camera);
        } finally {
          views.forEach(({ surface }, index) => { surface.visible = visibility[index]; });
          renderer.xr.enabled = previousXrEnabled;
          renderer.setRenderTarget(previousTarget, previousCubeFace, previousMipmapLevel);
          renderer.setViewport(viewport);
          renderer.setScissor(scissor);
          renderer.setScissorTest(previousScissorTest);
        }
      }
    },

    dispose() {
      for (const { surface, target } of views) {
        surface.removeFromParent();
        surface.geometry.dispose();
        surface.material.dispose();
        target.dispose();
      }
    },
  };
}
