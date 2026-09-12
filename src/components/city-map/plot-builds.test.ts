import { describe, expect, it } from "vitest";
import type { StartupBuildingAssetId } from "./plot-builds";
import type { CityEntity } from "./map-types";
import { createPlotDevelopmentEntities, entityScale } from "./plot-builds";

const plot = (z: number, rotationY: number | undefined): CityEntity => ({
  id: z < 0 ? "grass-plot-north-1" : "grass-plot-south-1",
  assetId: "grass-plot",
  position: { x: -18, y: 0, z },
  rotationY,
  plotId: z < 0 ? "plot-north-1" : "plot-south-1",
  interactive: true,
});
const development = (plotId: string, assetId: StartupBuildingAssetId = "startup-building-level-1") => ({
  plotId,
  building: { level: 1 as const, assetId },
  project: { id: "p1", name: "Xenith", websiteUrl: "https://xenith.dev/", type: "website" as const },
  billboard: { textColor: "#f7e0a6", backgroundColor: "#1b3a4b" },
  // The board's scrolling flag is derived from XP, so the fixture has to carry progression.
  progression: { xp: 10, buildingLevel: 1 as const, currentLevelXp: 0, nextLevelXp: 100 },
});
describe("Level 1 plot development", () => {
  it("places the universal building immediately on a north plot", () => {
    expect(createPlotDevelopmentEntities(plot(-7.90, undefined), development("plot-north-1"))[0]).toEqual({
      id: "plot-north-1-startup-building-level-1",
      assetId: "startup-building-level-1",
      position: { x: -18, y: 0, z: -9.14 },
      rotationY: Math.PI,
      scale: 1.4,
        plotId: "plot-north-1",
      interactive: true,
      suppressPlotHighlight: true,
    });
  });

  it("faces the opposite street side on a south plot", () => {
    expect(createPlotDevelopmentEntities(plot(7.90, Math.PI), development("plot-south-1"))[0]).toEqual({
      id: "plot-south-1-startup-building-level-1",
      assetId: "startup-building-level-1",
      position: { x: -18, y: 0, z: 9.14 },
      rotationY: undefined,
      scale: 1.4,
        plotId: "plot-south-1",
      interactive: true,
      suppressPlotHighlight: true,
    });
  });

  it("places the selected Corner Studio variant", () => {
    expect(createPlotDevelopmentEntities(plot(-7.90, undefined), development("plot-north-1", "corner-studio-level-1"))[0]).toEqual({
      id: "plot-north-1-corner-studio-level-1",
      assetId: "corner-studio-level-1",
      position: { x: -18, y: 0, z: -9.14 },
      rotationY: Math.PI,
      scale: 1.4,
        plotId: "plot-north-1",
      interactive: true,
      suppressPlotHighlight: true,
    });
  });

  it("places the selected Indie Garage variant", () => {
    expect(createPlotDevelopmentEntities(plot(-7.90, undefined), development("plot-north-1", "indie-garage-level-1"))[0]).toEqual({
      id: "plot-north-1-indie-garage-level-1",
      assetId: "indie-garage-level-1",
      position: { x: -18, y: 0, z: -9.14 },
      rotationY: Math.PI,
      scale: 1.4,
        plotId: "plot-north-1",
      interactive: true,
      suppressPlotHighlight: true,
    });
  });

  it("faces inward on a north-outer-style plot despite sitting on the negative-z side", () => {
    // Facing is derived from rotationY, not z-sign — this plot is on the north (negative z)
    // side of the map but points away from it (rotationY: Math.PI), like the new outer row.
    expect(createPlotDevelopmentEntities(plot(-18, Math.PI), development("plot-north-1"))[0]).toEqual({
      id: "plot-north-1-startup-building-level-1",
      assetId: "startup-building-level-1",
      position: { x: -18, y: 0, z: -16.76 },
      rotationY: undefined,
      scale: 1.4,
        plotId: "plot-north-1",
      interactive: true,
      suppressPlotHighlight: true,
    });
  });

  it("mounts the sign on the building's roof rather than out on the lawn", () => {
    const entities = createPlotDevelopmentEntities(plot(-7.90, undefined), development("plot-north-1"));
    const [building, sign] = entities;
    expect(entities).toHaveLength(2);
    expect(sign).toMatchObject({
      id: "plot-north-1-billboard",
      assetId: "billboard",
      // The board's face points the opposite way to the shell's front, so it takes the opposite
      // rotation and still looks out over the driveway.
      rotationY: undefined,
      plotId: "plot-north-1",
      suppressPlotHighlight: true,
      // Below the 240 XP marquee unlock, so the board is static.
      billboard: { name: "Xenith", textColor: "#f7e0a6", backgroundColor: "#1b3a4b", scrolling: false },
    });
    // Up on the roof: the startup shell's deck tops out at 3.98 before its 1.4 scale, so the frame
    // is seated well over three units up rather than standing on the ground.
    expect(sign.position.y).toBeCloseTo(3.646, 2);
    // Centred across the building, and forward of it — the shell faces +z here, so the sign sits on
    // the road side of the building's own centre.
    expect(sign.position.x).toBeCloseTo(building.position.x, 6);
    expect(sign.position.z).toBeGreaterThan(building.position.z);
  });

  it("fits the sign to the building's width", () => {
    const [, sign] = createPlotDevelopmentEntities(plot(-7.90, undefined), development("plot-north-1"));
    // The billboard frame is 3.24 across in the glb, and the startup shell's roof is 8.16 wide
    // before its 1.4 scale. The sign spans a shade under that, so it never oversails the walls.
    expect((sign.scaleXZ?.x ?? 1) * 3.24).toBeCloseTo(8.16 * 1.4 * 0.98, 5);
    // Height is fixed rather than fitted, so a founder's board keeps its shape across a move.
    expect((sign.scale ?? 1) * 2.12).toBeCloseTo(2.2, 5);
    expect(sign.scaleXZ?.z).toBe(sign.scale);
  });

  it("turns the sign to the road on a plot facing the other way", () => {
    const [building, sign] = createPlotDevelopmentEntities(plot(7.90, Math.PI), development("plot-south-1"));
    expect(sign).toMatchObject({ id: "plot-south-1-billboard", rotationY: Math.PI });
    // This shell faces -z, so "forward" is the other way round and the sign moves with it.
    expect(sign.position.z).toBeLessThan(building.position.z);
    expect(sign.position.x).toBeCloseTo(building.position.x, 6);
  });

  it("faces inward on a south-outer-style plot despite sitting on the positive-z side", () => {
    expect(createPlotDevelopmentEntities(plot(18, undefined), development("plot-south-1"))[0]).toEqual({
      id: "plot-south-1-startup-building-level-1",
      assetId: "startup-building-level-1",
      position: { x: -18, y: 0, z: 16.76 },
      rotationY: Math.PI,
      scale: 1.4,
        plotId: "plot-south-1",
      interactive: true,
      suppressPlotHighlight: true,
    });
  });

  it("leaves the plot outline to the plot pad so it is not stamped once per asset", () => {
    const entities = createPlotDevelopmentEntities(plot(-7.90, undefined), development("plot-north-1"));
    // Both stand on the plot and share its id to stay clickable, but the building is scaled 1.4
    // and the sign rides on its roof, so either drawing the outline would misplace it.
    expect(entities.every((entity) => entity.suppressPlotHighlight)).toBe(true);
  });

  it("switches the billboard to a marquee once the 240 XP unlock is reached", () => {
    const earned = {
      ...development("plot-north-1"),
      progression: { xp: 240, buildingLevel: 1 as const, currentLevelXp: 100, nextLevelXp: 300 },
    };
    const [, billboard] = createPlotDevelopmentEntities(plot(-7.90, undefined), earned);
    expect(billboard.billboard?.scrolling).toBe(true);
  });
});

describe("entityScale", () => {
  it("keeps a plain scale uniform", () => {
    expect(entityScale({ scale: 1.4 })).toEqual([1.4, 1.4, 1.4]);
    expect(entityScale({})).toEqual([1, 1, 1]);
  });

  it("puts scaleXZ on the outer axes and leaves scale as the height", () => {
    // The order is the contract every renderer depends on, and the rooftop sign is the first entity
    // where getting it wrong is visible rather than merely wrong.
    expect(entityScale({ scale: 2, scaleXZ: { x: 5, z: 3 } })).toEqual([5, 2, 3]);
  });

  it("gives the sign the width its entity asked for", () => {
    const [, sign] = createPlotDevelopmentEntities(plot(-7.90, undefined), development("plot-north-1"));
    const [x, y, z] = entityScale(sign);
    expect(x).toBeGreaterThan(3);
    expect(y).toBeCloseTo(2.2 / 2.12, 6);
    expect(z).toBe(y);
  });
});
