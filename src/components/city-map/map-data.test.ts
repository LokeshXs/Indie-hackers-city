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
    expect(starterDistrict.entities).toHaveLength(369);
    expect(starterDistrict.entities.filter((entity) => entity.plotId)).toHaveLength(64);
    expect(starterDistrict.entities.filter((entity) => entity.interactive)).toHaveLength(64);
    expect(new Set(starterDistrict.entities.map((entity) => entity.assetId))).toEqual(
      new Set(["map-base", "road-straight", "sidewalk-straight", "grass-plot", "driveway-straight", "roundabout", "palm-tree", "canopy-tree", "street-lamp", "cafe-lamp", "road-link", "launch-monument", "district-sign-gantry", "coffee-shop"]),
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

describe("the Coffee House's path lamps", () => {
  const lamps = starterDistrict.entities.filter((entity) => entity.id.startsWith("coffee-shop-path-lamp-"));
  const shop = starterDistrict.entities.find((entity) => entity.id === "coffee-shop");

  it("stands a pair of cafe lamps, and leaves the street's own count alone", () => {
    // Their own asset, shorter and warmer than the carriageway lamps -- but still ordinary
    // entities, which is what lets LampGlow find them and light them without knowing about cafes.
    expect(lamps).toHaveLength(2);
    expect(lamps.every((lamp) => lamp.assetId === "cafe-lamp")).toBe(true);
    expect(starterDistrict.entities.filter((entity) => entity.assetId === "street-lamp")).toHaveLength(18);
  });

  it("puts one either side of the path", () => {
    if (!shop) throw new Error("no coffee shop on the map");
    const across = lamps.map((lamp) => lamp.position.x - shop.position.x);
    expect(across.filter((offset) => offset < 0)).toHaveLength(1);
    expect(across.filter((offset) => offset > 0)).toHaveLength(1);
  });

  it("stands them on the terrace boards rather than on the ground", () => {
    if (!shop) throw new Error("no coffee shop on the map");
    // Sunk to the shop's own ground plane they would be ankle-deep in the deck.
    for (const lamp of lamps) expect(lamp.position.y).toBeGreaterThan(shop.position.y);
  });

  it("keeps them clear of the building itself", () => {
    if (!shop) throw new Error("no coffee shop on the map");
    // Out in front, on the terrace: every lamp is further from the map centre along the shop's
    // facing than the shop's own origin, and none is behind it in the building.
    const forward = lamps.map((lamp) => Math.abs(lamp.position.z - shop.position.z));
    expect(Math.min(...forward)).toBeGreaterThan(2);
  });
});

describe("the inner streets' lamps", () => {
  const lamps = starterDistrict.entities.filter((entity) => entity.id.includes("centre-lamp-"));

  it("lights every block's centre street from both pavements, corners included", () => {
    // Three to a pavement -- one at its middle and one at each end -- two pavements, four blocks.
    // The avenues had lamps from the start and these streets had none, which left the plots every
    // founder actually owns dark.
    expect(lamps).toHaveLength(24);
    expect(lamps.filter((lamp) => lamp.id.includes("centre-lamp-corner-"))).toHaveLength(16);
    expect(lamps.every((lamp) => lamp.assetId === "cafe-lamp")).toBe(true);
  });

  it("keeps every one of them out of a driveway", () => {
    // The driveways stand at -18, -6, 6 and 18 from each block's centre and are 3.4 across, so a
    // lamp within 1.7 of one is a lamp in a founder's way in.
    const blockOffsets = [-40, 40];
    for (const lamp of lamps) {
      const localX = blockOffsets.reduce((x, offset) => (Math.abs(x - offset) < Math.abs(x) ? x - offset : x), lamp.position.x);
      for (const driveway of [-18, -6, 6, 18]) {
        expect(Math.abs(localX - driveway), `lamp at ${lamp.position.x} blocks a driveway`).toBeGreaterThan(1.7);
      }
    }
  });

  it("puts the corner lamps at the ends of the run, not among it", () => {
    const corners = lamps.filter((lamp) => lamp.id.includes("centre-lamp-corner-"));
    const middles = lamps.filter((lamp) => !lamp.id.includes("centre-lamp-corner-"));
    // Every corner is further out along the street than every lamp in the middle of it.
    const localX = (x: number) => [-40, 0, 40].reduce((best, offset) => (
      Math.abs(x - offset) < Math.abs(best) ? x - offset : best), x);
    const furthestMiddle = Math.max(...middles.map((lamp) => Math.abs(localX(lamp.position.x))));
    for (const corner of corners) {
      expect(Math.abs(localX(corner.position.x))).toBeGreaterThan(furthestMiddle);
    }
  });

  it("stands them on the paving, clear of the walkers' line", () => {
    // The pavement runs 2.15..2.75 either side of the street and the pedestrian circuits use its
    // centre, so the lamps take the outer edge and leave the middle to the walkers.
    for (const lamp of lamps) {
      expect(lamp.position.y).toBeCloseTo(0.18, 5);
      // The pavement's own centre is 2.45 out and the walkers use it, so every lamp sits beyond
      // that and still inside the paving's outer edge at 2.75.
      const fromStreet = Math.min(...[-40, 0, 40].map((offset) => Math.abs(lamp.position.z - offset)));
      expect(fromStreet).toBeGreaterThan(2.45);
      expect(fromStreet).toBeLessThanOrEqual(2.8);
    }
  });
});

describe("the shoreline lamps", () => {
  const lamps = starterDistrict.entities.filter((entity) => entity.id.includes("shore-lamp-"));

  it("lights the two water-facing sides of every block", () => {
    // Two shore sides a block, three lamps each, four blocks. The other two sides of each block
    // face the avenues, which have had their own lamps from the start.
    expect(lamps).toHaveLength(24);
    expect(lamps.every((lamp) => lamp.assetId === "cafe-lamp")).toBe(true);
  });

  it("stands them outside every block's outer pathway, not inside it", () => {
    // The pathways run at 28.25 and 28.9 from a block's centre; the lamps take their seaward edge,
    // so each one is further out than the paving it stands on rather than back in the block.
    const blockCentres = [-40, 40];
    for (const lamp of lamps) {
      const localX = blockCentres.reduce((best, offset) => (
        Math.abs(lamp.position.x - offset) < Math.abs(best) ? lamp.position.x - offset : best), lamp.position.x);
      const localZ = blockCentres.reduce((best, offset) => (
        Math.abs(lamp.position.z - offset) < Math.abs(best) ? lamp.position.z - offset : best), lamp.position.z);
      const reach = Math.max(Math.abs(localX), Math.abs(localZ));
      expect(reach, `shore lamp at ${lamp.position.x},${lamp.position.z} is inside the block`)
        .toBeGreaterThan(28.25);
    }
  });

  it("never puts one on a side an avenue runs past", () => {
    // Those two sides of each block are cut in half for the link roads, and a lamp dropped at the
    // midpoint of a cut pathway stands in the road that cut it.
    for (const lamp of lamps) {
      const towardCentre = Math.hypot(lamp.position.x, lamp.position.z);
      const blockCentre = Math.hypot(40, 40);
      expect(towardCentre, `shore lamp at ${lamp.position.x},${lamp.position.z} faces the map centre`)
        .toBeGreaterThan(blockCentre - 28.25);
    }
  });
});
