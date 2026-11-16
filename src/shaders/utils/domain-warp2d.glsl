#ifndef RAINFLOWER_DOMAIN_WARP_2D
#define RAINFLOWER_DOMAIN_WARP_2D

// Requires fbm2d.glsl; use the self-contained domainWarp2DGLSL export.
// Strength is displacement in input-coordinate units; frequency sets its scale.
// Sample a pattern at the returned point, or warp it again for more folding.
vec2 domainWarp2D(vec2 point, float strength, float frequency) {
  vec2 noisePoint = point * frequency;
  vec2 displacement = vec2(
    fbm2D(noisePoint),
    fbm2D(noisePoint + vec2(17.0, 43.0))
  );
  return point + strength * displacement;
}

vec2 domainWarp2D(vec2 point, float strength) {
  return domainWarp2D(point, strength, 1.0);
}

#endif
