#ifndef RAINFLOWER_FRESNEL
#define RAINFLOWER_FRESNEL

// Schlick approximation: stronger reflection at grazing viewing angles.
// cosTheta is dot(normal, viewDirection); normalReflectance is F0 (water ~0.02).
float fresnelSchlick(float cosTheta, float normalReflectance) {
  float grazing = 1.0 - clamp(cosTheta, 0.0, 1.0);
  return normalReflectance + (1.0 - normalReflectance) * pow(grazing, 5.0);
}

#endif
