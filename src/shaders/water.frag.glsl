uniform sampler2D tDiffuse;
uniform vec3 color;
uniform float uTime;
uniform float uRippleScale;
uniform float uRippleStrength;
uniform float uReflectionStrength;
uniform float uDistortion;
uniform float uShininess;
uniform float uOpacity;
uniform vec2 uReflectionTexelSize;

varying vec3 vWaterWorldPosition;
varying vec3 vWaterViewPosition;
varying vec4 vWaterReflectionCoord;

#include <common>
#include <bsdfs>
#include <lights_pars_begin>

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

  // Use the actual scene lights, including the moving spotlight's cone/falloff.
  vec3 irradiance = getAmbientLightIrradiance(ambientLightColor);
  vec3 highlights = vec3(0.0);
  #pragma unroll_loop_start
  for (int i = 0; i < NUM_HEMI_LIGHTS; i++) {
    irradiance += getHemisphereLightIrradiance(hemisphereLights[i], normal);
  }
  #pragma unroll_loop_end
  IncidentLight light;
  float cosine;
  #pragma unroll_loop_start
  for (int i = 0; i < NUM_SPOT_LIGHTS; i++) {
    getSpotLightInfo(spotLights[i], vWaterViewPosition, light);
    cosine = max(dot(normal, light.direction), 0.0);
    irradiance += light.color * cosine;
    highlights += light.color * cosine * BRDF_BlinnPhong(
      light.direction, viewDirection, normal, vec3(0.15), uShininess
    );
  }
  #pragma unroll_loop_end

  float fresnel = fresnelSchlick(dot(normal, viewDirection), 0.02);
  // An artistic reflection floor retains the glossy offline-render appearance.
  float reflectionWeight = mix(uReflectionStrength, 0.1, fresnel);
  vec3 bodyColor = color * (vec3(0.2) + irradiance * 0.31830988618);
  gl_FragColor = vec4(mix(bodyColor, reflection, reflectionWeight) + highlights, uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
