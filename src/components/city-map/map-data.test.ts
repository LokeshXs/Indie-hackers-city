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
    expect(starterDistrict.entities).toHaveLength(319);
    expect(starterDistrict.entities.filter((entity) => entity.plotId)).toHaveLength(64);
    expect(starterDistrict.entities.filter((entity) => entity.interactive)).toHaveLength(64);
    expect(new Set(starterDistrict.entities.map((entity) => entity.assetId))).toEqual(
      new Set(["map-base", "road-straight", "sidewalk-straight", "grass-plot", "driveway-straight", "roundabout", "palm-tree", "canopy-tree", "street-lamp", "road-link", "launch-monument", "district-sign-gantry", "coffee-shop"]),
    );
  });

  it("stands the coffee shop on Hopper's inner corner without making it claimable", () => {
    const shop = starterDistrict.entities.find((entity) => entity.assetId === "coffee-shop");
    // No plotId and not interactive: with either, clicking it would open the claim flow for a
    // plot the database has already taken out of circulation.
    expect(shop).toMatchObject({ id: "coffee-shop", scale: 1.4 });
    expect(shop?.plotId).toBeUndefined();
    expect(shop?.interactive).toBeUndefined();

    // It takes the reserved plot's own building placement, so it sits where a founder's building
    // would rather than at the pad's centre.
    const pad = starterDistrict.entities.find(
      (entity) => entity.assetId === "grass-plot" && entity.plotId === "pioneer:hopper:north-outer:01",
    );
    expect(pad?.position).toEqual({ x: 22, y: 0, z: 22 });
    expect(shop?.position).toEqual({ x: 22, y: 0, z: 23.24 });
    // The pad faces -z, so the shop is left unrotated: it is authored front-to--z.
    expect(shop?.rotationY).toBeUndefined();

    // The plot itself stays in the catalog. The catalog is the map's geometry; only the database
    // decides who may build, and it is what marks this one inactive.
    expect(starterDistrict.plots.some((plot) => plot.id === "pioneer:hopper:north-outer:01")).toBe(true);
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
