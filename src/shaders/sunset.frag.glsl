uniform float uCloudScale;
uniform float uCloudCoverage;
uniform vec3 uSunDirection;
uniform float uSunRadius;
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
  float sunAngle = length(direction - uSunDirection); // Chord distance on the unit sphere.
  float sunEdge = max(fwidth(sunAngle) * 0.5, 0.0001);
  float sunRadius = 2.0 * sin(uSunRadius * 0.5);
  float sunDisk = 1.0 - smoothstep(sunRadius - sunEdge, sunRadius + sunEdge, sunAngle);
  float sunGlow = exp(-sunAngle * 11.0);
  // Fade the halo below the horizon so the distant water still blends with the fog.
  skyColor += vec3(0.85, 0.28, 0.03) * sunGlow * smoothstep(0.0, uSunDirection.y, elevation);
  skyColor = mix(skyColor, vec3(1.0, 0.91, 0.54) * 1.35, sunDisk);

  // Intersect the viewing direction with virtual horizontal cloud sheets.
  // A softened horizon projection avoids both a singularity and a visible
  // clamp boundary; distant cloud detail is then lost smoothly in the haze.
  vec2 projected = direction.xz / (max(elevation, 0.0) + 0.08) * uCloudScale;
  mat2 cloudRotation = mat2(0.94, -0.34, 0.34, 0.94);
  vec2 cloudStretch = vec2(1.0, 0.65);
  vec2 point = cloudRotation * projected * cloudStretch;
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

  // Treat denser patches as thicker cloud bases that hang lower into the light.
  // Compare with a sample toward the sun to pick out their illuminated sides.
  vec2 sunOffset = cloudRotation * uSunDirection.xz * cloudStretch * 0.36;
  float sunwardDensity = sunsetCloudNoise(cloudPoint + sunOffset, 5);
  float litSlope = clamp(0.5 + (broad - sunwardDensity) * 2.0, 0.0, 1.0);
  float towardSun = smoothstep(-0.55, 0.95, dot(direction, uSunDirection));
  float cloudBase = smoothstep(0.28, 0.74, density);
  float underlight = clamp(0.08 + cloudBase * 0.38 + litSlope * 0.3 + towardSun * 0.28, 0.0, 1.0);
  vec3 cloudColor = colorRamp(underlight, vec4(0.0, 0.35, 0.67, 1.0), uCloudColors);

  float horizonHaze = exp(-max(elevation, 0.0) * 14.0);
  cloudColor = mix(cloudColor, skyColor, horizonHaze * 0.65);
  // Keep the visible disk below the first cloud bank.
  float cloudFloor = sin(asin(uSunDirection.y) + uSunRadius + 0.01);
  cloudMask *= smoothstep(cloudFloor, cloudFloor + 0.065, elevation);
  vec3 color = mix(skyColor, cloudColor, cloudMask);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
