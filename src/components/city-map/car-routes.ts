import type { CityEntity } from "./map-types";
import { closedRoute, rightOf, type Route } from "./routes";

/** The circuits the district's traffic drives, derived from the roads themselves.
 *
 * Like the pavement circuits, none of the geometry below is written out as coordinates: the map is
 * four blocks stamped from one template plus four avenue arms, and a literal number here would be
 * a second copy of that arithmetic that goes stale silently the first time a street moves. Every
 * circuit reads the carriageway it is going to drive and takes its corners from where that is.
 *
 * THE CITY DRIVES ON THE RIGHT, and holding that is what shapes all of this. A lane is half a
 * carriageway, so a car sits half a lane off the centre line, on the side its right hand points
 * to. On a block that makes every circuit an INSET rectangle taken clockwise; on the roundabout it
 * makes every car circulate with the island on its left; and at the end of an avenue it makes the
 * turnaround a left-hand U-turn. The three look unrelated and are the same rule.
 *
 * EVERY TURN IS AN ARC, never a corner. A walker who pivots on the spot at a kerb reads as a
 * walker turning; a car whose heading jumps ninety degrees between one frame and the next reads as
 * broken. So each circuit is built from straights joined by arcs that are TANGENT to them at both
 * ends -- which is also why the roundabout merges are not simply the point where a lane crosses
 * the circulating lane. That point exists, and joining to it directly snaps the car through about
 * seventy-five degrees at the busiest junction on the map.
 *
 * NO TWO CIRCUITS SHARE A CARRIAGEWAY except the two halves of a block, which share that block's
 * centre street in opposite lanes. That is deliberate, and it is what lets the runtime drive cars
 * as independent point masses with no junction logic at all: two cars can only ever meet where
 * those two circuits pass the same T-junction, a lane apart and briefly. The link roads out to the
 * avenues carry no circuit at all for the same reason -- routing one through them would cross
 * three others. */

/** The road deck's top face, where a car's tyres sit. A road slab is 0.06 deep about its origin
 * and Y is never scaled. The roundabout's asphalt is 0.01 lower on purpose, so its approaches can
 * tuck under it; a car crossing onto it floats by that much, which is a hundredth of a wheel. */
export const ROAD_Y = 0.06;

/** Measured off the road build scripts. road-straight and road-link are both 4.30 across and 50
 * long; the roundabout is an annulus with its lane line painted at 7.35. */
const ROAD_HALF_WIDTH = 2.15;
const ROAD_HALF_LENGTH = 25;
const ROUNDABOUT_OUTER = 9.5;
const ROUNDABOUT_LANE_LINE = 7.35;

/** The widest and longest the car model gets, from build-car.py: the wheels stand a shade proud of
 * the body at 0.955, and the bumpers are 2.15 from the middle. */
const CAR_HALF_WIDTH = 0.955;
const CAR_HALF_LENGTH = 2.15;

/** How much tarmac to leave outside a car when a bend is what decides where it can go. */
const KERB_CLEARANCE = 0.25;

/** Where a car circulates on the roundabout.
 *
 * It wants the middle of the outer lane, and it gets that unless its own body would then overhang
 * the kerb -- which it would. A car following a circle of radius R has its outer front corner out
 * at hypot(R + half its width, half its length), further than R by more than the outer lane has to
 * spare, so the radius is pulled in until that corner clears the outer edge. The result still sits
 * outside the painted lane line, which is where a car entering and leaving belongs. */
const RING_RADIUS = Math.min(
  (ROUNDABOUT_LANE_LINE + ROUNDABOUT_OUTER) / 2,
  Math.sqrt(ROUNDABOUT_OUTER * ROUNDABOUT_OUTER - CAR_HALF_LENGTH * CAR_HALF_LENGTH)
    - CAR_HALF_WIDTH - KERB_CLEARANCE,
);

/** Radius of the arcs that merge an avenue into the roundabout. Big enough to land its lane tangent
 * out on the arm rather than inside the junction, small enough that the whole arc stays on the
 * asphalt the arm and the annulus share where they overlap. */
const MERGE_RADIUS = 3.0;

/** Radius of a block circuit's corners: a car's turn at a junction of two 4.30 streets. */
const CORNER_RADIUS = 2.6;

/** Corners per turn on an arc. A heading is constant along a leg, so this is also how finely a car
 * turns: at 5 degrees a step the yaw ratchets by less than the eye follows. */
const ARC_STEP = Math.PI / 36;

const BLOCKS = ["nw", "ne", "sw", "se"] as const;

/** The avenue arms in the order a car drives them -- which is the order the roundabout hands them
 * out, going round it the way right-hand traffic goes round it. */
const ARMS = ["west", "south", "east", "north"] as const;
type Arm = (typeof ARMS)[number];

/** Each arm's outward direction, away from the roundabout. */
const ARM_HEADING: Record<Arm, Point> = {
  west: { x: -1, z: 0 },
  south: { x: 0, z: 1 },
  east: { x: 1, z: 0 },
  north: { x: 0, z: -1 },
};

interface Point {
  x: number;
  z: number;
}

const plus = (a: Point, b: Point): Point => ({ x: a.x + b.x, z: a.z + b.z });
const minus = (a: Point, b: Point): Point => ({ x: a.x - b.x, z: a.z - b.z });
const times = (a: Point, k: number): Point => ({ x: a.x * k, z: a.z * k });
const angleOf = (point: Point): number => Math.atan2(point.z, point.x);

/** `distance` along the way from `from` to `to`. */
function towards(from: Point, to: Point, distance: number): Point {
  const span = Math.hypot(to.x - from.x, to.z - from.z);
  return span === 0 ? from : plus(from, times(minus(to, from), distance / span));
}

/** Points along a circular arc, both endpoints included.
 *
 * `turn` is which way the driver turns the wheel, not which way the angle runs, because that is
 * the only way to state it that stays true on both axes. A LEFT turn walks atan2(z, x) DOWNWARDS
 * -- counter-clockwise seen from above -- which is how a car goes round a roundabout in right-hand
 * traffic, and how it makes a U-turn. A right turn walks it upwards. */
function arc(centre: Point, radius: number, from: number, to: number, turn: "left" | "right"): Point[] {
  const sign = turn === "left" ? -1 : 1;
  let sweep = (to - from) * sign;
  while (sweep < 0) sweep += Math.PI * 2;
  const steps = Math.max(1, Math.ceil(sweep / ARC_STEP));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = from + (sign * sweep * index) / steps;
    return { x: centre.x + Math.cos(angle) * radius, z: centre.z + Math.sin(angle) * radius };
  });
}

/** Where a road's centre line sits on the axis it does not run along, and how far it reaches.
 *
 * Every road in the district is axis aligned and turned by a multiple of a quarter turn, which is
 * what lets this ignore the general case -- the same simplification the pavement strips make. */
function carriageway(entity: CityEntity) {
  const turn = (((entity.rotationY ?? 0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const alongX = Math.abs(Math.sin(turn)) < 0.5;
  return {
    centre: alongX ? entity.position.z : entity.position.x,
    along: alongX ? entity.position.x : entity.position.z,
    halfLength: ROAD_HALF_LENGTH * (entity.scaleXZ?.x ?? 1),
    /** Half a lane: how far off the centre line a car in the right-hand lane drives. */
    lane: (ROAD_HALF_WIDTH * (entity.scaleXZ?.z ?? 1)) / 2,
  };
}

/** A closed circuit round an axis-aligned rectangle, its corners turned rather than snapped.
 *
 * Taken CLOCKWISE on a north-up map -- north-west, north-east, south-east, south-west -- which on
 * a rectangle inset from the road centre lines puts the driver in the right-hand lane of all four
 * sides. Round the other way and every car in the city drives against the traffic. */
function roundedRectangle(id: string, xs: [number, number], zs: [number, number]): Route {
  const [west, east] = xs[0] <= xs[1] ? xs : [xs[1], xs[0]];
  const [north, south] = zs[0] <= zs[1] ? zs : [zs[1], zs[0]];
  const box: Point[] = [
    { x: west, z: north }, { x: east, z: north },
    { x: east, z: south }, { x: west, z: south },
  ];
  // Never eat more than a quarter of the shorter side, so a small block cannot round itself away.
  const radius = Math.min(CORNER_RADIUS, (east - west) / 4, (south - north) / 4);

  const corners = box.flatMap((corner, index) => {
    const from = towards(corner, box[(index + 3) % 4], radius);
    const to = towards(corner, box[(index + 1) % 4], radius);
    // The arc centre is the fourth point of the square on the two tangents: as far from each leg
    // as the radius, on the inside of the turn.
    const centre = plus(from, minus(to, corner));
    return arc(centre, radius, angleOf(minus(from, centre)), angleOf(minus(to, centre)), "right");
  });

  return closedRoute(id, corners);
}

/** Two circuits per block: one round the northern half of its streets, one round the southern.
 *
 * The obvious circuit is a single lap of the block's ring road, and it is deliberately not what
 * this builds. A block's centre street is the one every founder's building on the two inner rows
 * faces, and a ring-only lap leaves it empty. Splitting the block at that street instead puts
 * traffic down it in both directions and still covers the whole ring, at the cost of the two
 * circuits sharing it -- which is the one place in the city where two circuits touch.
 *
 * THE ORDER MATTERS, because there may be fewer cars than circuits: the runtime shares its traffic
 * out in list order, so a short allocation takes a prefix of this list. Each block's two circuits
 * are therefore split apart -- one half of every block first, then the other -- and which half
 * leads alternates from block to block. A prefix of four is then one car in each of the four
 * blocks, on a different half each time, rather than both cars in Jobs Avenue and none in Hopper
 * Way. Listing each block's pair together would cluster every car the district has into the first
 * block or two. */
function blockCircuits(entities: readonly CityEntity[]): Route[] {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const pairs = BLOCKS.flatMap((block, index) => {
    const road = (suffix: string) => byId.get(`${block}-road-${suffix}`);
    const north = road("ring-north");
    const south = road("ring-south");
    const west = road("ring-west");
    const east = road("ring-east");
    const street = road("starter");
    if (!north || !south || !west || !east || !street) return [];

    // Inset from each ring road's centre line by half a lane. The centre street is shared, so each
    // half takes the lane on its own side of it.
    const [top, bottom, left, right, middle] =
      [north, south, west, east, street].map(carriageway);
    const flanks: [number, number] = [left.centre + left.lane, right.centre - right.lane];
    const halves = [
      roundedRectangle(`${block}-north`, flanks,
        [top.centre + top.lane, middle.centre - middle.lane]),
      roundedRectangle(`${block}-south`, flanks,
        [middle.centre + middle.lane, bottom.centre - bottom.lane]),
    ];
    return [index % 2 === 0 ? halves : [halves[1], halves[0]]];
  });

  return [...pairs.map((pair) => pair[0]), ...pairs.map((pair) => pair[1])];
}

/** One arm of the avenue system, as the four tangent points and three centres a car needs to drive
 * out of the roundabout, down to the water, round, and back in.
 *
 * The two merge arcs are the fiddly part. Each is tangent to its lane AND to the circulating lane,
 * and because the car turns the opposite way on the two -- right to peel off or join, left to go
 * round -- the arc's centre sits a full RING_RADIUS + MERGE_RADIUS from the middle of the map,
 * which is what fixes how far out along the arm the lane tangent lands. */
function armGeometry(road: CityEntity, arm: Arm) {
  const heading = ARM_HEADING[arm];
  const { lane, halfLength, along } = carriageway(road);
  const right = rightOf(heading.x, heading.z);

  const reach = Math.sqrt(
    (RING_RADIUS + MERGE_RADIUS) ** 2 - (lane + MERGE_RADIUS) ** 2,
  );
  const mergeCentre = (side: number) =>
    plus(times(heading, reach), times(right, side * (lane + MERGE_RADIUS)));
  const laneTangent = (side: number) =>
    plus(times(heading, reach), times(right, side * lane));
  // The two circles touch on the line between their centres, RING_RADIUS out from the origin.
  const ringTangent = (side: number) =>
    times(mergeCentre(side), RING_RADIUS / (RING_RADIUS + MERGE_RADIUS));

  // The arm's centre is on its own axis and it points away from the origin, so its far end is
  // simply that much further out. A car swinging round a circle of radius `lane` traces its
  // outermost corner at hypot(lane + half its width, half its length), so the turnaround is
  // centred that far in from the paved edge plus a margin -- otherwise a car mid-U-turn hangs its
  // nose out over the sea wall.
  const shoreline = Math.abs(along) + halfLength;
  const sweep = Math.hypot(lane + CAR_HALF_WIDTH, CAR_HALF_LENGTH);
  const pivot = times(heading, shoreline - sweep - KERB_CLEARANCE);

  return {
    lane,
    ringExit: ringTangent(1),
    ringEntry: ringTangent(-1),
    exitMerge: mergeCentre(1),
    entryMerge: mergeCentre(-1),
    laneOut: laneTangent(1),
    laneIn: laneTangent(-1),
    pivot,
    turnOut: plus(pivot, times(right, lane)),
    turnIn: plus(pivot, times(right, -lane)),
  };
}

/** One circuit covering every avenue and the roundabout.
 *
 * A car leaves the roundabout down an arm, drives it to the shoreline, turns round, comes back,
 * rejoins, takes its share of the roundabout and goes down the next arm -- west, south, east,
 * north, and back to west. The arms are dead ends, so a circuit that uses them at all has to turn
 * round at the water; the alternative was to leave the four longest roads in the district empty. */
function avenueCircuit(entities: readonly CityEntity[]): Route | null {
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  const roads = ARMS.map((arm) => byId.get(`avenue-${arm}-road`));
  if (roads.some((road) => road === undefined)) return null;
  const arms = ARMS.map((arm, index) => armGeometry(roads[index] as CityEntity, arm));

  const corners = arms.flatMap((leg, index) => {
    const next = arms[(index + 1) % arms.length];
    const hairpin = arc(leg.pivot, leg.lane, angleOf(minus(leg.turnOut, leg.pivot)),
      angleOf(minus(leg.turnIn, leg.pivot)), "left");
    return [
      // Peel off the roundabout onto the outbound lane, and run out to the water.
      ...arc(leg.exitMerge, MERGE_RADIUS, angleOf(minus(leg.ringExit, leg.exitMerge)),
        angleOf(minus(leg.laneOut, leg.exitMerge)), "right"),
      leg.turnOut,
      // The U-turn. Its ends are the corners either side of it, so they are not repeated.
      ...hairpin.slice(1, -1),
      leg.turnIn,
      leg.laneIn,
      // Back onto the roundabout, then round it as far as the next arm's exit.
      ...arc(leg.entryMerge, MERGE_RADIUS, angleOf(minus(leg.laneIn, leg.entryMerge)),
        angleOf(minus(leg.ringEntry, leg.entryMerge)), "right").slice(1),
      ...arc({ x: 0, z: 0 }, RING_RADIUS, angleOf(leg.ringEntry), angleOf(next.ringExit), "left")
        .slice(1, -1),
    ];
  });

  return closedRoute("avenues", corners);
}

/** Every circuit the district's traffic drives. */
export function carRoutes(entities: readonly CityEntity[]): Route[] {
  const avenues = avenueCircuit(entities);
  const blocks = blockCircuits(entities);
  return avenues ? [...blocks, avenues] : blocks;
}
