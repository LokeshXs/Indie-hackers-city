/** The dog a founder earns at 390 XP: where it is allowed to be, and what it is doing.
 *
 * Everything here is pure. A dog's whole behaviour is a function of its plot id and the clock, so
 * the component that renders one has nothing to decide -- it reads a pose and writes it onto nine
 * nodes. That split is what makes the interesting half testable without a canvas, in the way
 * roof-anchors.test.ts and plot-builds.test.ts already test the interesting half of the roof
 * decoration and the rooftop sign.
 *
 * NOTHING IS RANDOM. Integer-math hashing from the plot id only, matching Pedestrians and map-data,
 * so a founder's dog keeps the same lap, the same speed and the same rhythm on every machine and
 * across every reload. A dog that shuffled its routine each time the map loaded would read as a
 * different dog. */

import type { CityDevelopment, CityDevelopmentRecord } from "@/lib/city/types";
import { unlocksFor } from "@/lib/city/unlocks";
import type { PlotBuildingAssetId } from "@/lib/city/types";
import { BUILDING_LAWN_BANDS, type LawnBand } from "./city-assets";
import type { CityEntity, WorldPosition } from "./map-types";
import { closedRoute, pointAt, type Route } from "./routes";

/** "stand" is never scheduled. It exists for the places that show a dog holding still -- see
 * petStandPose -- and SEGMENTS below is what a dog actually does. */
export type PetState = "trot" | "sit" | "sleep" | "stand";

function smoothstep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}


/** How big the dog is rendered, against the size build-pet-dog.py authors it at.
 *
 * The model is built at roughly life size -- 0.45 long against a 1.85 pedestrian -- and at life
 * size it is four percent of a building's frontage and reads as a smudge on the grass. Nothing
 * about this city is to scale anyway (a plot is 11 units across for a 64-plot district), and a
 * reward nobody can pick out is not a reward.
 *
 * This is THE number to change if the dog wants to be bigger or smaller. Everything downstream is
 * derived from it: the clearances below, and through them every band in BUILDING_LAWN_BANDS --
 * which is measured against the shipped models by city-assets.test.ts, so a change here that no
 * longer fits between a doorstep and the kerb fails the suite rather than putting a dog through a
 * wall. Much past this the dog stops fitting on the grass at all: the front strip is barely a unit
 * deep on most shells. */
export const PET_SCALE = 3.0;

/** How much room the dog needs around itself, in world units.
 *
 * TWO numbers, not one, and the difference is what lets the dog be this size at all. Its lap is a
 * wide, shallow oval across the frontage, so it spends almost all of its time BROADSIDE to the
 * building: what has to fit between the doorstep and the kerb is the dog's width, while what has
 * to fit before it reaches the edge of the plot is its length. A single clearance taken from the
 * length would need a lawn a third deeper than any shell in the kit actually has.
 *
 * The cost is honest and small: at the two turns in its lap the dog comes round to face the house,
 * and its nose can reach a few centimetres closer than the band promises. A dog that puts its nose
 * near a doorstep is a dog. */
export const PET_DEPTH_CLEARANCE = 0.11 * PET_SCALE;
export const PET_SIDE_CLEARANCE = 0.225 * PET_SCALE;

/** The mown grass, which the pad carries at 0.10 -- its soil is 0.07 deep and the grass sits on
 * top; the mowing stripes reach 0.107, which is under the paw either way. */
export const LAWN_Y = 0.1;

/** The driveway runs from the front door to the kerb, straight down the middle of every plot: 3.4
 * wide and, at the 0.02 the district places it at, topping out at 0.237.
 *
 * A dog crossing its own plot walks over it, and that is the whole reason this function exists. The
 * first version of this put every dog at the grass height and the ones standing on the path sank
 * to their knees in concrete.
 *
 * The lip is a ramp rather than a step: the real slab has a square edge, but a dog popping up 0.14
 * in a single frame reads as a glitch, where a dog rising over a hand's width of path reads as a
 * dog stepping up. */
const DRIVEWAY_HALF_WIDTH = 1.7;
const DRIVEWAY_Y = 0.237;
const DRIVEWAY_LIP = 0.22;

export function petGroundY(side: number): number {
  const over = DRIVEWAY_HALF_WIDTH - Math.abs(side);
  if (over <= 0) return LAWN_Y;
  if (over >= DRIVEWAY_LIP) return DRIVEWAY_Y;
  return LAWN_Y + (DRIVEWAY_Y - LAWN_Y) * smoothstep(over / DRIVEWAY_LIP);
}

/** The dog's day, as a repeating sequence. Durations are jittered per plot but the ORDER is fixed,
 * so every dog trots, sits and sleeps rather than one unlucky plot drawing a dog that only ever
 * lies down. Roughly three quarters of a minute end to end. */
const SEGMENTS: ReadonlyArray<{ state: PetState; seconds: number }> = [
  { state: "trot", seconds: 9 },
  { state: "sit", seconds: 7 },
  { state: "trot", seconds: 6 },
  { state: "sleep", seconds: 13 },
  { state: "sit", seconds: 5 },
  { state: "trot", seconds: 8 },
];

/** Seconds to move between two states. Long enough that a dog rises rather than snaps, short
 * enough that it is never caught halfway for longer than it is doing the thing. */
const STATE_EASE = 0.45;

/** World units per second at a trot. A small dog moving at an unhurried clip. */
const TROT_SPEED = 0.92;

/** Distance covered by one full stride -- all four legs through their cycle.
 *
 * Driven by DISTANCE rather than by time, the same as the pedestrians and for the same reason: a
 * dog given a slower speed but a fixed cadence skates, and the eye reads that long before it reads
 * the pose. */
const STRIDE = 0.52;

const LEG_SWING = 0.52;
const EAR_SWING = 0.26;
const TAIL_WAG = 0.55;
const TROT_BOB = 0.012;

/** How far the chest comes up, and how far the rump drops onto the haunch it is sitting on. The
 * body turns about its origin, which the build script puts on the ground at the hips -- so the
 * pitch alone keeps the rump down and lifts the chest, and the drop is only closing the gap the
 * folded back legs leave. */
const SIT_PITCH = 0.38;
const SIT_DROP = -0.035;
const SIT_BACK_LEG = 1.25;

/** Lying down. The lift is shared by the body and all four legs -- the legs hang off the group
 * rather than off the body, so lowering only the body would leave four legs standing over a dog
 * that had gone to sleep underneath them. */
const SLEEP_LIFT = -0.098;
const SLEEP_ROLL = 0.22;
const SLEEP_LEG = 1.45;
const SLEEP_HEAD = -0.55;
/** The tail is authored cocked up and back, so laying it along the grass takes a turn of about the
 * same angle the other way. Without this the city spends every night full of sleeping dogs holding
 * their tails in the air. */
const SLEEP_TAIL_DROP = 0.8;
const SIT_TAIL_DROP = 0.25;
const BREATH_RATE = 1.1;
const BREATH_DEPTH = 0.006;

export interface PetPose {
  state: PetState;
  /** Plot-local. `f` runs toward the road; `side` runs across the plot. */
  side: number;
  f: number;
  /** Radians about Y. Zero faces -z, which is the way the model is authored. */
  heading: number;
  /** Added to the rest height of the body AND of all four legs, in MODEL units -- multiply by
   * PET_SCALE to put it in world units. */
  lift: number;
  /** World height for the dog's group: the surface under it, plus the scaled lift. The surface is
   * not flat, because the driveway crosses every plot. */
  y: number;
  bodyPitch: number;
  bodyRoll: number;
  headPitch: number;
  earSwing: number;
  tailYaw: number;
  /** Lowers the tail toward the grass. Zero is the cocked rest angle the model is built at. */
  tailPitch: number;
  legs: { frontLeft: number; frontRight: number; backLeft: number; backRight: number };
}

/** Deterministic 0..1 from an integer seed. Integer math only, matching Pedestrians and map-data's
 * own generator. */
export function seededUnit(seed: number): number {
  return ((Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0) % 1000) / 1000;
}

/** A plot id to an integer. The ids are structured (`pioneer:jobs:north:01`), so a weak hash would
 * hand neighbouring plots neighbouring seeds and a whole row would fall into step. */
export function petSeed(plotId: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < plotId.length; index += 1) {
    hash = Math.imul(hash ^ plotId.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}

export interface PetSchedule {
  segments: ReadonlyArray<{ state: PetState; seconds: number; start: number }>;
  /** Total seconds, and the point the sequence repeats. */
  length: number;
  /** Distance the dog has covered by the end of one full cycle, so laps join up across repeats. */
  trotDistance: number;
  route: Route;
  /** The shell's own patch of grass, carried so the pose maths and the tests can see it. */
  band: LawnBand;
  speed: number;
  /** Where in the cycle this dog starts, so a row of plots is not in lockstep. */
  offset: number;
}

/** The lap a dog walks, inside its shell's own band.
 *
 * It spans the band, near enough end to end: a dog that patrolled a corner of the plot was the
 * first thing anyone said about this reward. The inset is one clearance, so the widest part of the
 * lap still keeps the dog's own body off whatever bounds the band.
 *
 * A closed loop rather than a line back and forth, so the dog turns at the ends instead of
 * reversing on the spot; and an octagon rather than a rectangle so the turns are two shallow ones
 * instead of a right angle. Built with closedRoute and walked with pointAt -- the same two
 * functions the pavements and the roads use, which is also where the heading convention lives. */
export function petLoop(seed: number, band: LawnBand): Route {
  // Long across the frontage and shallow front to back, because that is the shape of the ground:
  // every band is several units wide and well under one deep.
  const room = (band.sideMax - band.sideMin) / 2;
  const halfLength = Math.max(0.4, room * (0.86 + seededUnit(seed + 11) * 0.12));
  const halfDepth = Math.max(0.06, (band.far - band.near) / 2 - 0.06);
  const centreSide = (band.sideMin + band.sideMax) / 2 + (seededUnit(seed + 23) - 0.5) * (room - halfLength);
  const centreF = (band.near + band.far) / 2;
  const cut = Math.min(0.25, halfLength * 0.3, halfDepth * 0.8);
  const corners = [
    { x: halfLength - cut, z: -halfDepth },
    { x: halfLength, z: -halfDepth + cut },
    { x: halfLength, z: halfDepth - cut },
    { x: halfLength - cut, z: halfDepth },
    { x: -halfLength + cut, z: halfDepth },
    { x: -halfLength, z: halfDepth - cut },
    { x: -halfLength, z: -halfDepth + cut },
    { x: -halfLength + cut, z: -halfDepth },
  ].map((corner) => ({ x: corner.x + centreSide, z: corner.z + centreF }));
  return closedRoute(`pet-${seed}`, corners);
}

export function petSchedule(seed: number, assetId: PlotBuildingAssetId): PetSchedule {
  const band = BUILDING_LAWN_BANDS[assetId];
  let start = 0;
  let trotDistance = 0;
  const speed = TROT_SPEED * (0.86 + seededUnit(seed + 37) * 0.28);
  const segments = SEGMENTS.map((segment, index) => {
    const seconds = segment.seconds * (0.8 + seededUnit(seed + index * 101 + 7) * 0.5);
    const entry = { state: segment.state, seconds, start };
    start += seconds;
    if (segment.state === "trot") trotDistance += seconds * speed;
    return entry;
  });
  return {
    segments,
    length: start,
    trotDistance,
    route: petLoop(seed, band),
    band,
    speed,
    offset: seededUnit(seed + 211) * start,
  };
}

/** Which segment a dog is in, how long it has been there, and how far it has walked in total.
 *
 * `travelled` advances only across trot segments, which is the whole of what holds a dog in place
 * while it sits: there is no separate "is moving" flag to fall out of step with the state. */
export function petStateAt(schedule: PetSchedule, elapsed: number): {
  state: PetState; index: number; since: number; travelled: number;
} {
  const cycle = schedule.length;
  const position = ((elapsed + schedule.offset) % cycle + cycle) % cycle;
  const laps = Math.floor((elapsed + schedule.offset) / cycle);
  let travelled = laps * schedule.trotDistance;
  for (let index = 0; index < schedule.segments.length; index += 1) {
    const segment = schedule.segments[index];
    const into = position - segment.start;
    if (into < segment.seconds) {
      if (segment.state === "trot") travelled += Math.max(0, into) * schedule.speed;
      return { state: segment.state, index, since: Math.max(0, into), travelled };
    }
    if (segment.state === "trot") travelled += segment.seconds * schedule.speed;
  }
  // Floating point can land `position` a hair past the last segment's end. Return the last state
  // rather than falling through to a default that would flicker once per cycle.
  const index = schedule.segments.length - 1;
  return { state: schedule.segments[index].state, index, since: schedule.segments[index].seconds, travelled };
}

/** The pose for one state, with no easing applied. */
function posedAs(state: PetState, schedule: PetSchedule, travelled: number, clock: number): PetPose {
  const { x, z, heading } = pointAt(schedule.route, travelled);
  const base = {
    side: x,
    f: z,
    heading,
    lift: 0,
    y: 0,
    bodyPitch: 0,
    bodyRoll: 0,
    headPitch: 0,
    earSwing: 0,
    tailYaw: 0,
    tailPitch: 0,
    legs: { frontLeft: 0, frontRight: 0, backLeft: 0, backRight: 0 },
  };

  if (state === "trot") {
    const phase = (travelled / STRIDE) * Math.PI * 2;
    const swing = Math.sin(phase);
    return {
      ...base,
      state,
      // Diagonal pairs, which is what a quadruped actually does: front-left travels with
      // back-right. Swinging the two front legs together gives a rocking horse.
      legs: {
        frontLeft: swing * LEG_SWING,
        backRight: swing * LEG_SWING,
        frontRight: -swing * LEG_SWING,
        backLeft: -swing * LEG_SWING,
      },
      lift: Math.abs(swing) * TROT_BOB,
      // The ears lag the bob rather than matching it, which is what stops them reading as
      // rigidly welded to the skull.
      earSwing: -Math.sin(phase - 0.6) * EAR_SWING,
      tailYaw: Math.sin(phase * 2) * TAIL_WAG,
      headPitch: swing * 0.05,
    };
  }

  if (state === "stand") {
    // Squarely on all four, everything level. The rest pose the other three are departures from.
    return { ...base, state, tailPitch: 0.1 };
  }

  if (state === "sit") {
    return {
      ...base,
      state,
      bodyPitch: SIT_PITCH,
      lift: SIT_DROP,
      // Front legs planted and vertical, back legs folded under. This is the reason the legs hang
      // off the group rather than off the body: inheriting the body's pitch would tip all four.
      legs: { frontLeft: 0, frontRight: 0, backLeft: SIT_BACK_LEG, backRight: SIT_BACK_LEG },
      // A slow look around, and a tail sweeping the grass behind.
      headPitch: Math.sin(clock * 0.5) * 0.12,
      tailYaw: Math.sin(clock * 1.6) * 0.3,
      tailPitch: SIT_TAIL_DROP,
    };
  }

  return {
    ...base,
    state,
    lift: SLEEP_LIFT + Math.sin(clock * BREATH_RATE) * BREATH_DEPTH,
    bodyRoll: SLEEP_ROLL,
    headPitch: SLEEP_HEAD,
    legs: { frontLeft: SLEEP_LEG, frontRight: SLEEP_LEG, backLeft: SLEEP_LEG, backRight: SLEEP_LEG },
    tailYaw: 0.3,
    tailPitch: SLEEP_TAIL_DROP,
  };
}

function blendPose(from: PetPose, to: PetPose, t: number): PetPose {
  return {
    state: t < 0.5 ? from.state : to.state,
    side: lerp(from.side, to.side, t),
    f: lerp(from.f, to.f, t),
    // Headings are blended on the shorter arc; the raw numbers straddle pi and a plain lerp would
    // spin the dog the long way round at the ends of its lap.
    heading: from.heading + shortestTurn(from.heading, to.heading) * t,
    lift: lerp(from.lift, to.lift, t),
    y: 0,
    bodyPitch: lerp(from.bodyPitch, to.bodyPitch, t),
    bodyRoll: lerp(from.bodyRoll, to.bodyRoll, t),
    headPitch: lerp(from.headPitch, to.headPitch, t),
    earSwing: lerp(from.earSwing, to.earSwing, t),
    tailYaw: lerp(from.tailYaw, to.tailYaw, t),
    tailPitch: lerp(from.tailPitch, to.tailPitch, t),
    legs: {
      frontLeft: lerp(from.legs.frontLeft, to.legs.frontLeft, t),
      frontRight: lerp(from.legs.frontRight, to.legs.frontRight, t),
      backLeft: lerp(from.legs.backLeft, to.legs.backLeft, t),
      backRight: lerp(from.legs.backRight, to.legs.backRight, t),
    },
  };
}

function shortestTurn(from: number, to: number): number {
  const turn = (to - from) % (Math.PI * 2);
  if (turn > Math.PI) return turn - Math.PI * 2;
  if (turn < -Math.PI) return turn + Math.PI * 2;
  return turn;
}

/** Where a dog is and what it is doing, `nightBlend` seconds into the city going dark.
 *
 * The night blend doubles as the settle: it runs 0 to 1 over the 1.4 seconds the whole city takes
 * to cross, so the dog lies down exactly as the lights come on rather than needing a timer of its
 * own. At blend 1 the daytime schedule still turns underneath, and is simply never seen. */
export function petPoseAt(schedule: PetSchedule, elapsed: number, nightBlend = 0): PetPose {
  const { state, index, since, travelled } = petStateAt(schedule, elapsed);
  const current = posedAs(state, schedule, travelled, elapsed);

  // Easing out of the state before this one. Which state that was is a lookup rather than history:
  // the sequence is fixed, so the previous segment is simply the one before this in the list, and
  // the dog needs to remember nothing between frames.
  let pose = current;
  const previous = schedule.segments[(index - 1 + schedule.segments.length) % schedule.segments.length];
  if (since < STATE_EASE && previous.state !== state) {
    pose = blendPose(posedAs(previous.state, schedule, travelled, elapsed), current,
      smoothstep(since / STATE_EASE));
  }

  if (nightBlend > 0) {
    pose = blendPose(pose, posedAs("sleep", schedule, travelled, elapsed), smoothstep(nightBlend));
  }
  // Resolved last, and from the BLENDED side: the ground is a step, so interpolating two heights
  // would float the dog over the kerb of the path rather than walking it up.
  return { ...pose, y: petGroundY(pose.side) + pose.lift * PET_SCALE };
}

/** What a dog says, and when.
 *
 * Deterministic like everything else here: which phrase, and whether one is showing at all, falls
 * out of the seed and the clock. Two dogs on neighbouring plots do not chorus, and a founder's dog
 * says the same thing at the same point in its routine every time.
 *
 * `sleep` is the exception and is not drawn from this list -- a sleeping dog gets PET_SLEEP_PHRASE
 * for as long as it is asleep, which after dark is all night. */
export const PET_PHRASES = ["Woof!", "Waaoww!", "Borf!", "Hello!", "Woof woof!"] as const;
export const PET_SLEEP_PHRASE = "\u{1F4A4}";

/** How long a phrase stays up, and how much of that is spent fading at each end. Short: the bubble
 * is a punctuation mark on a state change, not a caption the dog wears. */
const BUBBLE_SECONDS = 2.6;
const BUBBLE_FADE = 0.35;

export interface PetBubble {
  text: string;
  /** 0-1. Fades in and out rather than popping, and breathes while the dog sleeps. */
  opacity: number;
}

export function petBubbleAt(schedule: PetSchedule, elapsed: number, nightBlend = 0): PetBubble | null {
  const { state, index, since } = petStateAt(schedule, elapsed);
  // Night wins outright, the same way it does for the pose: by the time the city is dark every dog
  // is asleep whatever its own routine says.
  const asleep = nightBlend > 0.5 || state === "sleep";
  if (asleep) {
    const settled = Math.min(1, nightBlend > 0.5 ? (nightBlend - 0.5) * 4 : since / STATE_EASE);
    return { text: PET_SLEEP_PHRASE, opacity: settled * (0.72 + Math.sin(elapsed * 1.1) * 0.28) };
  }
  if (since > BUBBLE_SECONDS) return null;
  const phrase = PET_PHRASES[Math.floor(seededUnit(schedule.offset * 1000 + index * 61) * PET_PHRASES.length)
    % PET_PHRASES.length];
  const fade = Math.min(since, BUBBLE_SECONDS - since) / BUBBLE_FADE;
  return { text: phrase, opacity: smoothstep(fade) };
}

/** The dog standing squarely, facing the road.
 *
 * For the two places that show a dog holding still and want it looking its best: the plot preview
 * on the project card, which documents its own absence of a frame loop as a feature, and the share
 * capture, which renders a single frame of the live city and would otherwise catch a dog
 * mid-stride. Both used to get the sit pose, and a sitting dog seen side-on reads as a dog waiting
 * to be let in rather than as the thing the founder earned.
 *
 * FACING THE ROAD is the half turn. The model faces -z at heading zero and plot-local +f is +z, so
 * pi brings it round to face the way the plot does -- which is the way both of these are framed
 * from. */
export function petStandPose(schedule: PetSchedule): PetPose {
  const pose = { ...posedAs("stand", schedule, 0, 0), heading: Math.PI };
  return { ...pose, y: petGroundY(pose.side) + pose.lift * PET_SCALE };
}

/** The dog sitting, held still.
 *
 * Only for the reduced-motion path, where it will stay exactly like this for as long as the map is
 * open. A dog frozen mid-stand reads as a stuffed one; a dog sitting reads as a dog that has sat
 * down. */
export function petSitPose(schedule: PetSchedule): PetPose {
  const pose = posedAs("sit", schedule, 0, 0);
  return { ...pose, y: petGroundY(pose.side) + pose.lift * PET_SCALE };
}

export interface PetPlacement {
  plotId: string;
  /** The pad's own world position and facing. A dog is placed in a group carrying both, so the
   * plot-local pose above applies directly -- the same arrangement the roof props use. */
  position: WorldPosition;
  rotationY: number;
  schedule: PetSchedule;
  development: CityDevelopment;
}

/** Every plot that has earned a dog. Derived from xp_total through unlocksFor, like every other
 * unlock, so a founder crossing 390 gets theirs on the next render with nothing stored anywhere. */
export function petPlacements(
  plotEntities: readonly CityEntity[],
  developments: CityDevelopmentRecord,
): PetPlacement[] {
  return plotEntities.flatMap((plotEntity) => {
    const development = plotEntity.plotId ? developments[plotEntity.plotId] : undefined;
    if (!development || !plotEntity.plotId) return [];
    if (!unlocksFor(development.progression.xp).pet) return [];
    return [{
      plotId: plotEntity.plotId,
      position: plotEntity.position,
      rotationY: plotEntity.rotationY ?? 0,
      schedule: petSchedule(petSeed(plotEntity.plotId), development.building.assetId),
      development,
    }];
  });
}
