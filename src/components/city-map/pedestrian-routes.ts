/** Every circuit a pedestrian walks, derived from the pavement entities themselves rather than
 * written out as coordinates. The map is generated -- four blocks stamped from one template at an
 * offset -- so literal numbers here would be a second copy of that arithmetic, and the kind that
 * goes stale silently the first time a row moves. `pedestrianRoutes` reads the strips it is going
 * to walk on and takes the corners from where they actually are. */

import type { CityEntity } from "./map-types";
import { closedRoute, type Route } from "./routes";

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

function rectangle(id: string, xs: [number, number], zs: [number, number]): Route {
  const [west, east] = xs[0] <= xs[1] ? xs : [xs[1], xs[0]];
  const [north, south] = zs[0] <= zs[1] ? zs : [zs[1], zs[0]];
  return closedRoute(id, [
    { x: west, z: north }, { x: east, z: north },
    { x: east, z: south }, { x: west, z: south },
  ]);
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
export function pedestrianRoutes(entities: readonly CityEntity[]): Route[] {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const routes: Route[] = [];

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
