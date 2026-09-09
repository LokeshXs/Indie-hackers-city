import { describe, expect, it } from "vitest";
import { starterDistrict } from "./map-data";
import { closedRoute, pedestrianRoutes, pointAt, strip, stripHalfWidth } from "./pedestrian-routes";

const pavement = starterDistrict.entities.filter((entity) => entity.assetId === "sidewalk-straight");

/** Every pavement slab as a world-space rectangle. */
const slabs = pavement.map((entity) => {
  const line = strip(entity);
  const half = stripHalfWidth(entity);
  return line.alongX
    ? { x0: line.from, x1: line.to, z0: line.centre - half, z1: line.centre + half }
    : { x0: line.centre - half, x1: line.centre + half, z0: line.from, z1: line.to };
});

/** Distance from a point to the nearest slab, 0 when it is standing on one. */
function gapToPavement(x: number, z: number) {
  let best = Infinity;
  for (const slab of slabs) {
    const dx = Math.max(slab.x0 - x, 0, x - slab.x1);
    const dz = Math.max(slab.z0 - z, 0, z - slab.z1);
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
}

function walk(routeLength: number, step = 0.25) {
  return Array.from({ length: Math.ceil(routeLength / step) }, (_, index) => index * step);
}

describe("pedestrian routes", () => {
  const routes = pedestrianRoutes(starterDistrict.entities);

  it("builds two row circuits for each of the four blocks", () => {
    expect(routes.map((route) => route.id).sort()).toEqual([
      "ne-north-row", "ne-south-row",
      "nw-north-row", "nw-south-row",
      "se-north-row", "se-south-row",
      "sw-north-row", "sw-south-row",
    ]);
  });

  it("never puts a walker off the pavement, anywhere on any circuit", () => {
    // The invariant the whole route design exists to hold. A block's outer ring would be the
    // natural third circuit per block and is deliberately not offered, because its pavement is
    // cut for two link roads and walking it means stepping onto tarmac; this fails the moment
    // any route is added back that does.
    for (const route of routes) {
      const worst = Math.max(...walk(route.length)
        .map((along) => pointAt(route, along))
        .map((point) => gapToPavement(point.x, point.z)));
      expect({ id: route.id, worst }).toEqual({ id: route.id, worst: 0 });
    }
  });

  it("keeps every circuit clear of the roadway", () => {
    // Measured straight off the road models: a road-straight is 4.30 across, a road-link 4.30,
    // and the roundabout a 9.50 radius. Being on a pavement and being off the road are not the
    // same claim -- a kerbside strip sits right against the carriageway -- so this checks the
    // second one on its own.
    const halves: Record<string, { x: number; z: number }> = {
      "road-straight": { x: 25, z: 2.15 },
      "road-link": { x: 5, z: 2.15 },
      roundabout: { x: 9.5, z: 9.5 },
    };
    const roads = starterDistrict.entities.filter((entity) => halves[entity.assetId]).map((entity) => {
      const half = halves[entity.assetId];
      const turn = (((entity.rotationY ?? 0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const alongX = Math.abs(Math.sin(turn)) < 0.5;
      const hx = alongX ? half.x * (entity.scaleXZ?.x ?? 1) : half.z * (entity.scaleXZ?.z ?? 1);
      const hz = alongX ? half.z * (entity.scaleXZ?.z ?? 1) : half.x * (entity.scaleXZ?.x ?? 1);
      return {
        x0: entity.position.x - hx, x1: entity.position.x + hx,
        z0: entity.position.z - hz, z1: entity.position.z + hz,
      };
    });
    for (const route of routes) {
      const onRoad = walk(route.length)
        .map((along) => pointAt(route, along))
        .filter((point) => roads.some((road) =>
          point.x >= road.x0 && point.x <= road.x1 && point.z >= road.z0 && point.z <= road.z1));
      expect({ id: route.id, onRoad: onRoad.length }).toEqual({ id: route.id, onRoad: 0 });
    }
  });

  it("faces the direction of travel on every leg", () => {
    // The model is authored facing -Z, so a group turned by `heading` aims along
    // (-sin, -cos). Walking a square confirms both axes, which is the pair a single-negated
    // atan2 gets half right.
    const square = closedRoute("square", [
      { x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }, { x: 0, z: 10 },
    ]);
    const facing = (along: number) => {
      const { heading } = pointAt(square, along);
      return { x: -Math.sin(heading), z: -Math.cos(heading) };
    };
    expect(facing(5).x).toBeCloseTo(1);    // heading east
    expect(facing(5).z).toBeCloseTo(0);
    expect(facing(15).z).toBeCloseTo(1);   // then south
    expect(facing(15).x).toBeCloseTo(0);
    expect(facing(25).x).toBeCloseTo(-1);  // then west
    expect(facing(35).z).toBeCloseTo(-1);  // then north, closing the loop
  });

  it("wraps travelled distance so a walker never runs off the end of a circuit", () => {
    const route = routes[0];
    const start = pointAt(route, 0);
    const lap = pointAt(route, route.length);
    expect(lap.x).toBeCloseTo(start.x);
    expect(lap.z).toBeCloseTo(start.z);
    // Negative and multi-lap distances resolve onto the circuit rather than clamping to an end.
    const behind = pointAt(route, -route.length * 2.5);
    const ahead = pointAt(route, route.length * 0.5);
    expect(behind.x).toBeCloseTo(ahead.x);
    expect(behind.z).toBeCloseTo(ahead.z);
    expect(behind.heading).toBeCloseTo(ahead.heading);
  });
});
