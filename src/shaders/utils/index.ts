import perlinSource from './perlin2d.glsl?raw';
import simplexSource from './simplex2d.glsl?raw';
import fbmSource from './fbm2d.glsl?raw';

// Insert these strings before a shader's main(). All exports are self-contained.
// Include guards allow them to be composed without duplicate definitions.
export const perlin2DGLSL = perlinSource;
export const simplex2DGLSL = simplexSource;
export const fbm2DGLSL = `${perlinSource}\n${fbmSource}`;
