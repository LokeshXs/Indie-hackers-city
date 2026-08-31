import { describe, expect, it } from "vitest";
import { CITY_ASSET_PATHS } from "./city-assets";
import { starterDistrict } from "./map-data";

describe("starter district", () => {
  it("starts with sixty-four empty interactive plots across four blocks", () => {
    expect(starterDistrict.id).toBe("pioneer");
    expect(starterDistrict.name).toBe("Pioneer District");
    expect(starterDistrict.plots).toHaveLength(64);
    expect(new Set(starterDistrict.plots.map((plot) => plot.id)).size).toBe(64);
    expect(starterDistrict.plots.every((plot) => /^pioneer:(jobs|lovelace|turing|hopper):(north|south|north-outer|south-outer):0[1-4]$/.test(plot.id))).toBe(true);
    expect(starterDistrict.entities).toHaveLength(300);
    expect(starterDistrict.entities.filter((entity) => entity.plotId)).toHaveLength(64);
    expect(starterDistrict.entities.filter((entity) => entity.interactive)).toHaveLength(64);
    expect(new Set(starterDistrict.entities.map((entity) => entity.assetId))).toEqual(
      new Set(["map-base", "road-straight", "sidewalk-straight", "grass-plot", "driveway-straight", "roundabout", "palm-tree", "road-link", "launch-monument", "district-sign-gantry"]),
    );
  });

  it("uses memorable street names and canonical Pioneer addresses", () => {
    expect(starterDistrict.plots.find((plot) => plot.id === "pioneer:jobs:north:01")?.label)
      .toBe("Pioneer District · Jobs Avenue · North Plot 01");
    expect(starterDistrict.plots.find((plot) => plot.id === "pioneer:lovelace:south:03")?.label)
      .toBe("Pioneer District · Lovelace Lane · South Plot 03");
    expect(starterDistrict.plots.find((plot) => plot.id === "pioneer:turing:north-outer:02")?.label)
      .toBe("Pioneer District · Turing Street · North Ring Plot 02");
    expect(starterDistrict.plots.find((plot) => plot.id === "pioneer:hopper:south-outer:04")?.label)
      .toBe("Pioneer District · Hopper Way · South Ring Plot 04");
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
