import type { CityEntity } from "./map-types";

/** A closed circuit a pedestrian walks, as a polyline of corners in world XZ.
 *
 * Every route is derived from the pavement entities themselves rather than written out as
 * coordinates. The map is generated -- four blocks stamped from one template at an offset -- so
 * literal numbers here would be a second copy of that arithmetic, and the kind that goes stale
 * silently the first time a row moves. `pedestrianRoutes` reads the strips it is going to walk on
 * and takes the corners from where they actually are. */
export interface WalkRoute {
  id: string;
  /** Closed: the last corner joins back to the first. */
  corners: ReadonlyArray<{ x: number; z: number }>;
  /** Cumulative distance to each corner, plus the total as the final entry. */
  distances: readonly number[];
  length: number;
}

/** The pavement's top face. The slab is 0.18 deep about its origin and Y is never scaled. */
export const PAVEMENT_Y = 0.09;

const SLAB_HALF_LENGTH = 25;
const SLAB_HALF_WIDTH = 1;

interface Strip {
  /** true → the strip runs along X, so its centreline is a fixed Z. */
  alongX: boolean;
  /** The fixed coordinate: Z for a strip along X, X for one along Z. */
  centre: number;
  from: number;
  to: number;
}

/** A pavement entity as a centreline segment. Every strip in the city is axis aligned and
 * rotated by a multiple of a quarter turn, which is what lets this ignore the general case. */
export function strip(entity: CityEntity): Strip {
  const turn = (((entity.rotationY ?? 0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const alongX = Math.abs(Math.sin(turn)) < 0.5;
  const half = (entity.scaleXZ?.x ?? 1) * SLAB_HALF_LENGTH;
  const along = alongX ? entity.position.x : entity.position.z;
  return {
    alongX,
    centre: alongX ? entity.position.z : entity.position.x,
    from: along - half,
    to: along + half,
  };
}

/** Half the walkable width of a strip, for the on-pavement check. */
export function stripHalfWidth(entity: CityEntity): number {
  return (entity.scaleXZ?.z ?? 1) * SLAB_HALF_WIDTH;
}

function rectangle(id: string, xs: [number, number], zs: [number, number]): WalkRoute {
  const [west, east] = xs[0] <= xs[1] ? xs : [xs[1], xs[0]];
  const [north, south] = zs[0] <= zs[1] ? zs : [zs[1], zs[0]];
  return closedRoute(id, [
    { x: west, z: north }, { x: east, z: north },
    { x: east, z: south }, { x: west, z: south },
  ]);
}

export function closedRoute(id: string, corners: ReadonlyArray<{ x: number; z: number }>): WalkRoute {
  const distances = [0];
  for (let index = 0; index < corners.length; index += 1) {
    const a = corners[index];
    const b = corners[(index + 1) % corners.length];
    distances.push(distances[index] + Math.hypot(b.x - a.x, b.z - a.z));
  }
  return { id, corners, distances, length: distances[distances.length - 1] };
}

/** Where a route puts a walker `travelled` units along it, and the heading to face.
 *
 * The model is authored facing +Y in Blender, which export_yup turns into -Z. Turning a -Z facing
 * group about Y by t aims it along (-sin t, -cos t), so BOTH components of the direction are
 * negated going into atan2 -- equivalently, it is the +Z heading plus half a turn. Negating only
 * one of them survives every leg that runs along Z and reverses every leg that runs along X,
 * which on these rectangular circuits means two sides of each block walked backwards. */
export function pointAt(route: WalkRoute, travelled: number) {
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

const BLOCKS = ["nw", "ne", "sw", "se"] as const;

/** Every circuit in the district, derived from the pavement.
 *
 * Two per block, one for each plot row: a loop wrapping that row's centre street and the outer
 * row pathway behind it, so walkers pass the buildings founders actually own.
 *
 * NO CIRCUIT EVER TOUCHES A ROAD, and that constraint is what picks these two. A block's outer
 * ring is the obvious third -- a long promenade round the waterfront -- but its pavement is cut
 * in two places for the link roads that reach the avenues, so walking it means 4.2 units of
 * tarmac at each gap. Crossing there is real pedestrian behaviour, and it still reads as a figure
 * standing in the road: there is nothing painted to say otherwise, and at map zoom there is no
 * room for anything that would. The waterfront is left empty rather than have anyone step off the
 * kerb. Restoring it needs a marked crossing at those eight points, not a route change.
 *
 * The loops close through the inner connectors at x = +-24, which is why those are read for their
 * X rather than assumed: they are the only pavement joining a centre street to the row behind it,
 * and without them the circuit would cut across a plot. */
export function pedestrianRoutes(entities: readonly CityEntity[]): WalkRoute[] {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const routes: WalkRoute[] = [];

  const centreOf = (id: string): number | null => {
    const entity = byId.get(id);
    return entity ? strip(entity).centre : null;
  };

  for (const block of BLOCKS) {
    for (const half of ["north", "south"] as const) {
      const west = centreOf(`${block}-pathway-inner-west-${half}`);
      const east = centreOf(`${block}-pathway-inner-east-${half}`);
      const street = centreOf(`${block}-pathway-center-${half}`);
      const row = centreOf(`${block}-pathway-${half}-outer`);
      if (west === null || east === null || street === null || row === null) continue;
      routes.push(rectangle(`${block}-${half}-row`, [west, east], [street, row]));
    }
  }

  return routes;
}
