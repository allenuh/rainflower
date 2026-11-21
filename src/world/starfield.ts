import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from 'three';
import vertexShader from '../shaders/sunset.vert.glsl?raw';
import fragmentShader from '../shaders/starfield.frag.glsl?raw';
import { hash3DGLSL } from '../shaders/utils';

export function createStarfieldSky() {
  const uniforms = {
    uBackground: { value: new Color('#020309') },
    uDensity: { value: 40 },
    uCoverage: { value: 0.6 },
    uStarRadius: { value: 0.0008 },
    uSmallestStar: { value: 0.15 },
    uPixelSigma: { value: 0.6 },
    uBrightness: { value: 1.5 },
    uDebugCells: { value: 0 },
  };
  const material = new ShaderMaterial({
    // The sunset dome's vertex shader ignores camera translation, keeping the
    // stars infinitely far away.
    vertexShader,
    fragmentShader: `${hash3DGLSL}\n${fragmentShader}`,
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
