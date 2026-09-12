import { describe, expect, it } from "vitest";
import {
  TRANSITION_SECONDS,
  advanceTransition,
  easeBlend,
  lerp,
  targetFor,
} from "./time-of-day";

/** A frame at 60fps, which is what the transition is actually stepped by. */
const FRAME = 1 / 60;

describe("targetFor", () => {
  it("puts the two phases at the ends of the line", () => {
    expect(targetFor("morning")).toBe(0);
    expect(targetFor("night")).toBe(1);
  });
});

describe("advanceTransition", () => {
  it("moves toward the target at a rate that spends the full duration crossing", () => {
    let position = 0;
    let frames = 0;
    while (position < 1 && frames < 1000) {
      position = advanceTransition(position, 1, FRAME);
      frames += 1;
    }
    expect(position).toBe(1);
    expect(frames * FRAME).toBeCloseTo(TRANSITION_SECONDS, 1);
  });

  it("lands exactly on the target rather than overshooting it", () => {
    // A frame long enough to cross the whole transition twice over -- a tab waking up.
    expect(advanceTransition(0.2, 1, 30)).toBe(1);
    expect(advanceTransition(0.8, 0, 30)).toBe(0);
  });

  it("turns round from wherever it had got to", () => {
    const halfway = advanceTransition(0.5, 1, FRAME);
    expect(halfway).toBeGreaterThan(0.5);
    // Pressed again mid-flight: it heads back from here, it does not jump to either end.
    const returning = advanceTransition(halfway, 0, FRAME);
    expect(returning).toBeLessThan(halfway);
    expect(returning).toBeGreaterThan(0.4);
  });

  it("holds still once it has arrived", () => {
    expect(advanceTransition(1, 1, FRAME)).toBe(1);
    expect(advanceTransition(0, 0, FRAME)).toBe(0);
  });

  it("ignores a negative delta rather than drifting backwards on one", () => {
    expect(advanceTransition(0.5, 1, -5)).toBe(0.5);
  });

  it("snaps when the duration is zero, which is what reduced motion asks for", () => {
    expect(advanceTransition(0, 1, FRAME, 0)).toBe(1);
    expect(advanceTransition(1, 0, FRAME, 0)).toBe(0);
  });
});

describe("easeBlend", () => {
  it("pins both ends, so a settled phase is fully itself", () => {
    expect(easeBlend(0)).toBe(0);
    expect(easeBlend(1)).toBe(1);
  });

  it("is symmetric about the midpoint", () => {
    expect(easeBlend(0.5)).toBeCloseTo(0.5, 10);
    expect(easeBlend(0.25) + easeBlend(0.75)).toBeCloseTo(1, 10);
  });

  it("never reverses", () => {
    const samples = Array.from({ length: 40 }, (_, index) => easeBlend(index / 39));
    samples.forEach((value, index) => index && expect(value).toBeGreaterThanOrEqual(samples[index - 1]));
  });

  it("eases: it leaves and arrives more slowly than it travels", () => {
    expect(easeBlend(0.1)).toBeLessThan(0.1);
    expect(easeBlend(0.9)).toBeGreaterThan(0.9);
  });

  it("clamps a position pushed outside the line", () => {
    expect(easeBlend(-0.5)).toBe(0);
    expect(easeBlend(1.5)).toBe(1);
  });
});

describe("lerp", () => {
  it("hits both ends and the middle", () => {
    expect(lerp(2, 4, 0)).toBe(2);
    expect(lerp(2, 4, 1)).toBe(4);
    expect(lerp(2, 4, 0.5)).toBe(3);
  });
});
