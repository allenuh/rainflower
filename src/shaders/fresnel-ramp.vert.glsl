varying vec3 vWorldNormal;
varying vec3 vWorldPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  // Valid for uniform scale, which is all these meshes use.
  vWorldNormal = mat3(modelMatrix) * normal;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
