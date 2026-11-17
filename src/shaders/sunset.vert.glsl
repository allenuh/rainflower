varying vec3 vSkyDirection;

void main() {
  vSkyDirection = position;
  // Ignore camera translation: this dome represents an infinitely distant sky.
  vec4 clipPosition = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
  gl_Position = clipPosition.xyww;
}
