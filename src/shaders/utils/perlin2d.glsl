#ifndef RAINFLOWER_PERLIN_2D
#define RAINFLOWER_PERLIN_2D

// Deterministic unit gradients at integer lattice coordinates; no textures.
vec2 noiseGradient2D(vec2 cell) {
  vec3 hash = fract(vec3(cell.x, cell.y, cell.x) * 0.1031);
  hash += dot(hash, hash.yzx + 33.33);
  float angle = fract((hash.x + hash.y) * hash.z) * 6.28318530718;
  return vec2(cos(angle), sin(angle));
}

// Signed gradient noise, centered on zero and bounded by [-1, 1].
// Scale point to control frequency; offset it to change the sampled region.
// This is a hash-based variant, not the reference permutation-table sequence.
float perlin2D(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);

  // Quintic interpolation makes the first two derivatives continuous.
  vec2 fade = local * local * local * (local * (local * 6.0 - 15.0) + 10.0);

  float bottomLeft = dot(noiseGradient2D(cell), local);
  float bottomRight = dot(noiseGradient2D(cell + vec2(1.0, 0.0)), local - vec2(1.0, 0.0));
  float topLeft = dot(noiseGradient2D(cell + vec2(0.0, 1.0)), local - vec2(0.0, 1.0));
  float topRight = dot(noiseGradient2D(cell + vec2(1.0, 1.0)), local - vec2(1.0, 1.0));

  return mix(
    mix(bottomLeft, bottomRight, fade.x),
    mix(topLeft, topRight, fade.x),
    fade.y
  );
}

#endif
