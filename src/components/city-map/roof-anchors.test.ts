import { describe, expect, it } from "vitest";
import { LEVEL_TWO_BUILDING_ASSET_IDS, STARTUP_BUILDING_ASSET_IDS } from "@/lib/city/constants";
import type { PlotBuildingAssetId } from "@/lib/city/types";
import { BUILDING_ROOF_ANCHORS, BUILDING_SIGN_ANCHORS } from "./city-assets";

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

describe("BUILDING_SIGN_ANCHORS", () => {
  it("covers every shell that can stand on a plot", () => {
    // createPlotDevelopmentEntities reads this for every development it builds, so a shell missing
    // from it does not degrade -- it throws while composing the city.
    for (const assetId of PLOT_BUILDING_ASSET_IDS) {
      expect(BUILDING_SIGN_ANCHORS[assetId], `no sign anchor for ${assetId}`).toBeDefined();
    }
  });

  it("puts every sign at the front of its roof", () => {
    // The front of every shell is its -z face, because the build scripts are authored Z-up and
    // exported with export_yup. A positive z here is a sign hung over the back garden, which is
    // both wrong and hard to notice: from most camera angles it is simply missing.
    for (const assetId of PLOT_BUILDING_ASSET_IDS) {
      expect(BUILDING_SIGN_ANCHORS[assetId].z, `${assetId} sign is behind the building`).toBeLessThan(0);
    }
  });

  it("stands every sign on a deck, just above the eave the garland hangs from", () => {
    for (const assetId of PLOT_BUILDING_ASSET_IDS) {
      const sign = BUILDING_SIGN_ANCHORS[assetId];
      const garland = BUILDING_ROOF_ANCHORS[assetId].garland.map((point) => point.y);
      // The two records measure DIFFERENT tiers of the same roof, and getting them confused is how
      // this was wrong the first time. The garland is hung from the shadow band -- the eave, which
      // projects past the walls. The sign stands on the flat deck laid over that band, a fifth of a
      // unit higher. So a sign at or below the garland is sunk into its own roof, and one more than
      // half a unit above it is floating over the building.
      expect(sign.y, `${assetId} sign is sunk into its roof`).toBeGreaterThanOrEqual(Math.min(...garland));
      expect(sign.y, `${assetId} sign floats above its roof`).toBeLessThanOrEqual(Math.max(...garland) + 0.5);
      expect(sign.width, `${assetId} sign has no width`).toBeGreaterThan(0);
    }
  });
});
