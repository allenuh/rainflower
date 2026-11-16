#ifndef RAINFLOWER_TURBULENCE_2D
#define RAINFLOWER_TURBULENCE_2D

// Requires perlin2d.glsl; use the self-contained turbulence2DGLSL export.
// Sum abs(noise) per octave, rather than taking abs of the final fBm sum.
// Normalized to [0, 1]. Matches fBm's eight-octave cap and parameter defaults.
float turbulence2D(vec2 point, int octaves, float lacunarity, float gain) {
  float value = 0.0;
  float amplitude = 1.0;
  float totalAmplitude = 0.0;
  mat2 rotation = mat2(0.8, -0.6, 0.6, 0.8);

  for (int octave = 0; octave < 8; octave++) {
    if (octave >= octaves) break;

    value += amplitude * abs(perlin2D(point));
    totalAmplitude += amplitude;
    point = rotation * point * lacunarity + vec2(37.0, 17.0);
    amplitude *= gain;
  }

  return totalAmplitude > 0.0 ? value / totalAmplitude : 0.0;
}

float turbulence2D(vec2 point) {
  return turbulence2D(point, 5, 2.0, 0.5);
}

#endif
