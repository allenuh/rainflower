#ifndef RAINFLOWER_FBM_2D
#define RAINFLOWER_FBM_2D

// Requires perlin2d.glsl before this source; use the fbm2DGLSL TS export.
// Up to eight octaves. Lacunarity > 1 adds finer detail each octave;
// gain in [0, 1] controls its relative strength. Nonpositive octaves return 0.
// Dividing by the accumulated amplitude keeps the result in [-1, 1].
float fbm2D(vec2 point, int octaves, float lacunarity, float gain) {
  float value = 0.0;
  float amplitude = 1.0;
  float totalAmplitude = 0.0;
  mat2 rotation = mat2(0.8, -0.6, 0.6, 0.8);

  for (int octave = 0; octave < 8; octave++) {
    if (octave >= octaves) break;

    value += amplitude * perlin2D(point);
    totalAmplitude += amplitude;

    // Reduce alignment between octaves, including at lattice intersections.
    point = rotation * point * lacunarity + vec2(37.0, 17.0);
    amplitude *= gain;
  }

  return totalAmplitude > 0.0 ? value / totalAmplitude : 0.0;
}

float fbm2D(vec2 point) {
  return fbm2D(point, 5, 2.0, 0.5);
}

#endif
