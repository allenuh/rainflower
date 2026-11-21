#ifndef RAINFLOWER_HASH_3D
#define RAINFLOWER_HASH_3D

// Sine-free hashes of a 3D lattice point (after Dave Hoskins' "Hash without
// Sine"). Stable across GPUs for the integer cell coordinates used here.
// Returns three independent values in [0, 1).
vec3 hash33(vec3 point) {
  point = fract(point * vec3(0.1031, 0.1030, 0.0973));
  point += dot(point, point.yxz + 33.33);
  return fract((point.xxy + point.yxx) * point.zyx);
}

// Returns one value in [0, 1), independent of hash33 for the same point.
float hash31(vec3 point) {
  point = fract(point * 0.1031);
  point += dot(point, point.zyx + 31.32);
  return fract((point.x + point.y) * point.z);
}

#endif
