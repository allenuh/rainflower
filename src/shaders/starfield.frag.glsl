uniform vec3 uBackground;
// Three star layers, one per component: sparse bright, medium, dense faint.
uniform vec3 uLayerDensity;    // Lattice cells across the sky sphere's radius.
uniform vec3 uLayerCoverage;   // Fraction of cells that hold a star.
uniform vec3 uLayerBrightness; // Light of the layer's brightest possible star.
uniform vec3 uLayerMask;       // 1 shows a layer, 0 hides it (debug).
uniform float uMagnitudeExponent; // Higher makes bright stars rarer.
uniform float uStarRadius;    // Angular radius (Gaussian sigma) of a full-brightness star, in radians.
uniform float uPixelSigma;    // Narrowest a star is drawn, in pixels.
uniform float uBrightness;    // Overall gain.
uniform float uDebugCells;    // 1 tints the bright layer's lattice cells.

varying vec3 vSkyDirection;

// One star per lattice cell, scattered in 3D and projected onto the sphere,
// in the spirit of cell-noise starfields (POV-Ray granite thresholds, OSL
// cellnoise). Working in 3D avoids a longitude seam or crowding at the poles.
// pixelAngle is the angular width of one pixel at this direction. Each star's
// visible footprint must stay well under half a cell (about 3 sigma).
float starLayer(
  vec3 direction,
  float density,
  float coverage,
  float brightness,
  float seed,
  float pixelAngle
) {
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
    if (hash31(neighbor + seed) >= coverage) continue;

    vec3 starDirection = normalize(neighbor + hash33(neighbor + seed));
    // Keep only stars whose projection stays inside their own cell, so each
    // star is drawn by every pixel near it, never by just some of them.
    if (any(notEqual(floor(starDirection * density), neighbor))) continue;

    // Power-law magnitudes: most stars are faint and only a few are bright,
    // as in a real sky. Light grows with the star's area, so brighter stars
    // are also wider, and only the brightest outgrow a single pixel.
    float flux = pow(hash31(neighbor + seed + 71.3), uMagnitudeExponent);
    float radius = uStarRadius * sqrt(flux);

    // Draw each star as a small Gaussian. One narrower than the pixel floor
    // keeps that footprint and dims instead, holding its total light constant,
    // so sub-pixel stars become faint dots that stay steady as the view turns
    // instead of popping between pixel shapes.
    float sigma = max(radius, minimumSigma);
    float energy = (radius * radius) / (sigma * sigma);
    // Chord length approximates the angle for these tiny separations.
    float distance = length(direction - starDirection);
    light += brightness * energy * exp(-0.5 * distance * distance / (sigma * sigma));
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
    color += hash33(floor(direction * uLayerDensity.x)) * 0.12;
  }

  float light = 0.0;
  for (int layer = 0; layer < 3; layer++) {
    if (uLayerMask[layer] < 0.5) continue;
    light += starLayer(
      direction,
      uLayerDensity[layer],
      uLayerCoverage[layer],
      uLayerBrightness[layer],
      float(layer) * 113.0,
      pixelAngle
    );
  }
  color += vec3(light * uBrightness);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
