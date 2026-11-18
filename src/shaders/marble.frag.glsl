uniform float uMarbleScale;
uniform float uMarbleSideTopY;
uniform float uMarbleFrequency;
uniform float uMarbleWarpStrength;
uniform float uMarbleWarpFrequency;
uniform float uMarbleTurbulenceStrength;
uniform vec4 uMarbleStops;
uniform vec3 uMarbleColors[4];

// Used as the diffuse color inside the existing Phong lighting shader.
vec3 marbleColor(vec2 worldPosition) {
  vec2 point = worldPosition * uMarbleScale;
  vec2 warped = domainWarp2D(point, uMarbleWarpStrength, uMarbleWarpFrequency);
  float turbulence = turbulence2D(warped * 1.7, 4, 2.0, 0.5);
  float phase = dot(warped, vec2(1.0, 0.35)) * uMarbleFrequency
    + turbulence * uMarbleTurbulenceStrength;

  // Filter the unwrapped phase before mapping its bands through the color ramp.
  float bands = 0.5 + 0.5 * filteredSin(phase);
  return colorRamp(bands, uMarbleStops, uMarbleColors);
}

// Unfold the surface at each edge so the grain continues down the walls.
vec2 marbleStonePosition(vec2 worldPosition) {
  return worldPosition + vMarbleSideDirection * max(uMarbleSideTopY - vMarbleHeight, 0.0);
}

vec3 marbleSurfaceColor(vec2 worldPosition) {
  return marbleColor(marbleStonePosition(worldPosition));
}
