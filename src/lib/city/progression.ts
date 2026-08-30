import type { CityDevelopment, StartupBuildingLevel } from "./types";

export interface BuildingProgress {
  percentage: number;
  earnedWithinLevel: number;
  requiredWithinLevel: number | null;
  remainingXp: number | null;
  nextLevel: StartupBuildingLevel | null;
  isMaximumLevel: boolean;
}

export function getBuildingProgress(
  progression: CityDevelopment["progression"],
): BuildingProgress {
  const { buildingLevel, currentLevelXp, nextLevelXp } = progression;
  const xp = Number.isFinite(progression.xp) ? progression.xp : 0;

  if (buildingLevel === 5) {
    return {
      percentage: 100,
      earnedWithinLevel: Math.max(0, xp - currentLevelXp),
      requiredWithinLevel: null,
      remainingXp: null,
      nextLevel: null,
      isMaximumLevel: true,
    };
  }

  const nextLevel = (buildingLevel + 1) as StartupBuildingLevel;
  if (
    !Number.isFinite(currentLevelXp)
    || nextLevelXp === null
    || !Number.isFinite(nextLevelXp)
    || nextLevelXp <= currentLevelXp
  ) {
    return {
      percentage: 0,
      earnedWithinLevel: Math.max(0, xp - (Number.isFinite(currentLevelXp) ? currentLevelXp : 0)),
      requiredWithinLevel: null,
      remainingXp: null,
      nextLevel,
      isMaximumLevel: false,
    };
  }

  const requiredWithinLevel = nextLevelXp - currentLevelXp;
  const earnedWithinLevel = Math.max(0, xp - currentLevelXp);
  return {
    percentage: Math.min(100, Math.max(0, (earnedWithinLevel / requiredWithinLevel) * 100)),
    earnedWithinLevel,
    requiredWithinLevel,
    remainingXp: Math.max(0, nextLevelXp - xp),
    nextLevel,
    isMaximumLevel: false,
  };
}
