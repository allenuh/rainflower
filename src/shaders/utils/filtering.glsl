#ifndef RAINFLOWER_FILTERING
#define RAINFLOWER_FILTERING

// Fragment shader only. Call in uniform control flow so derivatives are defined.
// Three.js's WebGL 2 renderer supports derivatives without an extension.
float filteredStep(float edge, float value) {
  float halfWidth = max(0.5 * fwidth(value), 0.000001);
  return smoothstep(edge - halfWidth, edge + halfWidth, value);
}

// Requires edge0 <= edge1. Equal edges behave like filteredStep.
float filteredSmoothstep(float edge0, float edge1, float value) {
  float halfWidth = max(0.5 * fwidth(value), 0.000001);
  return smoothstep(edge0 - halfWidth, edge1 + halfWidth, value);
}

// Approximate a box-filtered sine over the pixel footprint. Pass an unwrapped
// phase in radians, before sin/fract/mod, to preserve its frequency information.
// Fine bands fade toward their zero mean instead of remaining full contrast.
// This filters the wave, not the noise octaves used to distort its phase.
float filteredSin(float phase) {
  float halfWidth = max(0.5 * fwidth(phase), 0.000001);
  // Use sinc's limit at zero to avoid loss of precision for tiny footprints.
  float attenuation = halfWidth < 0.001 ? 1.0 : sin(halfWidth) / halfWidth;
  return sin(phase) * attenuation;
}

#endif
