import {
  BackSide,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  MathUtils,
  Vector3,
} from 'three';
import vertexShader from '../shaders/sunset.vert.glsl?raw';
import fragmentShader from '../shaders/sunset.frag.glsl?raw';
import { colorRampGLSL, fbm2DGLSL } from '../shaders/utils';

export function createSunsetSky() {
  const sunElevation = MathUtils.degToRad(2.5);
  const sunAzimuth = MathUtils.degToRad(0); // Measured from -Z toward +X.
  const sunDirection = new Vector3(
    Math.sin(sunAzimuth) * Math.cos(sunElevation),
    Math.sin(sunElevation),
    -Math.cos(sunAzimuth) * Math.cos(sunElevation),
  );
  const sunRadius = MathUtils.degToRad(0.85);
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader: `${fbm2DGLSL}\n${colorRampGLSL}\n${fragmentShader}`,
    uniforms: {
      uCloudScale: { value: 2.25 },
      uCloudCoverage: { value: 0.75 },
      uSunDirection: { value: sunDirection },
      uSunRadius: { value: sunRadius },
      uSkyColors: { value: [
        new Color('#4a2c1c'),
        new Color('#dc790f'),
        new Color('#b17925'),
        new Color('#5c4726'),
      ] },
      uCloudColors: { value: [
        new Color('#694332'),
        new Color('#b66534'),
        new Color('#ff982e'),
        new Color('#ffd873'),
      ] },
    },
    side: BackSide,
    fog: false, // Keep the clouds clear even when the world uses distance fog.
    depthWrite: false,
    depthTest: false,
  });
  const sky = new Mesh(new SphereGeometry(1, 48, 24), material);
  sky.renderOrder = -1;
  sky.frustumCulled = false;

  const sunLight = new DirectionalLight('#ffecaf', 2);
  sunLight.position.copy(sunDirection);
  const fillLight = new HemisphereLight('#eeb76a', '#45332b', 1.3);

  return { sky, sunLight, fillLight, sunDirection, sunRadius };
}
