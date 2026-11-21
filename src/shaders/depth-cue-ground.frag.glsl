uniform vec3 uColor;           // Ground color up close.
uniform vec3 uHorizonColor;    // Color the ground fades to far away.
uniform float uFalloffDistance; // Full brightness up to this distance from the camera.
uniform float uFalloffExponent; // Below 1 holds brightness longer; above 1 drops it sooner.

varying vec3 vWorldPosition;

// Depth cueing, as in early CGI: intensity falls off with distance from the
// viewer. A 1/distance falloff darkens a flat ground evenly from the bottom of
// the screen up to the horizon, rather than all at once near it like fog.
void main() {
  float distance = length(vWorldPosition - cameraPosition);
  float cue = pow(clamp(uFalloffDistance / distance, 0.0, 1.0), uFalloffExponent);

  gl_FragColor = vec4(mix(uHorizonColor, uColor, cue), 1.0);
  #include <colorspace_fragment>
}
