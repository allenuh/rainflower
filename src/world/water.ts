import {
  Color,
  Matrix4,
  PlaneGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector2,
} from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import vertexShader from '../shaders/water.vert.glsl?raw';
import fragmentShader from '../shaders/water.frag.glsl?raw';
import { fresnelGLSL, waves2DGLSL } from '../shaders/utils';

export function createWater(width: number, depth: number, surfaceY: number) {
  const reflectionWidth = 1024;
  const reflectionHeight = 1024;
  const mesh = new Reflector(new PlaneGeometry(width, depth), {
    color: '#354943',
    textureWidth: reflectionWidth,
    textureHeight: reflectionHeight,
    multisample: 0,
    clipBias: 0.003,
    shader: {
      name: 'ProceduralWater',
      uniforms: UniformsUtils.merge([
        UniformsLib.lights,
        UniformsLib.fog,
        {
          tDiffuse: { value: null },
          textureMatrix: { value: new Matrix4() },
          color: { value: new Color() },
          uTime: { value: 0 },
          uRippleScale: { value: 0.5 }, // Larger values make smaller ripples.
          uRippleStrength: { value: 0.95 }, // Surface-normal steepness.
          uReflectionStrength: { value: 0 }, // Minimum reflection, stronger toward the horizon.
          uDistortion: { value: 0.14 }, // Reflection distortion from the ripples.
          uShininess: { value: 1650 },
          uReflectionTexelSize: { value: new Vector2(1 / reflectionWidth, 1 / reflectionHeight) },
          uOpacity: { value: 0.55 }, // 0 = invisible, 1 = fully opaque.
        },
      ]),
      vertexShader,
      fragmentShader: `${waves2DGLSL}\n${fresnelGLSL}\n${fragmentShader}`,
    },
  });
  mesh.name = 'Water';
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = surfaceY;
  const material = mesh.material as ShaderMaterial;
  material.lights = true;
  material.fog = true;
  material.transparent = true;
  material.depthWrite = false;

  // Reflector captures the sky and above-water scene once per visible frame.
  // It hides itself during capture; its clip plane excludes submerged geometry.
  function update(deltaSeconds: number) {
    material.uniforms.uTime.value += deltaSeconds;
  }

  return { mesh, update };
}
