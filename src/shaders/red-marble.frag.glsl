uniform float uRedMarbleScale;
uniform float uRedMarbleFrequency;
uniform float uRedMarbleWarpStrength;
uniform float uRedMarbleWarpFrequency;
uniform float uRedMarbleTurbulenceStrength;
uniform vec4 uRedMarbleStops;
uniform vec3 uRedMarbleColors[4];

vec3 redMarbleColor(vec2 worldPosition) {
  // Offset and rotate the red stone so it has its own pattern and grain direction.
  vec2 point = mat2(0.8, -0.6, 0.6, 0.8) * worldPosition * uRedMarbleScale
    + vec2(23.0, 51.0);
  vec2 warped = domainWarp2D(point, uRedMarbleWarpStrength, uRedMarbleWarpFrequency);
  float mottling = 0.5 + fbm2D(warped * 1.3);
  float turbulence = turbulence2D(warped * 2.1, 4, 2.0, 0.5);
  float phase = dot(warped, vec2(0.8, -0.6)) * uRedMarbleFrequency
    + turbulence * uRedMarbleTurbulenceStrength;
  float bands = 0.5 + 0.5 * filteredSin(phase);

  // Broad warm mottling with finer gray and pale veins, like the reference stone.
  float stone = clamp(mix(mottling, bands, 0.65), 0.0, 1.0);
  return colorRamp(stone, uRedMarbleStops, uRedMarbleColors);
}
