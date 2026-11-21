import {
  BackSide,
  BoxGeometry,
  HalfFloatType,
  Mesh,
  PerspectiveCamera,
  SRGBColorSpace,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import type { Environment } from '../world/environments';
import {
  clipPortalCamera,
  getPortalScissor,
  updatePortalCamera,
  type PortalEndpoint,
  type PortalPair,
} from './portal';
import { clipPortalToFrustum } from './lifecycle';

/**
 * A render target that three.js treats like the canvas: programs encode to
 * its texture's color space (sRGB) and apply tone mapping, and unlit colors
 * such as fog and the background are converted the same way.
 *
 * Plain render targets output linear color, so transparent materials (the
 * ShadowMaterial overlay, the water) would blend in linear space through the
 * portal but in sRGB on the canvas, which looks visibly different. three.js
 * only switches render-target output for XR targets, hence the flag. The
 * half-float format stores the encoded values as-is (only 8-bit sRGB targets
 * get hardware encoding, which would encode twice).
 */
class DisplayRenderTarget extends WebGLRenderTarget {
  readonly isXRRenderTarget = true;

  constructor() {
    super(1, 1, { type: HalfFloatType, colorSpace: SRGBColorSpace });
  }
}

function createView(source: PortalEndpoint, destination: PortalEndpoint) {
  const target = new DisplayRenderTarget();
  target.texture.name = `${source.anchor.name}-view`;
  const material = new ShaderMaterial({
    name: 'PortalSurface',
    uniforms: { portalTexture: { value: target.texture } },
    // The view was already tone mapped as it was rendered.
    toneMapped: false,
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
        // The view holds display-encoded color. Decode it so the output step
        // re-encodes for the canvas (an exact round trip), or leaves it linear
        // when the surface is itself captured, e.g. by the water's reflection.
        gl_FragColor = sRGBTransferEOTF(texture2D(portalTexture, uv));
        #include <colorspace_fragment>
      }
    `,
  });
  // Win depth ties with geometry that meets the opening's edges (e.g. a floor
  // level with its bottom), which the recessed box below would otherwise z-fight.
  material.side = BackSide;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;
  const surface = new Mesh(createRecessGeometry(source.width, source.height), material);
  surface.name = `${source.anchor.name}-surface`;
  surface.scale.z = flatDepth;
  source.anchor.add(surface);

  return { source, destination, target, surface, camera: new PerspectiveCamera() };
}

/**
 * An open box behind the opening (local z from -1 to 0, no front cap).
 * Rendering its inside (BackSide) looks identical to a flat quad because the
 * shader samples by screen position, but it still covers the screen when the
 * camera's near plane reaches past the opening during a crossing. From behind,
 * every remaining face is front-facing and culled, so the portal stays one-sided.
 */
function createRecessGeometry(width: number, height: number) {
  const geometry = new BoxGeometry(width, height, 1);
  geometry.translate(0, 0, -0.5);
  // BoxGeometry faces are ordered +X, -X, +Y, -Y, +Z, -Z with six indices each.
  const indices = Array.from(geometry.index!.array).filter((_, index) => index < 24 || index >= 30);
  geometry.setIndex(indices);
  geometry.clearGroups();
  return geometry;
}

// Recess depth when the camera is clear of the opening (visually a flat quad).
const flatDepth = 1e-3;
// Margin over the farthest near-plane corner when the camera is at the opening.
const nearClearance = 1.5;

export function createPortalRenderer(renderer: WebGLRenderer, pair: PortalPair) {
  let disposed = false;
  const views = [createView(pair.a, pair.b), createView(pair.b, pair.a)];
  const size = new Vector2();
  const localViewerPosition = new Vector3();
  const viewport = new Vector4();
  const scissor = new Vector4();

  function matchDrawingBuffer(view: (typeof views)[number]) {
    renderer.getDrawingBufferSize(size);
    if (view.target.width !== size.x || view.target.height !== size.y) {
      view.target.setSize(size.x, size.y);
    }
  }

  /**
   * Deepen the recess only while the near plane could reach the opening, i.e.
   * the eye is within one near-plane corner distance of it and inside its
   * outline. Elsewhere it stays flat so its side walls never show at grazing
   * angles.
   */
  function fitRecessDepth(
    view: (typeof views)[number],
    viewer: PerspectiveCamera,
    local: Vector3,
  ) {
    const projection = viewer.projectionMatrix.elements;
    const nearCorner = Math.hypot(
      viewer.near,
      viewer.near / projection[0],
      viewer.near / projection[5],
    );
    const depth = nearCorner * nearClearance;
    const inside = local.z > 0 && local.z < depth
      && Math.abs(local.x) < view.source.width / 2
      && Math.abs(local.y) < view.source.height / 2;
    view.surface.scale.z = inside ? depth : flatDepth;
  }

  return {
    /**
     * Compile every material for both outputs before it is first drawn.
     * three.js keys programs by output color space. Portal views share the
     * canvas's sRGB programs (see DisplayRenderTarget), but linear render
     * targets, such as the water's reflection pass, need their own variants,
     * which would otherwise compile on the frame the water first appears.
     */
    async prewarm(
      viewer: PerspectiveCamera,
      environments: Environment[] = [pair.a.environment, pair.b.environment],
    ) {
      if (disposed) return;
      for (const view of views) {
        matchDrawingBuffer(view);
        renderer.initRenderTarget(view.target);
      }

      const previousTarget = renderer.getRenderTarget();
      const previousCubeFace = renderer.getActiveCubeFace();
      const previousMipmapLevel = renderer.getActiveMipmapLevel();
      const linearProbe = new WebGLRenderTarget(1, 1);
      const pending: Promise<unknown>[] = [];
      try {
        for (const environment of new Set(environments)) {
          if (environment.disposed) continue;
          // compile() reads the active target synchronously, so switching
          // between calls selects the display (canvas and portal view) and
          // linear render-target variants.
          renderer.setRenderTarget(null);
          pending.push(renderer.compileAsync(environment.scene, viewer));
          renderer.setRenderTarget(linearProbe);
          pending.push(renderer.compileAsync(environment.scene, viewer));
        }
      } finally {
        renderer.setRenderTarget(previousTarget, previousCubeFace, previousMipmapLevel);
        linearProbe.dispose();
      }
      await Promise.all(pending);
    },

    render(environment: Environment, viewer: PerspectiveCamera, deltaSeconds: number) {
      if (disposed || pair.a.closed || pair.b.closed) return;
      viewer.updateWorldMatrix(true, false);

      for (const view of views) {
        if (view.source.environment !== environment || !view.surface.visible) continue;
        localViewerPosition.setFromMatrixPosition(viewer.matrixWorld);
        view.source.anchor.worldToLocal(localViewerPosition);
        fitRecessDepth(view, viewer, localViewerPosition);
        // The entrance is one-sided, with its front facing local +Z.
        if (localViewerPosition.z <= 0) continue;

        matchDrawingBuffer(view);
        if (view.surface.scale.z > flatDepth) {
          // While recessed for the near plane, the opening itself may lie
          // closer than the near plane (its clipped polygon is empty) yet the
          // recess still covers the screen, so draw the whole view.
          view.target.scissorTest = false;
        } else {
          // Off-screen openings cost nothing; visible ones only redraw the
          // pixels they cover, since the surface samples by screen position.
          const polygon = clipPortalToFrustum(view.source, viewer);
          if (polygon.length === 0) continue;
          getPortalScissor(polygon, viewer, size.x, size.y, view.target.scissor);
          view.target.scissorTest = true;
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
          // Binding the target applies its own scissor; the water Reflector
          // re-binds it after its pass, so the scissor survives that too.
          renderer.setRenderTarget(view.target);
          if (!renderer.autoClear) renderer.clear();
          view.destination.environment.observe(view.camera);
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
      if (disposed) return;
      disposed = true;
      for (const { surface, target } of views) {
        surface.removeFromParent();
        surface.geometry.dispose();
        surface.material.dispose();
        target.dispose();
      }
      views.length = 0;
    },
  };
}
