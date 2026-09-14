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
  statusText: string | null;
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
    bio: string | null;
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
  /** What the evidence step asks for, and the note under the field explaining what is wanted.
   * Both live in the catalog so re-wording an ask is an UPDATE, not a deploy. */
  evidencePrompt: string;
  evidenceHint: string;
}

/** What a founder attaches to a claim. At least one of `link` or `filePath` is required -- a note
 * on its own is the claim restated, not evidence for it. */
export interface AchievementEvidence {
  link?: string;
  filePath?: string;
  note?: string;
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
  /** Rungs an admin has approved. These are the ones that paid XP. */
  achievements: AchievementType[];
  /** Rungs filed and waiting on a decision. Kept apart from `achievements` because the two read
   * very differently to a founder: one is a badge, the other is a promise. */
  pendingAchievements: AchievementType[];
  createdAt: string;
}

/** What filing a claim gets you: a place in the queue, and the number the reviewer will see.
 * Deliberately carries no `xpAwarded` or `levelChanged` -- submission moves nothing, and a field
 * that is always zero is an invitation to render it. */
export interface SubmittedAchievement {
  achievementType: AchievementType;
  projectId: string | null;
  status: "pending";
  /** What approving this would grant, cascade included. */
  xpPending: number;
  xpTotal: number;
  buildingLevel: StartupBuildingLevel;
}
