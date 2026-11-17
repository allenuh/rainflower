import {
  BackSide,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import vertexShader from '../shaders/sunset.vert.glsl?raw';
import fragmentShader from '../shaders/sunset.frag.glsl?raw';
import { colorRampGLSL, fbm2DGLSL } from '../shaders/utils';

export function createSunsetSky() {
  // Cloud shading and the marble highlights share a light direction, without
  // drawing a visible sun in the sky.
  const sunDirection = new Vector3(0, 0.2, -1).normalize();
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader: `${fbm2DGLSL}\n${colorRampGLSL}\n${fragmentShader}`,
    uniforms: {
      uSunDirection: { value: sunDirection },
      uCloudScale: { value: 2.25 },
      uCloudCoverage: { value: 0.75 },
      uSkyColors: { value: [
        new Color('#4a2c1c'),
        new Color('#dc790f'),
        new Color('#b17925'),
        new Color('#5c4726'),
      ] },
      uCloudColors: { value: [
        new Color('#f8c65a'),
        new Color('#bf7e25'),
        new Color('#725024'),
        new Color('#312b22'),
      ] },
    },
    side: BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const sky = new Mesh(new SphereGeometry(1, 48, 24), material);
  sky.renderOrder = -1;
  sky.frustumCulled = false;

  const sunLight = new DirectionalLight('#ffd29a', 2.4);
  sunLight.position.copy(sunDirection).multiplyScalar(100);
  const fillLight = new HemisphereLight('#eeb76a', '#45332b', 1.3);

  return { sky, sunLight, fillLight };
}
