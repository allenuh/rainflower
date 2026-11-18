uniform float uMarbleTileSize;

// Integral of an alternating +1/-1 square wave along each coordinate.
vec2 marbleCheckerIntegral(vec2 point) {
  return 1.0 - abs(mod(point, 2.0) - 1.0);
}

vec3 checkerboardMarbleColor(vec2 worldPosition) {
  // Wall faces lie on the edge of the top surface. Choose the tile just inside
  // that edge, keeping its red/white selection constant down the wall.
  vec2 checkerPosition = worldPosition
    - vMarbleSideDirection * (uMarbleTileSize * 0.001);
  vec2 point = checkerPosition / uMarbleTileSize;
  vec2 pixelWidth = fwidth(point);
  vec2 footprint = max(pixelWidth, vec2(0.0001));
  vec2 average = (
    marbleCheckerIntegral(point + 0.5 * footprint)
    - marbleCheckerIntegral(point - 0.5 * footprint)
  ) / footprint;
  // A wall's perpendicular coordinate is constant. Use its exact cell parity
  // instead of dividing nearly identical floating-point integral values.
  vec2 parity = 1.0 - 2.0 * mod(floor(point), 2.0);
  average = mix(parity, average, step(vec2(0.0001), pixelWidth));
  float redWeight = clamp(0.5 - 0.5 * average.x * average.y, 0.0, 1.0);

  // Unfold the stone over the edge so its grain continues down the vertical
  // face. Tile selection above stays tied to the square on the top surface.
  vec2 stonePosition = marbleStonePosition(worldPosition);

  // Evaluate both in uniform control flow: each marble shader uses derivatives.
  vec3 white = marbleColor(stonePosition);
  vec3 red = redMarbleColor(stonePosition);
  return mix(white, red, redWeight);
}
