uniform float uCloudScale;
uniform float uCloudCoverage;
uniform float uCloudSoftness;
uniform vec3 uSkyColor;
uniform vec3 uCloudColor;

varying vec3 vDirection;

void main() {
  vec3 direction = normalize(vDirection);

  // Blend three 2D projections to avoid a longitude seam or pinched poles.
  vec3 weights = pow(abs(direction), vec3(4.0));
  weights /= weights.x + weights.y + weights.z;
  vec3 point = direction * uCloudScale;
  float noise = fbm2D(point.yz, 6, 2.0, 0.55) * weights.x
    + fbm2D(point.xz, 6, 2.0, 0.55) * weights.y
    + fbm2D(point.xy, 6, 2.0, 0.55) * weights.z;

  float density = 0.5 + noise * 0.95;
  float cloudMask = smoothstep(
    1.0 - uCloudCoverage,
    1.0 - uCloudCoverage + uCloudSoftness,
    density
  );

  gl_FragColor = vec4(mix(uSkyColor, uCloudColor, cloudMask), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
