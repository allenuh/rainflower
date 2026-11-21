uniform vec3 uCenterColor;     // Color where the surface faces the viewer.
uniform vec3 uRimColor;        // Color toward the silhouette.
uniform float uRimReflectance; // Fresnel F0: higher pulls the rim color further in.
uniform vec3 uHighlightColor;  // Glow at the center of the silhouette.
uniform float uHighlightSharpness; // Higher shrinks the glow toward the center.
uniform float uHighlightStrength;

varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

// A self-lit surface shaded only by viewing angle: a glowing center that
// deepens to a saturated rim. Both terms depend only on the angle between
// the surface and the view, so a sphere looks the same from every side.
// No scene lights are read, so it glows without lighting anything else.
void main() {
  vec3 normal = normalize(vWorldNormal);
  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float facing = max(dot(normal, viewDirection), 0.0);

  float rim = fresnelSchlick(facing, uRimReflectance);
  vec3 color = mix(uCenterColor, uRimColor, rim);

  float highlight = pow(facing, uHighlightSharpness);
  color = mix(color, uHighlightColor, highlight * uHighlightStrength);

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
