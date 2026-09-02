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

/** Sideways offset into the lawn pocket beside the 3.4-wide driveway, and forward into the front
 * yard. The building fills most of the 11.4 x 10.3 plot at scale 1.4, so the pockets either side
 * of the drive are the only free ground: 4.0 wide, and 2.3 deep even for the deepest building. */
const BILLBOARD_SIDE_OFFSET = 3.7;
const BILLBOARD_YARD_OFFSET = 3.9;

export function createPlotDevelopmentEntities(
  plotEntity: CityEntity,
  development: Pick<CityDevelopment, "plotId" | "building" | "project" | "billboard">,
): CityEntity[] {
  if (!plotEntity.plotId) return [];

  const assetId = development.building.assetId;
  const placement = getBuildingPlacement(plotEntity);
  const facesPositiveZ = (plotEntity.rotationY ?? 0) === 0;
  return [{
    id: `${plotEntity.plotId}-${assetId}`,
    assetId,
    position: placement.position,
    rotationY: placement.rotationY,
    scale: 1.4,
    buildingColor: development.building.color,
    plotId: development.plotId,
    interactive: true,
    suppressPlotHighlight: true,
  }, {
    // `-billboard` is not cosmetic: Scene keys its reveal animation off an id prefix match on the
    // plot, so naming it this way makes the board rise into place with the building.
    id: `${plotEntity.plotId}-billboard`,
    assetId: "billboard" as const,
    position: {
      x: plotEntity.position.x + BILLBOARD_SIDE_OFFSET,
      y: 0,
      z: plotEntity.position.z + (facesPositiveZ ? BILLBOARD_YARD_OFFSET : -BILLBOARD_YARD_OFFSET),
    },
    // The board's face points the opposite way to the building's front, so it takes the opposite
    // rotation and still ends up facing the road.
    rotationY: facesPositiveZ ? undefined : Math.PI,
    plotId: development.plotId,
    suppressPlotHighlight: true,
    billboard: {
      name: development.project.name,
      textColor: development.billboard.textColor,
      backgroundColor: development.billboard.backgroundColor,
    },
  }];
}
