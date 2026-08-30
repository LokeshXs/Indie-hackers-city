import { access, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CITY_ASSET_PATHS } from "./src/components/city-map/city-assets";

describe("3D city asset kit", () => {
  it("ships every retained map model as a non-empty GLB asset", async () => {
    await Promise.all(Object.values(CITY_ASSET_PATHS).map(async (assetPath) => {
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
      "artwork/3d/v3/trees/palm-tree.blend",
      "artwork/3d/v3/startup-building-level-1.blend",
      "artwork/3d/v3/corner-studio-level-1.blend",
      "artwork/3d/v3/indie-garage-level-1.blend",
    ]) {
      const path = join(process.cwd(), source);
      await access(path);
      expect((await stat(path)).size).toBeGreaterThan(1000);
    }
  });
});
