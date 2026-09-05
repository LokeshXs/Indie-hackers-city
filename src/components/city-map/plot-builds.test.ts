import { describe, expect, it } from "vitest";
import type { StartupBuildingAssetId } from "./plot-builds";
import type { CityEntity } from "./map-types";
import { createPlotDevelopmentEntities } from "./plot-builds";

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
  building: { level: 1 as const, assetId, color: "#d1ad6e" },
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
      buildingColor: "#d1ad6e",
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
      buildingColor: "#d1ad6e",
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
      buildingColor: "#d1ad6e",
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
      buildingColor: "#d1ad6e",
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
      buildingColor: "#d1ad6e",
      plotId: "plot-north-1",
      interactive: true,
      suppressPlotHighlight: true,
    });
  });

  it("stands a billboard in the front-yard pocket beside the driveway", () => {
    const entities = createPlotDevelopmentEntities(plot(-7.90, undefined), development("plot-north-1"));
    expect(entities).toHaveLength(2);
    expect(entities[1]).toEqual({
      id: "plot-north-1-billboard",
      assetId: "billboard",
      position: { x: -14.3, y: 0, z: -4 },
      rotationY: undefined,
      plotId: "plot-north-1",
      suppressPlotHighlight: true,
      // Below the 240 XP marquee unlock, so the board is static.
      billboard: { name: "Xenith", textColor: "#f7e0a6", backgroundColor: "#1b3a4b", scrolling: false },
    });
  });

  it("turns the billboard to the road on a plot facing the other way", () => {
    const entities = createPlotDevelopmentEntities(plot(7.90, Math.PI), development("plot-south-1"));
    expect(entities[1]).toMatchObject({
      id: "plot-south-1-billboard",
      position: { x: -14.3, y: 0, z: 4 },
      rotationY: Math.PI,
    });
  });

  it("faces inward on a south-outer-style plot despite sitting on the positive-z side", () => {
    expect(createPlotDevelopmentEntities(plot(18, undefined), development("plot-south-1"))[0]).toEqual({
      id: "plot-south-1-startup-building-level-1",
      assetId: "startup-building-level-1",
      position: { x: -18, y: 0, z: 16.76 },
      rotationY: Math.PI,
      scale: 1.4,
      buildingColor: "#d1ad6e",
      plotId: "plot-south-1",
      interactive: true,
      suppressPlotHighlight: true,
    });
  });

  it("leaves the plot outline to the plot pad so it is not stamped once per asset", () => {
    const entities = createPlotDevelopmentEntities(plot(-7.90, undefined), development("plot-north-1"));
    // Both stand on the plot and share its id to stay clickable, but the building is scaled 1.4
    // and the billboard sits out in the yard, so either drawing the outline would misplace it.
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
