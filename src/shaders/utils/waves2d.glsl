#ifndef RAINFLOWER_WAVES_2D
#define RAINFLOWER_WAVES_2D

// Fragment-only, filtered analytic gradients of sine-wave height fields.
// Requires filtering.glsl. Wavelength is in point units; phase is in radians.
// Call in uniform control flow, as filteredSin uses screen-space derivatives.
vec2 waveGradient2D(vec2 point, vec2 direction, float wavelength, float amplitude, float phase) {
  vec2 axis = direction / max(length(direction), 0.000001);
  float frequency = 6.28318530718 / max(wavelength, 0.0001);
  float angle = dot(point, axis) * frequency + phase;
  return axis * amplitude * frequency * filteredSin(angle + 1.57079632679);
}

// A softened radial distance keeps the gradient smooth at the ripple center.
vec2 rippleGradient2D(vec2 point, vec2 center, float wavelength, float amplitude, float phase) {
  vec2 offset = point - center;
  float radius = sqrt(dot(offset, offset) + 0.01);
  float frequency = 6.28318530718 / max(wavelength, 0.0001);
  float angle = radius * frequency + phase;
  return offset / radius * amplitude * frequency * filteredSin(angle + 1.57079632679);
}

#endif
