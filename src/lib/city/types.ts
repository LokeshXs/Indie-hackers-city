export type ProjectType = "website" | "app" | "chrome-extension";
export type StartupBuildingLevel = 1 | 2 | 3 | 4 | 5;
/** The three shells a founder picks from when claiming. Deliberately closed: level-2 premises are
 * earned, never chosen at signup, so they are NOT members of this union -- widening it would put
 * them in the claim carousel and in validateBuildingChoice. */
export type StartupBuildingAssetId = "startup-building-level-1" | "corner-studio-level-1" | "indie-garage-level-1";

/** The premises unlocked by the 490 XP `levelTwo` reward. */
export type LevelTwoBuildingAssetId = "slat-studio-level-2" | "teal-brow-level-2";

/** Anything that can stand on a claimed plot -- wider than StartupBuildingAssetId, because a
 * founder who has redeemed the reward shows a shell that was never on the claim menu. */
export type PlotBuildingAssetId = StartupBuildingAssetId | LevelTwoBuildingAssetId;

export interface ClaimPlotDraft {
  plotId: string;
  founder: {
    fullName: string;
    xHandle: string;
  };
  project: {
    name: string;
    websiteUrl: string;
    type: ProjectType;
  };
  building: {
    level: StartupBuildingLevel;
    assetId: StartupBuildingAssetId;
  };
}

export interface CityDevelopment {
  plotId: string;
  ownerId: string;
  project: {
    id: string;
    name: string;
    websiteUrl: string;
    type: ProjectType;
  };
  founder: {
    fullName: string;
    xHandle: string | null;
    avatarUrl: string | null;
  };
  building: {
    level: StartupBuildingLevel;
    assetId: PlotBuildingAssetId;
  };
  billboard: {
    textColor: string;
    backgroundColor: string;
  };
  progression: {
    xp: number;
    buildingLevel: StartupBuildingLevel;
    currentLevelXp: number;
    nextLevelXp: number | null;
  };
  claimedAt: string;
  updatedAt: string;
}

export type CityDevelopmentRecord = Record<string, CityDevelopment>;

export type AchievementGroup = "launch" | "users" | "revenue";

/** Revenue is claimed once per founder; launch and users once per project. */
export type AchievementScope = "project" | "founder";

export type AchievementType =
  | "product_launched"
  | "users_10"
  | "users_50"
  | "users_100"
  | "revenue_10"
  | "revenue_100";

export interface AchievementDefinition {
  type: AchievementType;
  label: string;
  description: string;
  xpReward: number;
  sortOrder: number;
  group: AchievementGroup;
  scope: AchievementScope;
  /** Rung within the group. Claiming a rung also grants every rung below it. */
  tier: number;
  /** product_launched is claimed by creating a project, not by picking one. */
  requiresNewProject: boolean;
}

/** One row of the founder's portfolio. Assembled client-side from `projects` and
 * `project_achievements`, which are both publicly readable. */
export interface FounderProject {
  id: string;
  name: string;
  websiteUrl: string;
  type: ProjectType;
  /** True for the single project standing on the plot's billboard. */
  isShowcased: boolean;
  achievements: AchievementType[];
  createdAt: string;
}

export interface AwardedAchievement {
  achievementType: AchievementType;
  projectId: string;
  xpAwarded: number;
  xpTotal: number;
  buildingLevel: StartupBuildingLevel;
  levelChanged: boolean;
}
