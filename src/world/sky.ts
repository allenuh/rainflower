import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from 'three';
import vertexShader from '../shaders/sky.vert.glsl?raw';
import fragmentShader from '../shaders/sky.frag.glsl?raw';
import { fbm2DGLSL } from '../shaders/utils';

export function createSky() {
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader: `${fbm2DGLSL}\n${fragmentShader}`,
    uniforms: {
      uCloudScale: { value: 6 },
      uCloudCoverage: { value: 0.5 },
      uCloudSoftness: { value: 0.18 },
      uSkyColor: { value: new Color('#5220ff') },
      uCloudColor: { value: new Color('#ffffff') },
    },
    side: BackSide,
    depthWrite: false,
    depthTest: false,
  });

  const sky = new Mesh(new SphereGeometry(500, 32, 16), material);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}
