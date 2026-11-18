uniform float uCloudScale;
uniform float uCloudCoverage;
uniform vec3 uSkyColors[4];
uniform vec3 uCloudColors[4];

varying vec3 vSkyDirection;

// Fade out noise octaves that are too fine for the current pixel footprint.
// Keep their amplitude in the denominator so distant noise tends to its mean.
float sunsetCloudNoise(vec2 point, int octaves) {
  float footprint = max(length(dFdx(point)), length(dFdy(point)));
  float amplitude = 1.0;
  float totalAmplitude = 0.0;
  float value = 0.0;
  mat2 rotation = mat2(0.8, -0.6, 0.6, 0.8);

  for (int octave = 0; octave < 6; octave++) {
    if (octave >= octaves) break;
    float visibility = 1.0 - smoothstep(0.25, 0.65, footprint);
    if (visibility > 0.001) value += amplitude * visibility * perlin2D(point);
    totalAmplitude += amplitude;
    point = rotation * point * 2.0 + vec2(37.0, 17.0);
    footprint *= 2.0;
    amplitude *= 0.5;
  }

  return value / totalAmplitude;
}

void main() {
  vec3 direction = normalize(vSkyDirection);
  float elevation = direction.y;

  vec3 skyColor = colorRamp(elevation, vec4(-0.12, 0.0, 0.3, 1.0), uSkyColors);

  // Intersect the viewing direction with virtual horizontal cloud sheets.
  // A softened horizon projection avoids both a singularity and a visible
  // clamp boundary; distant cloud detail is then lost smoothly in the haze.
  vec2 projected = direction.xz / (max(elevation, 0.0) + 0.08) * uCloudScale;
  vec2 point = mat2(0.94, -0.34, 0.34, 0.94) * projected * vec2(1.0, 0.65);
  vec2 warp = vec2(
    fbm2D(point * 0.35, 3, 2.0, 0.5),
    fbm2D(point * 0.35 + vec2(19.0, 47.0), 3, 2.0, 0.5)
  );
  vec2 cloudPoint = point + warp * 0.75;
  float broad = sunsetCloudNoise(cloudPoint, 5);
  float detail = sunsetCloudNoise(cloudPoint * 3.6 + vec2(13.0, 37.0), 3);
  float upper = sunsetCloudNoise(projected * 0.6 + vec2(27.0, 9.0), 3);

  float density = 0.5 + broad * 1.25 + detail * 0.25;
  float cloudMask = smoothstep(1.0 - uCloudCoverage, 1.22 - uCloudCoverage, density);
  float upperMask = smoothstep(0.36, 0.62, 0.5 + upper);
  cloudMask = 1.0 - (1.0 - cloudMask) * (1.0 - upperMask * 0.45);

  // Density alone supplies the bright cloud edges and dark interiors.
  float shadow = clamp((density - 0.35) * 2.2, 0.0, 1.0);
  vec3 cloudColor = colorRamp(shadow, vec4(0.0, 0.3, 0.65, 1.0), uCloudColors);
  cloudColor *= 0.8;

  float horizonHaze = exp(-max(elevation, 0.0) * 14.0);
  cloudColor = mix(cloudColor, skyColor, horizonHaze * 0.65);
  cloudMask *= smoothstep(-0.015, 0.06, elevation);
  vec3 color = mix(skyColor, cloudColor, cloudMask);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
