import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3, Vector4 } from 'three';
import vertexShader from '../shaders/sunset.vert.glsl?raw';
import fragmentShader from '../shaders/starfield.frag.glsl?raw';
import { colorRampGLSL, hash3DGLSL } from '../shaders/utils';

export function createStarfieldSky() {
  const uniforms = {
    uBackground: { value: new Color('#020309') },
    // Per layer (x, y, z): sparse bright, medium, dense faint "dust".
    uLayerDensity: { value: new Vector3(16, 40, 90) },
    uLayerCoverage: { value: new Vector3(0.6, 0.6, 0.6) },
    uLayerBrightness: { value: new Vector3(1.2, 0.5, 0.18) },
    uLayerMask: { value: new Vector3(1, 1, 1) },
    uMagnitudeExponent: { value: 6 },
    uStarRadius: { value: 0.0009 },
    uPixelSigma: { value: 0.6 },
    uBrightness: { value: 1.5 },
    // A loose blackbody ramp from cool to hot stars; biased toward white.
    uStarColors: { value: [
      new Color('#ffa75c'),
      new Color('#ffe2b8'),
      new Color('#ffffff'),
      new Color('#a9c1ff'),
    ] },
    uStarColorStops: { value: new Vector4(0, 0.25, 0.65, 1) },
    uTintStrength: { value: 0.5 },
    uDebugCells: { value: 0 },
  };
  const material = new ShaderMaterial({
    // The sunset dome's vertex shader ignores camera translation, keeping the
    // stars infinitely far away.
    vertexShader,
    fragmentShader: `${hash3DGLSL}\n${colorRampGLSL}\n${fragmentShader}`,
    uniforms,
    side: BackSide,
    fog: false,
    depthWrite: false,
    depthTest: false,
  });
  const sky = new Mesh(new SphereGeometry(1, 48, 24), material);
  sky.renderOrder = -1;
  sky.frustumCulled = false;

  return { sky, uniforms };
}
