import { Color, MeshBasicMaterial, MultiplyOperation, ShaderChunk, Vector4, type IUniform } from 'three';
import marbleSource from '../shaders/marble.frag.glsl?raw';
import redMarbleSource from '../shaders/red-marble.frag.glsl?raw';
import checkerboardSource from '../shaders/checkerboard-marble.frag.glsl?raw';
import {
  colorRampGLSL,
  domainWarp2DGLSL,
  filteringGLSL,
  turbulence2DGLSL,
} from '../shaders/utils';

function whiteMarbleUniforms(scale: number) {
  return {
    // Scale converts world units to pattern coordinates; frequency is in radians.
    uMarbleScale: { value: scale },
    uMarbleFrequency: { value: 6 },
    uMarbleWarpStrength: { value: 2.5 },
    uMarbleWarpFrequency: { value: 0.6 },
    uMarbleTurbulenceStrength: { value: 6 },
    uMarbleStops: { value: new Vector4(0, 0.65, 0.9, 1) },
    uMarbleColors: { value: [
      new Color('#f4f1e8'),
      new Color('#dedbd4'),
      new Color('#8b8e97'),
      new Color('#252936'),
    ] },
  };
}

function redMarbleUniforms(scale: number) {
  return {
    uRedMarbleScale: { value: scale },
    uRedMarbleFrequency: { value: 7 },
    uRedMarbleWarpStrength: { value: 1.8 },
    uRedMarbleWarpFrequency: { value: 0.7 },
    uRedMarbleTurbulenceStrength: { value: 7 },
    uRedMarbleStops: { value: new Vector4(0, 0.55, 0.8, 1) },
    uRedMarbleColors: { value: [
      new Color('#c4a28a'),
      new Color('#a17a68'),
      new Color('#74665e'),
      new Color('#d3baa5'),
    ] },
  };
}

function createStoneMaterial(
  source: string,
  uniforms: Record<string, IUniform>,
  colorFunction: string,
) {
  const material = new MeshBasicMaterial({
    color: 0xffffff,
    reflectivity: 0.25,
    combine: MultiplyOperation, // Keep the marble colors in the sky reflection.
  });
  const varyings = `varying vec2 vMarblePosition;
    varying float vMarbleHeight;
    varying vec2 vMarbleSideDirection;`;
  const fragmentSource = [
    domainWarp2DGLSL,
    turbulence2DGLSL,
    colorRampGLSL,
    filteringGLSL,
    varyings,
    source,
  ].join('\n');

  // Replace only the base color, preserving Three.js environment mapping/output.
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = `${varyings}\n${shader.vertexShader}`
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec3 marbleWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vMarblePosition = marbleWorldPosition.xz;
        vMarbleHeight = marbleWorldPosition.y;
        vMarbleSideDirection = transformNormalByInverseViewMatrix(normalMatrix * normal, viewMatrix).xz;`)
      // An unnormalized view ray interpolates correctly across large flat faces.
      // The cubemap lookup supplies the normalization when it samples the sky.
      .replace('#include <envmap_vertex>', ShaderChunk.envmap_vertex.replace(
        'normalize( worldPosition.xyz - cameraPosition )',
        '( worldPosition.xyz - cameraPosition )',
      ));
    shader.fragmentShader = `${fragmentSource}\n${shader.fragmentShader}`
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= ${colorFunction}(vMarblePosition);`);
  };
  material.customProgramCacheKey = () => `rainflower-${colorFunction}-basic-v1`;

  return material;
}

// Larger scale values make the marble's features smaller and more frequent.
export function createMarbleMaterial({ scale = 0.06 } = {}) {
  return createStoneMaterial(marbleSource, whiteMarbleUniforms(scale), 'marbleColor');
}

export function createRedMarbleMaterial({ scale = 0.18 } = {}) {
  return createStoneMaterial(redMarbleSource, redMarbleUniforms(scale), 'redMarbleColor');
}

export function createCheckerboardMarbleMaterial({
  tileSize = 10,
  whiteScale = 0.06,
  redScale = 0.18,
  sideTopY = 0,
} = {}) {
  return createStoneMaterial(
    [marbleSource, redMarbleSource, checkerboardSource].join('\n'),
    {
      ...whiteMarbleUniforms(whiteScale),
      ...redMarbleUniforms(redScale),
      uMarbleTileSize: { value: tileSize },
      uMarbleSideTopY: { value: sideTopY },
    },
    'checkerboardMarbleColor',
  );
}
