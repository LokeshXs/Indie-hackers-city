import { describe, expect, it } from "vitest";
import type { CityDevelopment } from "./types";
import { getBuildingProgress } from "./progression";

const progression = (
  overrides: Partial<CityDevelopment["progression"]> = {},
): CityDevelopment["progression"] => ({
  xp: 0,
  buildingLevel: 1,
  currentLevelXp: 0,
  nextLevelXp: 100,
  ...overrides,
});

describe("getBuildingProgress", () => {
  it("calculates level-one progress", () => {
    expect(getBuildingProgress(progression())).toMatchObject({ percentage: 0, remainingXp: 100 });
    expect(getBuildingProgress(progression({ xp: 50 }))).toMatchObject({ percentage: 50, remainingXp: 50 });
  });

  it("calculates progress within the current level range", () => {
    expect(getBuildingProgress(progression({
      xp: 185,
      buildingLevel: 2,
      currentLevelXp: 100,
      nextLevelXp: 300,
    }))).toEqual({
      percentage: 42.5,
      earnedWithinLevel: 85,
      requiredWithinLevel: 200,
      remainingXp: 115,
      nextLevel: 3,
      isMaximumLevel: false,
    });
  });

  it("clamps progress below and above the current level range", () => {
    expect(getBuildingProgress(progression({ xp: -20 })).percentage).toBe(0);
    expect(getBuildingProgress(progression({ xp: 150 })).percentage).toBe(100);
  });

  it("returns the maximum state at level five", () => {
    expect(getBuildingProgress(progression({
      xp: 1750,
      buildingLevel: 5,
      currentLevelXp: 1500,
      nextLevelXp: null,
    }))).toEqual({
      percentage: 100,
      earnedWithinLevel: 250,
      requiredWithinLevel: null,
      remainingXp: null,
      nextLevel: null,
      isMaximumLevel: true,
    });
  });

  it("handles missing or malformed thresholds without throwing", () => {
    expect(getBuildingProgress(progression({ currentLevelXp: 100, nextLevelXp: null }))).toMatchObject({
      percentage: 0,
      requiredWithinLevel: null,
      remainingXp: null,
      nextLevel: 2,
      isMaximumLevel: false,
    });
    expect(getBuildingProgress(progression({ currentLevelXp: 100, nextLevelXp: 100 }))).toMatchObject({
      requiredWithinLevel: null,
      remainingXp: null,
    });
  });
});
