import { Color, Mesh, ShaderMaterial, SphereGeometry } from 'three';
import vertexShader from '../shaders/fresnel-ramp.vert.glsl?raw';
import fragmentShader from '../shaders/fresnel-ramp.frag.glsl?raw';
import { fresnelGLSL } from '../shaders/utils';

/** A self-lit pink sphere: a glowing center fading to a magenta rim. */
export function createPinkSphere(radius: number) {
  const material = new ShaderMaterial({
    vertexShader,
    fragmentShader: `${fresnelGLSL}\n${fragmentShader}`,
    uniforms: {
      uCenterColor: { value: new Color('#ff4fe9') },
      uRimColor: { value: new Color('#c000d0') },
      uRimReflectance: { value: 0.12 },
      uHighlightColor: { value: new Color('#ffb3f7') },
      uHighlightSharpness: { value: 4 },
      uHighlightStrength: { value: 0.8 },
    },
  });
  return new Mesh(new SphereGeometry(radius, 48, 32), material);
}
