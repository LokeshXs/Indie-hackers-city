/** Closed circuits, and how to walk or drive one.
 *
 * Shared by the pavements and the roads. The two build their circuits from completely different
 * things -- pedestrian-routes reads the pavement slabs, car-routes reads the carriageways -- but
 * once a circuit exists it is the same polyline either way, and both want the same answer from it:
 * where am I, and which way am I facing. */

export interface Route {
  id: string;
  /** Closed: the last corner joins back to the first. */
  corners: ReadonlyArray<{ x: number; z: number }>;
  /** Cumulative distance to each corner, plus the total as the final entry. */
  distances: readonly number[];
  length: number;
}

export function closedRoute(id: string, corners: ReadonlyArray<{ x: number; z: number }>): Route {
  const distances = [0];
  for (let index = 0; index < corners.length; index += 1) {
    const a = corners[index];
    const b = corners[(index + 1) % corners.length];
    distances.push(distances[index] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return { id, corners, distances, length: distances[distances.length - 1] };
}

/** Where a route puts a traveller `travelled` units along it, and the heading to face.
 *
 * Models are authored facing +Y in Blender, which export_yup turns into -Z. Turning a -Z facing
 * group about Y by t aims it along (-sin t, -cos t), so BOTH components of the direction are
 * negated going into atan2 -- equivalently, it is the +Z heading plus half a turn. Negating only
 * one of them survives every leg that runs along Z and reverses every leg that runs along X,
 * which on a rectangular circuit means two sides of each block travelled backwards. */
export function pointAt(route: Route, travelled: number) {
  const total = route.length;
  const along = ((travelled % total) + total) % total;
  let index = 0;
  while (index < route.corners.length - 1 && route.distances[index + 1] <= along) index += 1;
  const a = route.corners[index];
  const b = route.corners[(index + 1) % route.corners.length];
  const legLength = route.distances[index + 1] - route.distances[index];
  const share = legLength > 0 ? (along - route.distances[index]) / legLength : 0;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return {
    x: a.x + dx * share,
    z: a.z + dz * share,
    heading: Math.atan2(-dx, -dz),
  };
}

/** The direction a traveller heading `x, z` would call its right hand.
 *
 * right = forward x up, in a right-handed world with +Y up: facing -Z (north, the direction a
 * model faces at rotation zero) puts the right hand on +X (east), as it should. Both traffic
 * systems in this map are built on this one function -- lane offsets on the roads, and which side
 * of a rectangle a circuit has to be inset to. */
export function rightOf(dx: number, dz: number): { x: number; z: number } {
  return { x: -dz, z: dx };
}
