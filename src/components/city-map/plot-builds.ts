import type { CityEntity } from "./map-types";

export type StartupBuildingLevel = 1;
export type StartupBuildingAssetId = "startup-building-level-1" | "corner-studio-level-1";

export interface PlotDevelopment {
  level: StartupBuildingLevel;
  assetId?: StartupBuildingAssetId;
  founder?: {
    fullName: string;
    xHandle: string;
  };
  project?: {
    name: string;
    url: string;
    type: "website" | "app" | "chrome-extension";
    logo: File;
  };
}

export function createPlotDevelopmentEntities(
  plotEntity: CityEntity,
  development: PlotDevelopment,
): CityEntity[] {
  if (!plotEntity.plotId) return [];

  const north = plotEntity.position.z < 0;
  const assetId = development.assetId ?? "startup-building-level-1";
  return [{
    id: `${plotEntity.plotId}-${assetId}`,
    assetId,
    position: { x: plotEntity.position.x, y: 0, z: north ? -10.85 : 10.85 },
    rotationY: north ? Math.PI : undefined,
    scale: 1.4,
  }];
}
