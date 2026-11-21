uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uCellSize;

varying vec3 vWorldPosition;

void main() {
  vec2 cell = floor(vWorldPosition.xz / uCellSize);
  float checker = mod(cell.x + cell.y, 2.0);

  gl_FragColor = vec4(mix(uColorA, uColorB, checker), 1.0);
  #include <colorspace_fragment>
}
