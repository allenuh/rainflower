#ifndef RAINFLOWER_COLOR_RAMP
#define RAINFLOWER_COLOR_RAMP

// Four colors in linear RGB, with nondecreasing stop positions in stops.xyzw.
// Positions need not be evenly spaced or restricted to [0, 1].
// Values outside the ramp use its endpoint colors. Repeated stops make a step;
// at a repeated position, the last color at that position wins.
vec3 colorRamp(float value, vec4 stops, vec3 colors[4]) {
  if (value < stops.x) return colors[0];
  if (value < stops.y) {
    return mix(colors[0], colors[1], (value - stops.x) / (stops.y - stops.x));
  }
  if (value < stops.z) {
    return mix(colors[1], colors[2], (value - stops.y) / (stops.z - stops.y));
  }
  if (value < stops.w) {
    return mix(colors[2], colors[3], (value - stops.z) / (stops.w - stops.z));
  }
  return colors[3];
}

#endif
