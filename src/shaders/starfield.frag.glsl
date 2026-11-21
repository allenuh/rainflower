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
uniform vec3 uStarColors[4];  // Temperature ramp: warm orange, pale yellow, white, blue-white.
uniform vec4 uStarColorStops; // Ramp positions for those colors, in [0, 1].
uniform float uTintStrength;  // 0 is pure white stars, 1 is the full ramp color.
// Glow on the brightest stars: a soft halo, then a four-point cross glint on
// the very brightest, like the lens glow and star filters of 90s renders.
uniform vec3 uLayerGlow;      // Per layer, 0-1: which layers may glow (their cells must be wide).
uniform float uGlowThreshold; // Flux at which a halo starts to appear.
uniform float uGlowRadius;    // Angular sigma of the halo, in radians.
uniform float uGlowStrength;
uniform float uGlintThreshold; // Flux at which the cross glint starts to appear.
uniform float uGlintLength;   // Angular falloff length of each spike, in radians.
uniform float uGlintStrength;
uniform float uDebugCells;    // 1 tints the bright layer's lattice cells.

varying vec3 vSkyDirection;

// A star's color from a 0-1 temperature, scaled to unit luminance so the
// tint changes hue but never brightness. Bright stars take more of the tint,
// much as the eye only sees color in the brighter stars of a real sky.
vec3 starTint(float temperature, float flux) {
  vec3 color = colorRamp(temperature, uStarColorStops, uStarColors);
  color /= max(dot(color, vec3(0.2126, 0.7152, 0.0722)), 0.0001);
  float strength = uTintStrength * mix(0.4, 1.0, sqrt(flux));
  return mix(vec3(1.0), color, strength);
}

// One star per lattice cell, scattered in 3D and projected onto the sphere,
// in the spirit of cell-noise starfields (POV-Ray granite thresholds, OSL
// cellnoise). Working in 3D avoids a longitude seam or crowding at the poles.
// pixelAngle is the angular width of one pixel at this direction. Each star's
// visible footprint, glow included, must stay well under half a cell.
// Returns the layer's light, tinted per star.
vec3 starLayer(
  vec3 direction,
  float density,
  float coverage,
  float brightness,
  float seed,
  float glow,
  float pixelAngle
) {
  vec3 point = direction * density;
  vec3 cell = floor(point);
  // The eight cells whose centers surround the point. Any star within half a
  // cell of the point lies in one of them, so no star is cut off at a border.
  vec3 corner = cell + step(0.5, fract(point)) - 1.0;
  float minimumSigma = uPixelSigma * pixelAngle;
  vec3 light = vec3(0.0);

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
    float starLight = brightness * energy * exp(-0.5 * distance * distance / (sigma * sigma));

    if (glow > 0.0) {
      // The halo is a wide, faint Gaussian around the star's core.
      float halo = glow * smoothstep(uGlowThreshold, 1.0, flux);
      starLight += halo * uGlowStrength
        * exp(-0.5 * distance * distance / (uGlowRadius * uGlowRadius));

      // Spikes run along the sky's horizontal and vertical at the star. Each
      // is a pixel-thin line whose brightness falls off away from the star.
      float glint = glow * smoothstep(uGlintThreshold, 1.0, flux);
      if (glint > 0.0) {
        vec3 offset = direction - starDirection;
        vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), starDirection) + vec3(1e-5, 0.0, 0.0));
        vec3 north = cross(starDirection, east);
        float x = dot(offset, east);
        float y = dot(offset, north);
        float width = 2.0 * minimumSigma * minimumSigma;
        float spikes = exp(-abs(x) / uGlintLength - y * y / width)
          + exp(-abs(y) / uGlintLength - x * x / width);
        starLight += glint * uGlintStrength * spikes;
      }
    }

    float temperature = hash31(neighbor + seed + 29.7);
    light += starTint(temperature, flux) * starLight;
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

  vec3 light = vec3(0.0);
  for (int layer = 0; layer < 3; layer++) {
    if (uLayerMask[layer] < 0.5) continue;
    light += starLayer(
      direction,
      uLayerDensity[layer],
      uLayerCoverage[layer],
      uLayerBrightness[layer],
      float(layer) * 113.0,
      uLayerGlow[layer],
      pixelAngle
    );
  }
  color += light * uBrightness;

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
