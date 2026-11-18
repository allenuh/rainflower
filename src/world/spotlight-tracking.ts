import { Vector3, type SpotLight, type Vector3Like } from 'three';

export function createSpotlightYawTracker(light: SpotLight, initialPlayerPosition: Vector3Like) {
  const zOffset = light.position.z - initialPlayerPosition.z;
  const horizontalReach = Math.hypot(
    light.target.position.x - light.position.x,
    light.target.position.z - light.position.z,
  );
  const verticalOffset = light.target.position.y - light.position.y;
  const direction = new Vector3();

  return (playerPosition: Vector3Like) => {
    // Translate the target too, preserving the aim if the player is directly below.
    const nextZ = playerPosition.z + zOffset;
    light.target.position.z += nextZ - light.position.z;
    light.position.z = nextZ;

    direction.set(
      playerPosition.x - light.position.x,
      0,
      playerPosition.z - light.position.z,
    );
    // Directly below the light there is no horizontal direction to turn toward.
    if (direction.lengthSq() < 0.000001) return;

    // Keep the target on a horizontal circle to preserve the original pitch.
    direction.normalize().multiplyScalar(horizontalReach);
    light.target.position.set(
      light.position.x + direction.x,
      light.position.y + verticalOffset,
      light.position.z + direction.z,
    );
  };
}
