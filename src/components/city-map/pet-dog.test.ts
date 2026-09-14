import { describe, expect, it } from "vitest";
import type { CityDevelopment } from "@/lib/city/types";
import type { CityEntity } from "./map-types";
import type { PlotBuildingAssetId } from "@/lib/city/types";
import { BUILDING_LAWN_BANDS } from "./city-assets";
import {
  LAWN_Y,
  PET_DEPTH_CLEARANCE,
  PET_SIDE_CLEARANCE,
  PET_SCALE,
  PET_PHRASES,
  PET_SLEEP_PHRASE,
  petBubbleAt,
  petGroundY,
  petPlacements,
  petPoseAt,
  petSchedule,
  petSeed,
  petSitPose,
  petStandPose,
  petStateAt,
  type PetState,
} from "./pet-dog";

/** Four plots, one per row, so both pad facings are covered. */
const PLOT_IDS = [
  "pioneer:jobs:north:01",
  "pioneer:jobs:south:02",
  "pioneer:hopper:north-outer:03",
  "pioneer:hopper:south-outer:04",
];

const SEEDS = PLOT_IDS.map(petSeed);

const SHELLS = Object.keys(BUILDING_LAWN_BANDS) as PlotBuildingAssetId[];

/** Every dog the district can produce: each plot's seed against each shell it could be standing on. */
function everySchedule() {
  return SEEDS.flatMap((seed) => SHELLS.map((assetId) => ({ seed, assetId, schedule: petSchedule(seed, assetId) })));
}

function development(xp: number): CityDevelopment {
  return {
    plotId: "pioneer:jobs:north:01",
    ownerId: "user-1",
    statusText: null,
    project: { id: "project-1", name: "Xenith", websiteUrl: "https://xenith.dev/", type: "app" },
    founder: { fullName: "Ada Founder", xHandle: "ada", avatarUrl: null, bio: null },
    building: { level: 1, assetId: "startup-building-level-1" },
    billboard: { textColor: "#f7e0a6", backgroundColor: "#1b3a4b" },
    progression: { xp, buildingLevel: 1, currentLevelXp: 0, nextLevelXp: 490 },
    claimedAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
}

function pad(plotId: string, z: number, rotationY?: number): CityEntity {
  return { id: `grass-${plotId}`, assetId: "grass-plot", position: { x: -18, y: 0, z }, rotationY, plotId, interactive: true };
}

describe("the dog's schedule", () => {
  it("is a function of the plot id and the clock, and nothing else", () => {
    // Called twice, seconds apart in wall-clock time, for the same elapsed. A dog that reshuffled
    // its routine between renders would be a different dog each time the map loaded.
    const schedule = petSchedule(SEEDS[0], "startup-building-level-1");
    expect(petStateAt(schedule, 12.5)).toEqual(petStateAt(schedule, 12.5));
    expect(petPoseAt(schedule, 12.5)).toEqual(petPoseAt(schedule, 12.5));
    expect(petSchedule(SEEDS[0], "startup-building-level-1")).toEqual(petSchedule(SEEDS[0], "startup-building-level-1"));
  });

  it("puts neighbouring plots out of step", () => {
    // The plot ids are structured and sequential, so a weak hash would hand a whole row the same
    // rhythm and the street would breathe in unison.
    const offsets = SEEDS.map((seed) => petSchedule(seed, "startup-building-level-1").offset);
    expect(new Set(offsets).size).toBe(offsets.length);
  });

  it("gives every dog all three states within one cycle", () => {
    for (const seed of SEEDS) {
      const schedule = petSchedule(seed, "startup-building-level-1");
      const seen = new Set<PetState>();
      for (let t = 0; t < schedule.length; t += 0.25) seen.add(petStateAt(schedule, t).state);
      expect([...seen].sort()).toEqual(["sit", "sleep", "trot"]);
    }
  });

  it("repeats, and carries the lap across the join", () => {
    const schedule = petSchedule(SEEDS[0], "startup-building-level-1");
    expect(petStateAt(schedule, 3).state).toBe(petStateAt(schedule, 3 + schedule.length).state);
    // Distance keeps accumulating rather than snapping back to zero, so the dog does not teleport
    // to the start of its loop once a cycle.
    expect(petStateAt(schedule, 3 + schedule.length).travelled)
      .toBeCloseTo(petStateAt(schedule, 3).travelled + schedule.trotDistance, 6);
  });

  it("advances distance only while trotting", () => {
    const schedule = petSchedule(SEEDS[1], "startup-building-level-1");
    for (let t = 0; t < schedule.length; t += 0.5) {
      const here = petStateAt(schedule, t);
      const later = petStateAt(schedule, t + 0.25);
      if (here.state !== "trot" && later.state !== "trot") {
        expect(later.travelled).toBeCloseTo(here.travelled, 9);
      }
    }
  });
});

describe("the dog stays on the lawn", () => {
  // The reason this test exists. There is no side lawn and no back lawn -- the shells are 11.2 to
  // 11.48 wide on an 11.4 pad -- so the only ground a dog can be on is the front strip, and a loop
  // a fraction too long walks it through a wall or off the kerb. Nothing else would catch that:
  // the dog would simply be inside the building, on one row, at one end of its lap.
  it("never leaves its shell's band, for any plot, on any shell, at any point in its cycle", () => {
    for (const { seed, assetId, schedule } of everySchedule()) {
      const band = BUILDING_LAWN_BANDS[assetId];
      for (let t = 0; t < schedule.length; t += 0.1) {
        for (const night of [0, 0.5, 1]) {
          const pose = petPoseAt(schedule, t, night);
          const where = `${assetId} seed ${seed} at ${t}`;
          expect(pose.f, where).toBeGreaterThanOrEqual(band.near);
          expect(pose.f, where).toBeLessThanOrEqual(band.far);
          expect(pose.side, where).toBeGreaterThanOrEqual(band.sideMin);
          expect(pose.side, where).toBeLessThanOrEqual(band.sideMax);
        }
      }
    }
  });

  it("walks most of the width it is given rather than patrolling one corner", () => {
    // The first version put the dog on a two-unit patch off to one side, which is what prompted
    // this. A lap has to actually use the frontage.
    for (const { assetId, schedule } of everySchedule()) {
      const band = BUILDING_LAWN_BANDS[assetId];
      const sides = schedule.route.corners.map((corner) => corner.x);
      const covered = Math.max(...sides) - Math.min(...sides);
      expect(covered / (band.sideMax - band.sideMin), assetId).toBeGreaterThan(0.8);
    }
  });

  it("keeps every band clear of the kerb and on the mown grass", () => {
    // The frontage half of this is checked against the actual shipped models, in
    // city-assets.test.ts -- the build scripts cannot answer it, because the piece of a shell that
    // reaches furthest forward is usually an awning 3.7 units overhead. What is left here is the
    // part that is just the pad's own dimensions: mown grass to f = 5.07 and out to +-5.62.
    for (const assetId of SHELLS) {
      const band = BUILDING_LAWN_BANDS[assetId];
      expect(band.far, assetId).toBeLessThanOrEqual(5.07 - PET_DEPTH_CLEARANCE);
      expect(band.sideMax, assetId).toBeLessThanOrEqual(5.62 - PET_SIDE_CLEARANCE);
      expect(band.sideMin, assetId).toBeGreaterThanOrEqual(-(5.62 - PET_SIDE_CLEARANCE));
      expect(band.near, assetId).toBeLessThan(band.far);
      expect(band.sideMin, assetId).toBeLessThan(band.sideMax);
    }
  });

  it("steps up onto the driveway instead of sinking into it", () => {
    // The bug this is here for: every plot has a 3.4-wide concrete path running down the middle of
    // it, its top 0.137 above the grass, and the first version walked dogs through it at knee
    // height. A dog crossing its own plot has to rise onto the path.
    expect(petGroundY(0)).toBeCloseTo(0.237, 6);
    expect(petGroundY(1.2)).toBeCloseTo(0.237, 6);
    expect(petGroundY(3.0)).toBeCloseTo(LAWN_Y, 6);
    expect(petGroundY(-3.0)).toBeCloseTo(LAWN_Y, 6);
    // Symmetric, and a ramp rather than a cliff at the lip.
    expect(petGroundY(-1.6)).toBeCloseTo(petGroundY(1.6), 6);
    expect(petGroundY(1.6)).toBeGreaterThan(LAWN_Y);
    expect(petGroundY(1.6)).toBeLessThan(0.237);
  });

  it("puts the dog on the surface under it, wherever its lap has taken it", () => {
    for (const { assetId, schedule } of everySchedule()) {
      for (let t = 0; t < schedule.length; t += 0.1) {
        const pose = petPoseAt(schedule, t);
        expect(pose.y, assetId).toBeCloseTo(petGroundY(pose.side) + pose.lift * PET_SCALE, 9);
      }
    }
  });
});

describe("the dog's pose", () => {
  it("swings its legs in diagonal pairs at a trot", () => {
    const schedule = petSchedule(SEEDS[0], "startup-building-level-1");
    const trotting = (() => {
      for (let t = 0; t < schedule.length; t += 0.05) {
        const pose = petPoseAt(schedule, t);
        // Past the ease, so the pose is the trot rather than a blend out of the state before it.
        if (pose.state === "trot" && petStateAt(schedule, t).since > 1 && Math.abs(pose.legs.frontLeft) > 0.2) return pose;
      }
      throw new Error("no trot found");
    })();
    // A quadruped moves front-left with back-right. Swinging the two front legs together gives a
    // rocking horse, which is exactly what this catches.
    expect(trotting.legs.frontLeft).toBeCloseTo(trotting.legs.backRight, 9);
    expect(trotting.legs.frontRight).toBeCloseTo(-trotting.legs.frontLeft, 9);
    expect(trotting.legs.backLeft).toBeCloseTo(-trotting.legs.backRight, 9);
  });

  it("stands squarely and faces the road, for the card and the share image", () => {
    for (const { assetId, schedule } of everySchedule()) {
      const pose = petStandPose(schedule);
      expect(pose.state, assetId).toBe("stand");
      // The model faces -z at heading zero and plot-local +f is +z, so a dog looking the way its
      // plot does is half a turn round. Both places this pose is used frame the plot from there.
      expect(pose.heading, assetId).toBeCloseTo(Math.PI, 9);
      // On all four, everything level -- not the sit it replaced, and not mid-stride.
      expect(pose.legs, assetId).toEqual({ frontLeft: 0, frontRight: 0, backLeft: 0, backRight: 0 });
      expect(pose.bodyPitch, assetId).toBe(0);
      expect(pose.bodyRoll, assetId).toBe(0);
      expect(pose.lift, assetId).toBe(0);
      // Standing on whatever is under it, which on the middle of a plot is the driveway.
      expect(pose.y, assetId).toBeCloseTo(petGroundY(pose.side), 9);
    }
  });

  it("sits with its chest up, its back legs folded and its front legs planted", () => {
    const pose = petSitPose(petSchedule(SEEDS[0], "startup-building-level-1"));
    expect(pose.state).toBe("sit");
    expect(pose.bodyPitch).toBeGreaterThan(0);
    expect(pose.legs.backLeft).toBeGreaterThan(1);
    expect(pose.legs.backRight).toBe(pose.legs.backLeft);
    // Planted. The legs hang off the group rather than off the body for this reason: inheriting
    // the body's pitch would tip all four over backwards.
    expect(pose.legs.frontLeft).toBe(0);
    expect(pose.legs.frontRight).toBe(0);
  });

  it("lies down and breathes when the city goes dark", () => {
    const schedule = petSchedule(SEEDS[0], "startup-building-level-1");
    // Mid-trot by day, so the two poses are as far apart as they get.
    const noon = petPoseAt(schedule, 2, 0);
    const midnight = petPoseAt(schedule, 2, 1);
    expect(midnight.state).toBe("sleep");
    expect(midnight.lift).toBeLessThan(noon.lift - 0.05);
    expect(midnight.headPitch).toBeLessThan(0);
    expect(midnight.bodyRoll).toBeGreaterThan(0);
    // Breathing: the height moves, slowly, without the dog going anywhere.
    const later = petPoseAt(schedule, 2 + 1.4, 1);
    expect(later.lift).not.toBeCloseTo(midnight.lift, 4);
  });

  it("eases into the night rather than dropping the moment it gets dark", () => {
    const schedule = petSchedule(SEEDS[0], "startup-building-level-1");
    const dusk = petPoseAt(schedule, 2, 0.5);
    const noon = petPoseAt(schedule, 2, 0);
    const midnight = petPoseAt(schedule, 2, 1);
    expect(dusk.lift).toBeLessThan(noon.lift);
    expect(dusk.lift).toBeGreaterThan(midnight.lift);
  });

  it("turns the short way round at the ends of its lap", () => {
    // Headings straddle pi, and blending them the naive way spins the dog a full turn on the spot
    // as it comes round the end of the loop. Nothing bigger than a half turn between frames.
    const schedule = petSchedule(SEEDS[2], "startup-building-level-1");
    let previous = petPoseAt(schedule, 0).heading;
    for (let t = 0.05; t < schedule.length; t += 0.05) {
      const heading = petPoseAt(schedule, t).heading;
      let turn = (heading - previous) % (Math.PI * 2);
      if (turn > Math.PI) turn -= Math.PI * 2;
      if (turn < -Math.PI) turn += Math.PI * 2;
      expect(Math.abs(turn), `at ${t}`).toBeLessThan(Math.PI);
      previous = heading;
    }
  });
});

describe("petPlacements", () => {
  it("gives a dog to every plot past 390 XP and to no others", () => {
    const pads = [pad(PLOT_IDS[0], -7.9), pad(PLOT_IDS[1], 7.9, Math.PI)];
    expect(petPlacements(pads, {
      [PLOT_IDS[0]]: development(389),
      [PLOT_IDS[1]]: development(390),
    }).map((placement) => placement.plotId)).toEqual([PLOT_IDS[1]]);
  });

  it("skips unclaimed plots rather than putting a stray dog on bare grass", () => {
    expect(petPlacements([pad(PLOT_IDS[0], -7.9)], {})).toEqual([]);
  });

  it("carries the pad's own facing, not the building's", () => {
    // A dog is placed in a group holding the PAD's position and rotation, so the plot-local pose
    // applies directly and +f points at the road on both the rows that face +z and the ones that
    // face -z. Reading the building's placement here would set it down behind the house.
    const [north] = petPlacements([pad(PLOT_IDS[0], -7.9)], { [PLOT_IDS[0]]: development(500) });
    const [south] = petPlacements([pad(PLOT_IDS[1], 7.9, Math.PI)], { [PLOT_IDS[1]]: development(500) });
    expect(north.rotationY).toBe(0);
    expect(north.position.z).toBe(-7.9);
    expect(south.rotationY).toBe(Math.PI);
    expect(south.position.z).toBe(7.9);
  });

  it("gives each plot its own dog", () => {
    const pads = PLOT_IDS.map((plotId, index) => pad(plotId, index * 10, index % 2 ? Math.PI : undefined));
    const developments = Object.fromEntries(PLOT_IDS.map((plotId) => [plotId, development(500)]));
    const placements = petPlacements(pads, developments);
    expect(placements).toHaveLength(PLOT_IDS.length);
    expect(new Set(placements.map((placement) => placement.schedule.offset)).size).toBe(PLOT_IDS.length);
  });
});

describe("what the dog says", () => {
  it("shows a phrase when it changes what it is doing, then stops", () => {
    const schedule = petSchedule(SEEDS[0], "startup-building-level-1");
    const segment = schedule.segments.find((entry) => entry.state !== "sleep")!;
    const at = (into: number) => petBubbleAt(schedule, segment.start - schedule.offset + into);
    expect(at(0.5)?.text).toBeTruthy();
    expect(PET_PHRASES).toContain(at(0.5)!.text);
    // Punctuation on a state change, not a caption the dog wears all day.
    expect(at(4)).toBeNull();
  });

  it("fades in and out rather than popping", () => {
    const schedule = petSchedule(SEEDS[0], "startup-building-level-1");
    const segment = schedule.segments.find((entry) => entry.state !== "sleep")!;
    const at = (into: number) => petBubbleAt(schedule, segment.start - schedule.offset + into);
    expect(at(0.02)!.opacity).toBeLessThan(0.2);
    expect(at(1.3)!.opacity).toBeGreaterThan(0.9);
    expect(at(2.5)!.opacity).toBeLessThan(0.4);
  });

  it("says the same thing at the same point in its routine, every time", () => {
    const schedule = petSchedule(SEEDS[1], "teal-brow-level-2");
    for (let t = 0; t < schedule.length; t += 0.7) {
      expect(petBubbleAt(schedule, t)).toEqual(petBubbleAt(schedule, t));
    }
  });

  it("gives neighbouring plots different things to say", () => {
    const said = SEEDS.map((seed) => {
      const schedule = petSchedule(seed, "startup-building-level-1");
      return schedule.segments.map((_, index) =>
        petBubbleAt(schedule, schedule.segments[index].start - schedule.offset + 1)?.text).join("|");
    });
    expect(new Set(said).size).toBeGreaterThan(1);
  });

  it("shows sleeping emoji whenever the dog is asleep, and all night", () => {
    const schedule = petSchedule(SEEDS[0], "startup-building-level-1");
    const sleeping = schedule.segments.find((entry) => entry.state === "sleep")!;
    const asleep = petBubbleAt(schedule, sleeping.start - schedule.offset + 2);
    expect(asleep?.text).toBe(PET_SLEEP_PHRASE);

    // Night overrides the routine, the same way it overrides the pose: mid-trot by day, but the
    // city is dark, so the dog is asleep and says so.
    const night = petBubbleAt(schedule, 2, 1);
    expect(night?.text).toBe(PET_SLEEP_PHRASE);
    expect(night!.opacity).toBeGreaterThan(0);
    // It breathes rather than sitting at a flat opacity.
    expect(petBubbleAt(schedule, 2 + 1.4, 1)!.opacity).not.toBeCloseTo(night!.opacity, 3);
  });
});
