#ifndef RAINFLOWER_SIMPLEX_2D
#define RAINFLOWER_SIMPLEX_2D

// Deterministic unit gradients on the simplex lattice; no textures.
vec2 simplexGradient2D(vec2 cell) {
  vec3 hash = fract(vec3(cell.x, cell.y, cell.x) * 0.1031);
  hash += dot(hash, hash.yzx + 33.33);
  float angle = fract((hash.x + hash.y) * hash.z) * 6.28318530718;
  return vec2(cos(angle), sin(angle));
}

// Signed gradient noise centered on zero and bounded by [-1, 1].
// Scale point to control frequency; offset it to change the sampled region.
// This is a hash-based variant, not a permutation-table reference sequence.
float simplex2D(vec2 point) {
  const float skew = 0.366025403784;
  const float unskew = 0.211324865405;

  // Skew into a square grid, then unskew its origin into triangular cells.
  vec2 cell = floor(point + (point.x + point.y) * skew);
  vec2 local0 = point - (cell - (cell.x + cell.y) * unskew);
  vec2 corner = local0.x > local0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec2 local1 = local0 - corner + unskew;
  vec2 local2 = local0 - 1.0 + 2.0 * unskew;

  vec3 weight = max(vec3(0.5) - vec3(
    dot(local0, local0),
    dot(local1, local1),
    dot(local2, local2)
  ), vec3(0.0));
  weight *= weight;
  weight *= weight;

  vec3 contribution = vec3(
    dot(simplexGradient2D(cell), local0),
    dot(simplexGradient2D(cell + corner), local1),
    dot(simplexGradient2D(cell + 1.0), local2)
  );
  return 70.0 * dot(weight, contribution);
}

#endif
