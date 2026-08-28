import type { CityDistrict } from "./map-types";

const plotColumns = [-18, -6, 6, 18];

const plots: CityDistrict["plots"] = [
  ...plotColumns.map((_, index) => ({
    id: `plot-north-${index + 1}`,
    label: `North plot ${index + 1}`,
    status: "available" as const,
  })),
  ...plotColumns.map((_, index) => ({
    id: `plot-south-${index + 1}`,
    label: `South plot ${index + 1}`,
    status: "available" as const,
  })),
];

const entities: CityDistrict["entities"] = [
  { id: "map-base", assetId: "map-base", position: { x: 0, y: 0, z: 0 } },
  { id: "road-starter", assetId: "road-straight", position: { x: 0, y: 0, z: 0 } },
  { id: "sidewalk-north", assetId: "sidewalk-straight", position: { x: 0, y: 0, z: -3.15 } },
  { id: "sidewalk-south", assetId: "sidewalk-straight", position: { x: 0, y: 0, z: 3.15 }, rotationY: Math.PI },
  ...plotColumns.map((x, index) => ({
    id: `grass-plot-north-${index + 1}`,
    assetId: "grass-plot" as const,
    position: { x, y: 0, z: -9.45 },
    plotId: `plot-north-${index + 1}`,
    interactive: true,
  })),
  ...plotColumns.map((x, index) => ({
    id: `grass-plot-south-${index + 1}`,
    assetId: "grass-plot" as const,
    position: { x, y: 0, z: 9.45 },
    rotationY: Math.PI,
    plotId: `plot-south-${index + 1}`,
    interactive: true,
  })),
  ...plotColumns.map((x, index) => ({
    id: `driveway-north-${index + 1}`,
    assetId: "driveway-straight" as const,
    position: { x, y: 0, z: -2.15 },
  })),
  ...plotColumns.map((x, index) => ({
    id: `driveway-south-${index + 1}`,
    assetId: "driveway-straight" as const,
    position: { x, y: 0, z: 2.15 },
    rotationY: Math.PI,
  })),
];

export const starterDistrict: CityDistrict = {
  id: "founders-crossing",
  name: "Founders Crossing",
  plots,
  entities,
};
