import { describe, expect, it } from "vitest";
import { starterDistrict } from "./map-data";
import { carRoutes } from "./car-routes";
import { pointAt, rightOf, type Route } from "./routes";

/** The car model's own footprint, from build-car.py, so these checks are about where the CAR is
 * rather than only where its centre line is. On a curve those are different: a car's outer corner
 * swings wider than the arc it follows, which is exactly the mistake the turnaround radii and the
 * roundabout radius exist to avoid. */
const CAR_HALF_WIDTH = 0.955;
const CAR_HALF_LENGTH = 2.15;

/** Every carriageway as a world-space rectangle, measured straight off the road models: a
 * road-straight is 50 x 4.30 and a road-link 10 x 4.30. */
const STRAIGHT_HALVES: Record<string, { along: number; across: number }> = {
  "road-straight": { along: 25, across: 2.15 },
  "road-link": { along: 5, across: 2.15 },
};

const straights = starterDistrict.entities
  .filter((entity) => STRAIGHT_HALVES[entity.assetId])
  .map((entity) => {
    const half = STRAIGHT_HALVES[entity.assetId];
    const turn = (((entity.rotationY ?? 0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const alongX = Math.abs(Math.sin(turn)) < 0.5;
    const hx = alongX ? half.along * (entity.scaleXZ?.x ?? 1) : half.across * (entity.scaleXZ?.z ?? 1);
    const hz = alongX ? half.across * (entity.scaleXZ?.z ?? 1) : half.along * (entity.scaleXZ?.x ?? 1);
    return {
      alongX,
      centre: alongX ? entity.position.z : entity.position.x,
      halfWidth: alongX ? hz : hx,
      x0: entity.position.x - hx, x1: entity.position.x + hx,
      z0: entity.position.z - hz, z1: entity.position.z + hz,
    };
  });

/** The roundabout is drivable between its kerb and its outer edge, and nowhere else: the island
 * inside it is grass. A box would call the island tarmac. */
const roundabouts = starterDistrict.entities
  .filter((entity) => entity.assetId === "roundabout")
  .map((entity) => ({ x: entity.position.x, z: entity.position.z, inner: 5.2, outer: 9.5 }));

function onRoad(x: number, z: number): boolean {
  if (straights.some((road) => x >= road.x0 && x <= road.x1 && z >= road.z0 && z <= road.z1)) return true;
  return roundabouts.some((ring) => {
    const radius = Math.hypot(x - ring.x, z - ring.z);
    return radius >= ring.inner && radius <= ring.outer;
  });
}

/** The four corners of a car standing at `point` facing `heading`. Checking the corners rather
 * than the whole footprint is a proxy, and a sound one here: every road is convex, and a rectangle
 * whose corners all sit inside one convex road sits inside it entirely. */
function corners(x: number, z: number, heading: number) {
  const forward = { x: -Math.sin(heading), z: -Math.cos(heading) };
  const right = rightOf(forward.x, forward.z);
  return [-1, 1].flatMap((ahead) => [-1, 1].map((side) => ({
    x: x + forward.x * ahead * CAR_HALF_LENGTH + right.x * side * CAR_HALF_WIDTH,
    z: z + forward.z * ahead * CAR_HALF_LENGTH + right.z * side * CAR_HALF_WIDTH,
  })));
}

function drive(route: Route, step = 0.4) {
  return Array.from({ length: Math.ceil(route.length / step) }, (_, index) =>
    pointAt(route, index * step));
}

describe("car routes", () => {
  const routes = carRoutes(starterDistrict.entities);
  const byId = new Map(routes.map((route) => [route.id, route]));

  it("builds two circuits for each block, plus one for the avenues", () => {
    expect(routes.map((route) => route.id).sort()).toEqual([
      "avenues",
      "ne-north", "ne-south",
      "nw-north", "nw-south",
      "se-north", "se-south",
      "sw-north", "sw-south",
    ]);
  });

  it("never puts a car off the tarmac, anywhere on any circuit", () => {
    // The invariant the whole thing exists to hold, and the reason the roundabout radius and the
    // shoreline turnarounds are derived from the car's own size rather than chosen: this is about
    // the car's four corners, not just the point the route puts it at.
    for (const route of routes) {
      const off = drive(route)
        .flatMap(({ x, z, heading }) => corners(x, z, heading))
        .filter((corner) => !onRoad(corner.x, corner.z));
      expect({ id: route.id, off: off.length }).toEqual({ id: route.id, off: 0 });
    }
  });

  it("keeps a block's traffic in the right-hand lane the whole way round", () => {
    // A car is on the correct side when its offset from a road's centre line points the same way
    // as its own right hand. At a junction it sits on two roads at once and only needs to be
    // correct on one of them -- which is the whole of what turning a corner is.
    for (const route of routes.filter((candidate) => candidate.id !== "avenues")) {
      const wrongSide = drive(route).filter(({ x, z, heading }) => {
        const forward = { x: -Math.sin(heading), z: -Math.cos(heading) };
        const right = rightOf(forward.x, forward.z);
        return !straights.some((road) => {
          const offset = (road.alongX ? z : x) - road.centre;
          if (Math.abs(offset) > road.halfWidth) return false;
          if (x < road.x0 || x > road.x1 || z < road.z0 || z > road.z1) return false;
          return offset * (road.alongX ? right.z : right.x) > 0;
        });
      });
      expect({ id: route.id, wrongSide: wrongSide.length }).toEqual({ id: route.id, wrongSide: 0 });
    }
  });

  it("drives each block's centre street in both directions", () => {
    // The reason a block gets two circuits rather than one lap of its ring road. Jobs Avenue's
    // centre street runs along z = -40; a car on it is within a lane of that line.
    const passes = (["nw-north", "nw-south"] as const).map((id) =>
      drive(byId.get(id) as Route)
        .filter((point) => Math.abs(point.z + 40) < 2.15 && Math.abs(point.x + 40) < 20)
        .map((point) => Math.sign(-Math.sin(point.heading))));
    expect(passes[0].every((direction) => direction === -1)).toBe(true);   // northern half: westward
    expect(passes[1].every((direction) => direction === 1)).toBe(true);    // southern half: eastward
    // And on opposite sides of the centre line, which is what makes that legal.
    expect(Math.max(...drive(byId.get("nw-north") as Route)
      .filter((point) => Math.abs(point.z + 40) < 2.15).map((point) => point.z))).toBeLessThan(-40);
  });

  it("takes the avenue circuit out to all four shorelines and back", () => {
    // The turnarounds are what make the arms usable at all, so this pins that the circuit actually
    // reaches them: the paved island is 69.2 by 68.55, and a car gets within a few units of each.
    const points = drive(byId.get("avenues") as Route);
    expect(Math.min(...points.map((point) => point.x))).toBeLessThan(-64);
    expect(Math.max(...points.map((point) => point.x))).toBeGreaterThan(64);
    expect(Math.min(...points.map((point) => point.z))).toBeLessThan(-63);
    expect(Math.max(...points.map((point) => point.z))).toBeGreaterThan(63);
    // And that it goes round the island rather than through it.
    expect(Math.min(...points.map((point) => Math.hypot(point.x, point.z)))).toBeGreaterThan(5.5);
  });

  it("never swings the wheel further than a car can swing it", () => {
    // Tangent arcs, not corners: no leg of any circuit may turn more than the arcs' own step. A
    // circuit that snapped through a junction would pass every check above and still look broken,
    // which is why this is measured leg by leg rather than by sampling -- a sample can straddle
    // two legs and blur exactly the discontinuity being looked for.
    for (const route of routes) {
      const headings = route.corners.map((corner, index) => {
        const next = route.corners[(index + 1) % route.corners.length];
        return Math.atan2(next.z - corner.z, next.x - corner.x);
      });
      const worst = Math.max(...headings.map((heading, index) => {
        const turn = headings[(index + 1) % headings.length] - heading;
        return Math.abs(((turn + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      }));
      // The arcs step by 5 degrees; a snapped corner would be 90.
      expect({ id: route.id, sharp: worst > Math.PI / 30 }).toEqual({ id: route.id, sharp: false });
    }
  });
});
