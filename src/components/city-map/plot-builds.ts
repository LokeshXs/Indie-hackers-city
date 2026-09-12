import type { CityEntity, WorldPosition } from "./map-types";
import { unlocksFor } from "@/lib/city/unlocks";
import type { CityDevelopment, PlotBuildingAssetId } from "@/lib/city/types";
import { BUILDING_SIGN_ANCHORS } from "./city-assets";

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

/** The building's scale on its plot. Roof props ride the same group, so they share it. */
export const PLOT_BUILDING_SCALE = 1.4;

/** The billboard model's own measurements, off scripts/props/build-billboard.py.
 *
 * The board is authored as a yard sign on two posts: a navy frame 3.24 across and 2.12 deep whose
 * lower edge sits 1.74 up, carrying the painted card, on posts that run down to a pair of paving
 * pads. Only the frame and the card are wanted on a roof. The posts and pads are not removed --
 * they are simply below the roofline once the sign is seated, and inside a solid building. */
const BILLBOARD_FRAME_WIDTH = 3.24;
const BILLBOARD_FRAME_HEIGHT = 2.12;
const BILLBOARD_FRAME_BOTTOM = 1.74;

/** How much of the roof's width the sign spans. Just under one: the width it is measured against
 * is the eave, so a hair's inset keeps the frame's ends clear of the fascia's rounded corners
 * while still reading as the full width of the building. */
const SIGN_WIDTH_SHARE = 0.98;

/** The sign's height in world units, the same on every shell.
 *
 * Fixed rather than fitted, unlike the width: a sign scaled in both directions would be twice as
 * tall on the level-2 shell as on a garage, and a founder's board would change shape when they
 * moved premises. Fixing the height also fixes the card's proportions, which is what lets
 * billboard-texture paint one aspect and never stretch the name -- see CARD_WIDTH there. */
const SIGN_HEIGHT = 2.2;

/** How far the frame's lower edge is sunk below the roofline. Enough to close the joint, so the
 * sign reads as mounted rather than balanced on the tiles. */
const SIGN_SEAT = 0.12;

/** The scale an entity renders at, on all three axes.
 *
 * `scale` alone is the uniform case and `scaleXZ` widens or deepens it -- which since the founder's
 * sign became a rooftop board fitted to its building is no longer a rare shape. It lives here
 * because THREE places render city entities: the map, the plot preview on the project card, and the
 * reveal animation. Two of them used to compose this by hand and one of those had simply never been
 * taught about scaleXZ, so a sign that was the right width on the map was narrow on the card.
 *
 * Y is the middle component. That is the order CityAsset established and the order `scaleXZ`'s name
 * implies -- it names the two axes it covers, not the two it sits between. */
export function entityScale(entity: Pick<CityEntity, "scale" | "scaleXZ">): [number, number, number] {
  const scale = entity.scale ?? 1;
  return entity.scaleXZ ? [entity.scaleXZ.x, scale, entity.scaleXZ.z] : [scale, scale, scale];
}

/** How the billboard model is stretched to become this building's sign.
 *
 * Exported because the claim modal previews the sign before the building exists, and a preview at
 * the wrong proportions would show the founder a card that is not the one they get. One function,
 * so the two cannot drift apart. */
export function getSignScale(assetId: PlotBuildingAssetId): { x: number; y: number } {
  const sign = BUILDING_SIGN_ANCHORS[assetId];
  return {
    x: (sign.width * PLOT_BUILDING_SCALE * SIGN_WIDTH_SHARE) / BILLBOARD_FRAME_WIDTH,
    y: SIGN_HEIGHT / BILLBOARD_FRAME_HEIGHT,
  };
}

/** The width the preview stage frames a sign at, in world units. */
export const SIGN_PREVIEW_WIDTH = 6;

/** The sign at `assetId`'s proportions, shrunk to SIGN_PREVIEW_WIDTH. */
export function getSignPreviewScale(assetId: PlotBuildingAssetId): [number, number, number] {
  const scale = getSignScale(assetId);
  const fit = SIGN_PREVIEW_WIDTH / (BILLBOARD_FRAME_WIDTH * scale.x);
  return [scale.x * fit, scale.y * fit, scale.y * fit];
}

export function createPlotDevelopmentEntities(
  plotEntity: CityEntity,
  development: Pick<CityDevelopment, "plotId" | "building" | "project" | "billboard" | "progression">,
): CityEntity[] {
  if (!plotEntity.plotId) return [];

  const assetId = development.building.assetId;
  const placement = getBuildingPlacement(plotEntity);
  const facesPositiveZ = (plotEntity.rotationY ?? 0) === 0;

  // The rooftop sign, worked out in the building's own frame and then carried into the world by the
  // building's rotation. Both rotations are 0 or pi, so the sine and cosine are exact.
  const sign = BUILDING_SIGN_ANCHORS[assetId];
  const facing = placement.rotationY ?? 0;
  const facingCos = Math.cos(facing);
  const facingSin = Math.sin(facing);
  const signX = sign.x * PLOT_BUILDING_SCALE;
  const signZ = sign.z * PLOT_BUILDING_SCALE;
  const { x: signScaleX, y: signScaleY } = getSignScale(assetId);

  return [{
    id: `${plotEntity.plotId}-${assetId}`,
    assetId,
    position: placement.position,
    rotationY: placement.rotationY,
    scale: PLOT_BUILDING_SCALE,
    plotId: development.plotId,
    interactive: true,
    suppressPlotHighlight: true,
  }, {
    // `-billboard` is not cosmetic: Scene keys its reveal animation off an id prefix match on the
    // plot, so naming it this way makes the board rise into place with the building.
    id: `${plotEntity.plotId}-billboard`,
    assetId: "billboard" as const,
    // On the roof, above the entrance, fitted to the building's own width — see BUILDING_SIGN_ANCHORS.
    //
    // The anchor is in the BUILDING's local frame, so it is turned by the BUILDING's rotation to
    // reach the world, while the sign itself takes the opposite rotation below. Those two being
    // different is not a slip: the card faces +z in its own model and the shell's front is -z, so
    // matching the rotations would hang the sign face-down over the back garden.
    position: {
      x: placement.position.x + signX * facingCos + signZ * facingSin,
      y: sign.y * PLOT_BUILDING_SCALE - BILLBOARD_FRAME_BOTTOM * signScaleY - SIGN_SEAT,
      z: placement.position.z - signX * facingSin + signZ * facingCos,
    },
    // The board's face points the opposite way to the building's front, so it takes the opposite
    // rotation and still ends up facing the road.
    rotationY: facesPositiveZ ? undefined : Math.PI,
    // Wide to the building, fixed in height. `scale` is the y axis and `scaleXZ` the other two —
    // see CityAsset, which composes them in that order.
    scale: signScaleY,
    scaleXZ: { x: signScaleX, z: signScaleY },
    plotId: development.plotId,
    suppressPlotHighlight: true,
    billboard: {
      name: development.project.name,
      textColor: development.billboard.textColor,
      backgroundColor: development.billboard.backgroundColor,
      // Earned at 240 XP. Derived rather than stored, like every other unlock.
      scrolling: unlocksFor(development.progression.xp).marquee,
    },
  }];
}
