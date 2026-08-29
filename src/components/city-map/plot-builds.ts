import type { CityEntity, WorldPosition } from "./map-types";

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
  buildingColor?: string;
}

// Facing is derived from the plot's own rotationY (not z-sign) so this generalizes to any
// row regardless of which side of the map it's on — only supports rotationY in {0, Math.PI}
// (north/south-facing plots); an east/west-facing row would need this extended.
export function getBuildingPlacement(plotEntity: CityEntity): { position: WorldPosition; rotationY: number | undefined } {
  const facesPositiveZ = (plotEntity.rotationY ?? 0) === 0;
  return {
    position: { x: plotEntity.position.x, y: 0, z: plotEntity.position.z + (facesPositiveZ ? -1.24 : 1.24) },
    rotationY: facesPositiveZ ? Math.PI : undefined,
  };
}

export function createPlotDevelopmentEntities(
  plotEntity: CityEntity,
  development: PlotDevelopment,
): CityEntity[] {
  if (!plotEntity.plotId) return [];

  const assetId = development.assetId ?? "startup-building-level-1";
  const placement = getBuildingPlacement(plotEntity);
  return [{
    id: `${plotEntity.plotId}-${assetId}`,
    assetId,
    position: placement.position,
    rotationY: placement.rotationY,
    scale: 1.4,
    buildingColor: development.buildingColor,
  }];
}
