/** A repeatable coastline: broad headlands with smaller, smoothly varying coves. */
export function shorelineRadius(angle: number, halfX: number, halfZ: number): number {
  const x = Math.cos(angle) / (halfX * 1.19 + 10);
  const z = Math.sin(angle) / (halfZ * 1.19 + 10);
  const roundedIsland = (x ** 4 + z ** 4) ** -0.25;
  const coast = roundedIsland + 4.2 * Math.sin(3 * angle + 0.7)
    + 2.7 * Math.sin(7 * angle + 2.1) + 1.3 * Math.sin(13 * angle - 0.4);
  const paved = Math.min(halfX / Math.abs(Math.cos(angle)), halfZ / Math.abs(Math.sin(angle)));
  return paved + (coast - paved) * 0.4;
}

export function shorelineDistance(x: number, z: number, halfX: number, halfZ: number): number {
  return Math.max(0, Math.hypot(x, z) - shorelineRadius(Math.atan2(z, x), halfX, halfZ));
}
