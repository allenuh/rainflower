uniform mat4 textureMatrix;

varying vec3 vWaterWorldPosition;
varying vec3 vWaterViewPosition;
varying vec4 vWaterReflectionCoord;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
  vWaterWorldPosition = worldPosition.xyz;
  vWaterViewPosition = viewPosition.xyz;
  // Reflector's texture matrix already includes the water's model matrix.
  vWaterReflectionCoord = textureMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewPosition;
}
