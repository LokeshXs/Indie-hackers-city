import { describe, expect, it } from "vitest";
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
describe("Level 1 plot development", () => {
  it("places the universal building immediately on a north plot", () => {
    expect(createPlotDevelopmentEntities(plot(-7.90, undefined), { level: 1 })).toEqual([{
      id: "plot-north-1-startup-building-level-1",
      assetId: "startup-building-level-1",
      position: { x: -18, y: 0, z: -9.14 },
      rotationY: Math.PI,
      scale: 1.4,
    }]);
  });

  it("faces the opposite street side on a south plot", () => {
    expect(createPlotDevelopmentEntities(plot(7.90, Math.PI), { level: 1 })).toEqual([{
      id: "plot-south-1-startup-building-level-1",
      assetId: "startup-building-level-1",
      position: { x: -18, y: 0, z: 9.14 },
      rotationY: undefined,
      scale: 1.4,
    }]);
  });

  it("places the selected Corner Studio variant", () => {
    expect(createPlotDevelopmentEntities(plot(-7.90, undefined), {
      level: 1,
      assetId: "corner-studio-level-1",
    })).toEqual([{
      id: "plot-north-1-corner-studio-level-1",
      assetId: "corner-studio-level-1",
      position: { x: -18, y: 0, z: -9.14 },
      rotationY: Math.PI,
      scale: 1.4,
    }]);
  });

  it("faces inward on a north-outer-style plot despite sitting on the negative-z side", () => {
    // Facing is derived from rotationY, not z-sign — this plot is on the north (negative z)
    // side of the map but points away from it (rotationY: Math.PI), like the new outer row.
    expect(createPlotDevelopmentEntities(plot(-18, Math.PI), { level: 1 })).toEqual([{
      id: "plot-north-1-startup-building-level-1",
      assetId: "startup-building-level-1",
      position: { x: -18, y: 0, z: -16.76 },
      rotationY: undefined,
      scale: 1.4,
    }]);
  });

  it("faces inward on a south-outer-style plot despite sitting on the positive-z side", () => {
    expect(createPlotDevelopmentEntities(plot(18, undefined), { level: 1 })).toEqual([{
      id: "plot-south-1-startup-building-level-1",
      assetId: "startup-building-level-1",
      position: { x: -18, y: 0, z: 16.76 },
      rotationY: Math.PI,
      scale: 1.4,
    }]);
  });
});
