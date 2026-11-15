uniform vec3 uColor;

varying vec3 vWorldPosition;

void main() {
  float cellSize = 4.0;

  vec2 cell = floor(vWorldPosition.xz / cellSize);
  float checker = mod(cell.x + cell.y, 2.0);

  gl_FragColor = vec4(vec3(checker), 1.0);
}
