import { access, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CAR_ASSET_PATH, CITY_ASSET_PATHS, PEDESTRIAN_ASSET_PATH } from "./src/components/city-map/city-assets";

describe("3D city asset kit", () => {
  it("ships every retained map model as a non-empty GLB asset", async () => {
    // The two moving models are checked alongside the placed ones even though they are not in
    // CITY_ASSET_PATHS: they are kept out of that record because a route puts them on the map
    // rather than an entity, which is a reason not to give them an assetId and no reason at all
    // to stop checking that they ship.
    const assets = [...Object.values(CITY_ASSET_PATHS), PEDESTRIAN_ASSET_PATH, CAR_ASSET_PATH];
    await Promise.all(assets.map(async (assetPath) => {
      const path = join(process.cwd(), "public", assetPath.replace(/^\//, ""));
      await access(path);
      expect((await stat(path)).size).toBeGreaterThan(1000);
    }));
  });

  it("keeps editable Blender sources for the base and straight road", async () => {
    for (const source of [
      "artwork/3d/v3/map-base.blend",
      "artwork/3d/v3/road-straight.blend",
      "artwork/3d/v3/sidewalk-straight.blend",
      "artwork/3d/v3/grass-plot.blend",
      "artwork/3d/v3/driveway-straight.blend",
      "artwork/3d/v3/roundabout.blend",
      "artwork/3d/v3/road-link.blend",
      "artwork/3d/v3/landmarks/launch-monument.blend",
      "artwork/3d/v3/landmarks/district-sign-gantry.blend",
      "artwork/3d/v3/trees/palm-tree.blend",
      "artwork/3d/v3/trees/canopy-tree.blend",
      "artwork/3d/v3/props/street-lamp.blend",
      "artwork/3d/v3/props/billboard.blend",
      "artwork/3d/v3/props/pedestrian.blend",
      "artwork/3d/v3/vehicles/car.blend",
      "artwork/3d/v3/startup-building-level-1.blend",
      "artwork/3d/v3/corner-studio-level-1.blend",
      "artwork/3d/v3/indie-garage-level-1.blend",
      "artwork/3d/v3/level2/slat-studio-level-2.blend",
      "artwork/3d/v3/level2/teal-brow-level-2.blend",
    ]) {
      const path = join(process.cwd(), source);
      await access(path);
      expect((await stat(path)).size).toBeGreaterThan(1000);
    }
  });
});
