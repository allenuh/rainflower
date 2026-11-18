import perlinSource from './perlin2d.glsl?raw';
import simplexSource from './simplex2d.glsl?raw';
import fbmSource from './fbm2d.glsl?raw';
import turbulenceSource from './turbulence2d.glsl?raw';
import domainWarpSource from './domain-warp2d.glsl?raw';
import colorRampSource from './color-ramp.glsl?raw';
import filteringSource from './filtering.glsl?raw';
import wavesSource from './waves2d.glsl?raw';
import fresnelSource from './fresnel.glsl?raw';

// Insert these strings before a shader's main(). All exports are self-contained.
// Include guards allow them to be composed without duplicate definitions.
export const perlin2DGLSL = perlinSource;
export const simplex2DGLSL = simplexSource;
export const fbm2DGLSL = `${perlinSource}\n${fbmSource}`;
export const turbulence2DGLSL = `${perlinSource}\n${turbulenceSource}`;
export const domainWarp2DGLSL = `${fbm2DGLSL}\n${domainWarpSource}`;
export const colorRampGLSL = colorRampSource;
// Fragment shader only: these helpers use screen-space derivatives.
export const filteringGLSL = filteringSource;
export const waves2DGLSL = `${filteringSource}\n${wavesSource}`;
export const fresnelGLSL = fresnelSource;
