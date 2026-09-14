import { describe, expect, it } from "vitest";
import { LADDER, canChoosePremises, currentLeg, unlocksFor, type LadderEntry } from "./unlocks";

describe("unlocksFor", () => {
  it("derives every unlock from xp alone", () => {
    expect(unlocksFor(10)).toEqual({ lights: false, marquee: false, status: false, pet: false, levelTwo: false });
    expect(unlocksFor(190)).toEqual({ lights: false, marquee: true, status: true, pet: false, levelTwo: false });
    expect(unlocksFor(240)).toEqual({ lights: true, marquee: true, status: true, pet: false, levelTwo: false });
    expect(unlocksFor(390)).toEqual({ lights: true, marquee: true, status: true, pet: true, levelTwo: false });
    expect(unlocksFor(9999)).toEqual({ lights: true, marquee: true, status: true, pet: true, levelTwo: true });
  });

  it("unlocks exactly on the threshold, not one past it", () => {
    expect(unlocksFor(109).status).toBe(false);
    expect(unlocksFor(110).status).toBe(true);
    expect(unlocksFor(239).lights).toBe(false);
    expect(unlocksFor(240).lights).toBe(true);
    expect(unlocksFor(389).pet).toBe(false);
    expect(unlocksFor(390).pet).toBe(true);
  });
});

describe("currentLeg", () => {
  it("starts a new founder on a real leg from zero", () => {
    const leg = currentLeg(10);
    expect(leg).toMatchObject({ from: 0, to: 110, remaining: 100 });
    expect(leg?.progress).toBeCloseTo(10 / 110);
  });

  it("measures across the leg, not from zero", () => {
    const leg = currentLeg(210);
    // 20 of the 50 between the 190 and 240 rungs. From zero this would read 88%, which is the
    // reading this function exists to replace.
    expect(leg).toMatchObject({ from: 190, to: 240, remaining: 30 });
    expect(leg?.progress).toBeCloseTo(20 / 50);
  });

  it("empties the bar the moment a reward lands", () => {
    // Landing exactly on a threshold belongs to the *next* leg, matching nextEntry's strict <.
    expect(currentLeg(240)).toMatchObject({ from: 240, to: 390, remaining: 150, progress: 0 });
  });

  it("carries the reward, and leaves it absent on a placeholder rung", () => {
    expect(currentLeg(150)?.reward?.label).toBe("Scrolling billboard");
    expect(currentLeg(210)?.reward?.label).toBe("Roof lights");
    expect(currentLeg(300)?.reward?.label).toBe("A dog");
    expect(currentLeg(500)).toMatchObject({ to: 570 });
    expect(currentLeg(500)?.reward).toBeUndefined();
  });

  it("returns null once the ladder is behind the founder", () => {
    expect(currentLeg(LADDER[LADDER.length - 1].threshold)).toBeNull();
    expect(currentLeg(99_999)).toBeNull();
  });

  it("clamps rather than running the fill off either end", () => {
    expect(currentLeg(-40)?.progress).toBe(0);
  });

  it("survives a zero-span leg instead of putting NaN into the bar's width", () => {
    // The only way to reach a zero span: for any rung past the first, findIndex already guarantees
    // from <= xp < to. It takes a first threshold of zero or less, and an xp below it.
    const degenerate: LadderEntry[] = [{ threshold: 0 }, { threshold: 100 }];
    expect(currentLeg(-5, degenerate)?.progress).toBe(1);
  });
});

describe("the ladder order", () => {
  // The order is the product decision this file exists to record, and reordering LADDER in place is
  // a two-line edit that nothing else would catch. Pinned whole, rather than rung by rung.
  it("runs status, marquee, lights, the dog, then the bigger building", () => {
    expect(LADDER.map((entry) => [entry.threshold, entry.reward?.key])).toEqual([
      [110, "status"],
      [190, "marquee"],
      [240, "lights"],
      [390, "pet"],
      [490, "levelTwo"],
      [570, undefined],
      [670, undefined],
      [850, undefined],
    ]);
  });

  // currentLeg takes the first rung above the founder's XP with findIndex, so a rung out of order
  // is not a cosmetic problem: it would hand back a leg the founder has already finished.
  it("keeps the thresholds ascending", () => {
    const thresholds = LADDER.map((entry) => entry.threshold);
    expect(thresholds).toEqual([...thresholds].sort((first, second) => first - second));
  });
});

describe("the levelTwo rung", () => {
  // Pinned from this side because the same number is hardcoded in SQL, in
  // supabase/migrations/20260907120000_upgrade_plot_premises.sql. That RPC is granted to
  // `authenticated` and so must gate on XP itself; it cannot import this file. Moving the
  // threshold means moving this test and the pgTAP one with it -- which is the point of both.
  it("unlocks new premises at exactly 490 XP", () => {
    expect(LADDER.find((entry) => entry.reward?.key === "levelTwo")?.threshold).toBe(490);
    expect(unlocksFor(489).levelTwo).toBe(false);
    expect(unlocksFor(490).levelTwo).toBe(true);
  });
});

describe("canChoosePremises", () => {
  it("stays shut until the reward is earned", () => {
    expect(canChoosePremises(489, "startup-building-level-1")).toBe(false);
    expect(canChoosePremises(490, "startup-building-level-1")).toBe(true);
  });

  it("closes for good once a level-2 shell is standing", () => {
    // The asset id is the only record that the reward has been spent, so this is what stops the
    // chooser reopening on every load. A founder who keeps earning must not be asked twice.
    expect(canChoosePremises(490, "slat-studio-level-2")).toBe(false);
    expect(canChoosePremises(9999, "teal-brow-level-2")).toBe(false);
  });

  it("offers the upgrade from any of the three claim-time shells", () => {
    expect(canChoosePremises(490, "corner-studio-level-1")).toBe(true);
    expect(canChoosePremises(490, "indie-garage-level-1")).toBe(true);
  });
});
