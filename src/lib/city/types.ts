export type ProjectType = "website" | "app" | "chrome-extension";
export type StartupBuildingLevel = 1 | 2 | 3 | 4 | 5;
export type StartupBuildingAssetId = "startup-building-level-1" | "corner-studio-level-1";

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
