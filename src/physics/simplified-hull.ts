export interface SimplifiedHullOptions {
  /** How many directions to sample the outline in; the hull has at most this many points above its base. */
  directions: number;
  /**
   * Points within this distance above the lowest one are flattened onto it,
   * giving the hull a single flat base to rest on.
   */
  flatBase: number;
  /** How many directions to sample the base's outline in. */
  baseDirections: number;
}

/**
 * Points for a rough, cheap convex collider around a detailed mesh (x, y, z
 * triples, y up). Keeps only the outermost point in each of `directions`
 * evenly spread directions instead of every vertex, and flattens the bottom
 * into one face, so the shape rests steadily instead of rocking between
 * thousands of tiny facets. Pass the result to a convex hull.
 */
export function simplifiedHullPoints(
  points: ArrayLike<number>,
  { directions, flatBase, baseDirections }: SimplifiedHullOptions,
) {
  let lowest = Infinity;
  for (let index = 1; index < points.length; index += 3) lowest = Math.min(lowest, points[index]);
  const baseTop = lowest + flatBase;

  const kept = new Set<number>();
  // Directions spread evenly over a sphere, on a Fibonacci spiral.
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let index = 0; index < directions; index++) {
    const y = 1 - (2 * (index + 0.5)) / directions;
    const ring = Math.sqrt(1 - y * y);
    kept.add(farthestPoint(points, Math.cos(golden * index) * ring, y, Math.sin(golden * index) * ring));
  }
  // The outline of the base slice, so the flat bottom is as wide as the feet.
  for (let index = 0; index < baseDirections; index++) {
    const angle = (2 * Math.PI * index) / baseDirections;
    kept.add(farthestPoint(points, Math.cos(angle), 0, Math.sin(angle), baseTop));
  }

  const result: number[] = [];
  for (const point of kept) {
    if (point < 0) continue;
    const y = points[point + 1];
    result.push(points[point], y <= baseTop ? lowest : y, points[point + 2]);
  }
  return new Float32Array(result);
}

/**
 * Index (into `points`) of the point farthest along (x, y, z), optionally only
 * among points no higher than `maxY`; -1 if none qualify.
 */
function farthestPoint(points: ArrayLike<number>, x: number, y: number, z: number, maxY = Infinity) {
  let best = -1;
  let bestDistance = -Infinity;
  for (let index = 0; index < points.length; index += 3) {
    if (points[index + 1] > maxY) continue;
    const distance = points[index] * x + points[index + 1] * y + points[index + 2] * z;
    if (distance > bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}
