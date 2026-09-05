import { describe, expect, it } from "vitest";
import { LADDER, TIMELINE_WINDOW, currentLeg, timelineWindow, unlocksFor, type LadderEntry } from "./unlocks";

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

describe("timelineWindow", () => {
  it("shows a full window with nothing earned yet", () => {
    const timeline = timelineWindow(10);
    expect(timeline.entries).toHaveLength(TIMELINE_WINDOW);
    expect(timeline.entries.every((entry) => !entry.earned)).toBe(true);
    expect(timeline.entries[0].isNext).toBe(true);
    expect(timeline.progress).toBe(0);
    expect(timeline.remaining).toBe(90);
  });

  it("keeps two earned entries behind the founder mid-ladder", () => {
    // 400 clears 100, 240 and 390; the next is 490.
    const timeline = timelineWindow(400);
    expect(timeline.entries.map((entry) => entry.threshold)).toEqual([240, 390, 490, 570, 670]);
    expect(timeline.entries.filter((entry) => entry.earned)).toHaveLength(2);
    expect(timeline.entries.find((entry) => entry.isNext)?.threshold).toBe(490);
    expect(timeline.remaining).toBe(90);
  });

  it("pins the window to the end once the whole ladder is behind you", () => {
    const timeline = timelineWindow(10_000);
    const lastFive = LADDER.slice(-TIMELINE_WINDOW).map((entry) => entry.threshold);
    expect(timeline.entries.map((entry) => entry.threshold)).toEqual(lastFive);
    expect(timeline.entries.every((entry) => entry.earned)).toBe(true);
    expect(timeline.entries.some((entry) => entry.isNext)).toBe(false);
    expect(timeline.progress).toBe(1);
    expect(timeline.remaining).toBeNull();
  });

  it("returns everything it has when the ladder is shorter than the window", () => {
    const short: LadderEntry[] = [{ threshold: 50 }, { threshold: 150 }];
    const timeline = timelineWindow(60, short);
    expect(timeline.entries.map((entry) => entry.threshold)).toEqual([50, 150]);
    expect(timeline.remaining).toBe(90);
  });

  it("leaves a passed placeholder sealed", () => {
    // 570 has no reward yet. Passing it must still mark it earned — the founder gets it when it
    // ships — while the UI has nothing to reveal.
    const timeline = timelineWindow(600);
    const placeholder = timeline.entries.find((entry) => entry.threshold === 570);
    expect(placeholder?.earned).toBe(true);
    expect(placeholder?.reward).toBeUndefined();
  });

  it("advances the marker within the slot rather than jumping between nodes", () => {
    const atNode = timelineWindow(240).progress;
    const partWay = timelineWindow(315).progress;
    const nearlyThere = timelineWindow(385).progress;
    expect(partWay).toBeGreaterThan(atNode);
    expect(nearlyThere).toBeGreaterThan(partWay);
    expect(nearlyThere).toBeLessThan(1);
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
