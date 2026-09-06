import { describe, expect, it } from "vitest";
import { LEVEL_TWO_BUILDING_ASSET_IDS, STARTUP_BUILDING_ASSET_IDS } from "@/lib/city/constants";
import type { PlotBuildingAssetId } from "@/lib/city/types";
import { BUILDING_ROOF_ANCHORS } from "./city-assets";

const PLOT_BUILDING_ASSET_IDS: readonly PlotBuildingAssetId[] = [
  ...STARTUP_BUILDING_ASSET_IDS,
  ...LEVEL_TWO_BUILDING_ASSET_IDS,
];

describe("BUILDING_ROOF_ANCHORS", () => {
  // The reason this test exists: RoofProps looks the building up in this record and bails with
  // `return null` when there is no entry. A founder redeeming the 490 XP reward has long since
  // passed the 100 XP roof-lights unlock, so a level-2 shell without anchors would take a reward
  // away as the price of collecting one. The Record's type is total, but the type only guards the
  // shells listed in the union -- this guards the ones a founder can actually end up standing on.
  it("covers every shell that can stand on a plot", () => {
    for (const assetId of PLOT_BUILDING_ASSET_IDS) {
      expect(BUILDING_ROOF_ANCHORS[assetId], `no roof anchors for ${assetId}`).toBeDefined();
    }
  });

  it("gives each one a closed garland and a bubble clear of the roof", () => {
    for (const assetId of PLOT_BUILDING_ASSET_IDS) {
      const anchors = BUILDING_ROOF_ANCHORS[assetId];
      // Fewer than three points cannot enclose a roof, and the wire is strung last-back-to-first.
      expect(anchors.garland.length, assetId).toBeGreaterThanOrEqual(3);
      const highestWire = Math.max(...anchors.garland.map((point) => point.y));
      expect(anchors.bubbleY, assetId).toBeGreaterThan(highestWire);
    }
  });
});
