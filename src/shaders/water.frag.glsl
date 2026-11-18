uniform sampler2D tDiffuse;
uniform vec3 color;
uniform float uTime;
uniform float uRippleScale;
uniform float uRippleStrength;
uniform float uReflectionStrength;
uniform float uDistortion;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform float uSunRadius;
uniform float uSunGlintRadius;
uniform float uSunGlintWidth;
uniform float uSunGlintIntensity;
uniform vec2 uSunPathCosines;
uniform float uOpacity;
uniform vec2 uReflectionTexelSize;

varying vec3 vWaterWorldPosition;
varying vec3 vWaterViewPosition;
varying vec4 vWaterReflectionCoord;

#include <common>
#include <lights_pars_begin>
#include <fog_pars_fragment>

void main() {
  vec2 point = vWaterWorldPosition.xz * uRippleScale;
  // Cross broad swells with small ripples; only the normals move, not the mesh.
  vec2 gradient = waveGradient2D(point, vec2(1.0, 0.35), 8.5, 0.07, -uTime * 0.65);
  gradient += waveGradient2D(point, vec2(-0.3, 1.0), 3.1, 0.045, uTime * 0.9 + 1.2);
  gradient += waveGradient2D(point, vec2(0.8, -0.6), 1.3, 0.018, -uTime * 1.3);
  gradient += rippleGradient2D(point, vec2(23.0, -17.0), 2.4, 0.04, -uTime * 0.85);
  gradient += rippleGradient2D(point, vec2(-31.0, 29.0), 1.65, 0.025, -uTime * 1.1 + 2.4);
  gradient += rippleGradient2D(point, vec2(8.0, 47.0), 0.75, 0.009, -uTime * 1.5);
  vec3 worldNormal = normalize(vec3(-gradient.x * uRippleStrength, 1.0, -gradient.y * uRippleStrength));
  vec3 normal = normalize(mat3(viewMatrix) * worldNormal);
  vec3 viewDirection = normalize(-vWaterViewPosition);

  // Project the perturbation into camera space so distortion follows camera yaw.
  vec2 distortion = (mat3(viewMatrix) * (worldNormal - vec3(0.0, 1.0, 0.0))).xy;
  vec2 reflectionUV = vWaterReflectionCoord.xy / vWaterReflectionCoord.w;
  distortion.x *= uReflectionTexelSize.x / uReflectionTexelSize.y;
  reflectionUV += distortion * uDistortion / (1.0 + length(vWaterViewPosition) * 0.015);
  reflectionUV = clamp(reflectionUV, uReflectionTexelSize, 1.0 - uReflectionTexelSize);
  vec3 reflection = texture2D(tDiffuse, reflectionUV).rgb;

  // Use scene lighting for the water body color. The sun glint is evaluated separately.
  vec3 irradiance = getAmbientLightIrradiance(ambientLightColor);
  #pragma unroll_loop_start
  for (int i = 0; i < NUM_HEMI_LIGHTS; i++) {
    irradiance += getHemisphereLightIrradiance(hemisphereLights[i], normal);
  }
  #pragma unroll_loop_end
  #pragma unroll_loop_start
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) {
    irradiance += directionalLights[i].color * max(dot(normal, directionalLights[i].direction), 0.0);
  }
  #pragma unroll_loop_end

  vec3 eyeToWater = normalize(vWaterWorldPosition - cameraPosition);
  vec3 reflectedRay = reflect(eyeToWater, worldNormal);
  vec2 sunHeading = normalize(uSunDirection.xz);
  vec2 acrossSun = vec2(-sunHeading.y, sunHeading.x);
  // Widen the glint across the sun's bearing without broadening it vertically.
  vec3 sunDelta = reflectedRay - uSunDirection;
  sunDelta.xz -= acrossSun * dot(sunDelta.xz, acrossSun) * (1.0 - 1.0 / uSunGlintWidth);
  float sunDistance = length(sunDelta);
  float diskEdge = 2.0 * sin(uSunRadius * 0.5);
  float glintEdge = 2.0 * sin(max(uSunGlintRadius, uSunRadius + 0.0001) * 0.5);
  float glintFootprint = 0.5 * fwidth(sunDistance);
  float glint = 1.0 - smoothstep(diskEdge - glintFootprint, glintEdge + glintFootprint, sunDistance);
  vec2 waterBearing = eyeToWater.xz / max(length(eyeToWater.xz), 0.0001);
  float sunBearing = dot(waterBearing, sunHeading);
  float pathWeight = smoothstep(uSunPathCosines.x, uSunPathCosines.y, sunBearing);
  vec3 highlights = uSunColor * (uSunGlintIntensity * glint * pathWeight);

  float fresnel = fresnelSchlick(dot(normal, viewDirection), 0.02);
  // An artistic reflection floor retains the glossy offline-render appearance.
  float reflectionWeight = mix(uReflectionStrength, 0.05, fresnel);
  vec3 bodyColor = color * (vec3(0.2) + irradiance * 0.31830988618);
  gl_FragColor = vec4(mix(bodyColor, reflection, reflectionWeight) + highlights, uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
