uniform vec3 uBackground;
uniform float uDensity;    // Lattice cells across the sky sphere's radius.
uniform float uCoverage;   // Fraction of cells that hold a star.
uniform float uStarRadius; // Angular radius of a star, in radians.
uniform float uDebugCells; // 1 tints each lattice cell to show the placement grid.

varying vec3 vSkyDirection;

// One star per lattice cell, scattered in 3D and projected onto the sphere,
// in the spirit of cell-noise starfields (POV-Ray granite thresholds, OSL
// cellnoise). Working in 3D avoids a longitude seam or crowding at the poles.
float starLayer(vec3 direction, float density, float seed) {
  vec3 point = direction * density;
  vec3 cell = floor(point);
  // The eight cells whose centers surround the point. Any star within half a
  // cell of the point lies in one of them, so no star is cut off at a border.
  vec3 corner = cell + step(0.5, fract(point)) - 1.0;
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

    // Chord length approximates the angle for these tiny separations.
    float distance = length(direction - starDirection);
    light = max(light, step(distance, uStarRadius));
  }

  return light;
}

void main() {
  vec3 direction = normalize(vSkyDirection);
  vec3 color = uBackground;

  if (uDebugCells > 0.5) {
    color += hash33(floor(direction * uDensity)) * 0.12;
  }

  color += vec3(starLayer(direction, uDensity, 0.0));

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
