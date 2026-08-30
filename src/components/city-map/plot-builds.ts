import type { CityEntity, WorldPosition } from "./map-types";
import type { CityDevelopment } from "@/lib/city/types";

export type { StartupBuildingAssetId } from "@/lib/city/types";

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
  development: Pick<CityDevelopment, "plotId" | "building">,
): CityEntity[] {
  if (!plotEntity.plotId) return [];

  const assetId = development.building.assetId;
  const placement = getBuildingPlacement(plotEntity);
  return [{
    id: `${plotEntity.plotId}-${assetId}`,
    assetId,
    position: placement.position,
    rotationY: placement.rotationY,
    scale: 1.4,
    buildingColor: development.building.color,
    plotId: development.plotId,
    interactive: true,
  }];
}
