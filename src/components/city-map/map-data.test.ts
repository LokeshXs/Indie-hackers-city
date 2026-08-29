import { describe, expect, it } from "vitest";
import { CITY_ASSET_PATHS } from "./city-assets";
import { starterDistrict } from "./map-data";

describe("starter district", () => {
  it("starts with sixty-four empty interactive plots across four blocks", () => {
    expect(starterDistrict.id).toBe("founders-crossing");
    expect(starterDistrict.plots).toHaveLength(64);
    expect(starterDistrict.plots.every((plot) => plot.status === "available")).toBe(true);
    expect(starterDistrict.entities).toHaveLength(216);
    expect(starterDistrict.entities.filter((entity) => entity.plotId)).toHaveLength(64);
    expect(starterDistrict.entities.filter((entity) => entity.interactive)).toHaveLength(64);
    expect(new Set(starterDistrict.entities.map((entity) => entity.assetId))).toEqual(
      new Set(["map-base", "road-straight", "sidewalk-straight", "grass-plot", "driveway-straight"]),
    );
  });

  it("uses valid model references and finite 3D transforms for every entity", () => {
    for (const entity of starterDistrict.entities) {
      expect(CITY_ASSET_PATHS[entity.assetId]).toBeDefined();
      expect(Number.isFinite(entity.position.x)).toBe(true);
      expect(Number.isFinite(entity.position.y)).toBe(true);
      expect(Number.isFinite(entity.position.z)).toBe(true);
      expect(Number.isFinite(entity.rotationY ?? 0)).toBe(true);
      expect(entity.scale ?? 1).toBeGreaterThan(0);
    }
  });
});
