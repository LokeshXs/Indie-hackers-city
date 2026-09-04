export type ProjectType = "website" | "app" | "chrome-extension";
export type StartupBuildingLevel = 1 | 2 | 3 | 4 | 5;
export type StartupBuildingAssetId = "startup-building-level-1" | "corner-studio-level-1" | "indie-garage-level-1";

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
    color: string;
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
    assetId: StartupBuildingAssetId;
    color: string;
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

export type AchievementType = "product_launched" | "gained_users" | "first_dollar" | "mrr_100";

export interface AchievementDefinition {
  type: AchievementType;
  label: string;
  description: string;
  xpReward: number;
  sortOrder: number;
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
