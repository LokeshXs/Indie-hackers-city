import type { ProjectType, StartupBuildingAssetId, LevelTwoBuildingAssetId, AchievementType } from "./types";

export const PROJECT_TYPES = ["website", "app", "chrome-extension"] as const satisfies readonly ProjectType[];
export const STARTUP_BUILDING_ASSET_IDS = [
  "startup-building-level-1",
  "corner-studio-level-1",
  "indie-garage-level-1",
] as const satisfies readonly StartupBuildingAssetId[];

/** The premises the 490 XP reward offers. Kept out of STARTUP_BUILDING_ASSET_IDS on purpose: that
 * list gates validateBuildingChoice, and a level-2 id must never be claimable at signup.
 *
 * Note neither list is compiler-enforced as exhaustive -- `satisfies readonly T[]` checks that the
 * members are assignable, not that they are all present -- so growing either union will NOT produce
 * an error here. Adding a shell means editing this by hand. */
export const LEVEL_TWO_BUILDING_ASSET_IDS = [
  "slat-studio-level-2",
  "teal-brow-level-2",
] as const satisfies readonly LevelTwoBuildingAssetId[];

export const X_HANDLE_PATTERN = /^@?[A-Za-z0-9_]{1,15}$/;

/** Billboard colours are free-form rather than a palette, so the whole stack agrees on a format
 * instead of an allow-list. Mirrors the `^#[0-9a-f]{6}$` check on plot_claims. */
export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/;
export const DEFAULT_BILLBOARD_TEXT_COLOR = "#f7e0a6";
export const DEFAULT_BILLBOARD_BACKGROUND_COLOR = "#1b3a4b";

export const ACHIEVEMENT_TYPES = [
  "product_launched",
  "users_10",
  "users_50",
  "users_100",
  "revenue_10",
  "revenue_100",
] as const satisfies readonly AchievementType[];

/** Mirrors max_projects_per_founder in public.create_project. Until achievement approval exists,
 * this cap is the ceiling on how much XP a founder can mint. */
export const MAX_PROJECTS_PER_FOUNDER = 10;
