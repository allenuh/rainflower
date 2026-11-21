uniform vec3 uBackground;
uniform float uDensity;       // Lattice cells across the sky sphere's radius.
uniform float uCoverage;      // Fraction of cells that hold a star.
uniform float uStarRadius;    // Angular radius (Gaussian sigma) of the largest stars, in radians.
uniform float uSmallestStar;  // Smallest star radius, as a fraction of uStarRadius.
uniform float uPixelSigma;    // Narrowest a star is drawn, in pixels.
uniform float uBrightness;    // Peak brightness of a star at least as wide as that floor.
uniform float uDebugCells;    // 1 tints each lattice cell to show the placement grid.

varying vec3 vSkyDirection;

// One star per lattice cell, scattered in 3D and projected onto the sphere,
// in the spirit of cell-noise starfields (POV-Ray granite thresholds, OSL
// cellnoise). Working in 3D avoids a longitude seam or crowding at the poles.
// pixelAngle is the angular width of one pixel at this direction. Each star's
// visible footprint must stay well under half a cell (about 3 sigma).
float starLayer(vec3 direction, float density, float seed, float pixelAngle) {
  vec3 point = direction * density;
  vec3 cell = floor(point);
  // The eight cells whose centers surround the point. Any star within half a
  // cell of the point lies in one of them, so no star is cut off at a border.
  vec3 corner = cell + step(0.5, fract(point)) - 1.0;
  float minimumSigma = uPixelSigma * pixelAngle;
  float light = 0.0;

  for (int i = 0; i < 8; i++) {
    float index = float(i);
    vec3 neighbor = corner + vec3(
      mod(index, 2.0),
      mod(floor(index * 0.5), 2.0),
      floor(index * 0.25)
    );
    if (hash31(neighbor + seed) >= uCoverage) continue;

    vec3 starDirection = normalize(neighbor + hash33(neighbor + seed));
    // Keep only stars whose projection stays inside their own cell, so each
    // star is drawn by every pixel near it, never by just some of them.
    if (any(notEqual(floor(starDirection * density), neighbor))) continue;

    // Draw each star as a small Gaussian. One narrower than the pixel floor
    // keeps that footprint and dims instead, holding its total light constant,
    // so sub-pixel stars become faint dots that stay steady as the view turns
    // instead of popping between pixel shapes.
    float radius = uStarRadius * mix(uSmallestStar, 1.0, hash31(neighbor + seed + 71.3));
    float sigma = max(radius, minimumSigma);
    float energy = (radius * radius) / (sigma * sigma);
    // Chord length approximates the angle for these tiny separations.
    float distance = length(direction - starDirection);
    light += uBrightness * energy * exp(-0.5 * distance * distance / (sigma * sigma));
  }

  return light;
}

void main() {
  vec3 direction = normalize(vSkyDirection);
  // Angular size of this pixel: the square root of its solid angle. Taken
  // here, in uniform control flow, so the derivatives are well defined.
  float pixelAngle = sqrt(length(cross(dFdx(direction), dFdy(direction))));
  vec3 color = uBackground;

  if (uDebugCells > 0.5) {
    color += hash33(floor(direction * uDensity)) * 0.12;
  }

  color += vec3(starLayer(direction, uDensity, 0.0, pixelAngle));

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
