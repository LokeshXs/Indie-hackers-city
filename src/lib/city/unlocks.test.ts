import { describe, expect, it } from "vitest";
import { LADDER, currentLeg, unlocksFor, type LadderEntry } from "./unlocks";

describe("unlocksFor", () => {
  it("derives every unlock from xp alone", () => {
    expect(unlocksFor(10)).toEqual({ lights: false, marquee: false, status: false, levelTwo: false });
    expect(unlocksFor(240)).toEqual({ lights: true, marquee: true, status: false, levelTwo: false });
    expect(unlocksFor(9999)).toEqual({ lights: true, marquee: true, status: true, levelTwo: true });
  });

  it("unlocks exactly on the threshold, not one past it", () => {
    expect(unlocksFor(99).lights).toBe(false);
    expect(unlocksFor(100).lights).toBe(true);
  });
});

describe("currentLeg", () => {
  it("starts a new founder on a real leg from zero", () => {
    expect(currentLeg(10)).toMatchObject({ from: 0, to: 100, remaining: 90, progress: 0.1 });
  });

  it("measures across the leg, not from zero", () => {
    const leg = currentLeg(210);
    // 110 of the 140 between the 100 and 240 rungs. From zero this would read 88%, which is the
    // reading this function exists to replace.
    expect(leg).toMatchObject({ from: 100, to: 240, remaining: 30 });
    expect(leg?.progress).toBeCloseTo(110 / 140);
  });

  it("empties the bar the moment a reward lands", () => {
    // Landing exactly on a threshold belongs to the *next* leg, matching nextEntry's strict <.
    expect(currentLeg(240)).toMatchObject({ from: 240, to: 390, remaining: 150, progress: 0 });
  });

  it("carries the reward, and leaves it absent on a placeholder rung", () => {
    expect(currentLeg(210)?.reward?.label).toBe("Scrolling billboard");
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
