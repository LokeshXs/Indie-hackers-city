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
  { id: "perimeter-road-north-west", assetId: "road-straight", position: { x: -12.37, y: 0.01, z: -14.74 }, scale: 0.524 },
  { id: "perimeter-road-north-east", assetId: "road-straight", position: { x: 12.37, y: 0.01, z: -14.74 }, scale: 0.524 },
  { id: "perimeter-road-south-west", assetId: "road-straight", position: { x: -12.37, y: 0.01, z: 14.74 }, scale: 0.524 },
  { id: "perimeter-road-south-east", assetId: "road-straight", position: { x: 12.37, y: 0.01, z: 14.74 }, scale: 0.524 },
  { id: "perimeter-road-west", assetId: "road-straight", position: { x: -24.74, y: 0.01, z: 0 }, rotationY: Math.PI / 2, scale: 0.6 },
  { id: "perimeter-road-east", assetId: "road-straight", position: { x: 24.74, y: 0.01, z: 0 }, rotationY: Math.PI / 2, scale: 0.6 },
  { id: "sidewalk-north", assetId: "sidewalk-straight", position: { x: 0, y: 0, z: -6.65 } },
  { id: "sidewalk-south", assetId: "sidewalk-straight", position: { x: 0, y: 0, z: 6.65 }, rotationY: Math.PI },
  ...plotColumns.map((x, index) => ({
    id: `grass-plot-north-${index + 1}`,
    assetId: "grass-plot" as const,
    position: { x, y: 0, z: -11 },
    plotId: `plot-north-${index + 1}`,
    interactive: true,
  })),
  ...plotColumns.map((x, index) => ({
    id: `grass-plot-south-${index + 1}`,
    assetId: "grass-plot" as const,
    position: { x, y: 0, z: 11 },
    rotationY: Math.PI,
    plotId: `plot-south-${index + 1}`,
    interactive: true,
  })),
  ...plotColumns.map((x, index) => ({
    id: `driveway-north-${index + 1}`,
    assetId: "driveway-straight" as const,
    position: { x, y: 0, z: -2.65 },
  })),
  ...plotColumns.map((x, index) => ({
    id: `driveway-south-${index + 1}`,
    assetId: "driveway-straight" as const,
    position: { x, y: 0, z: 2.65 },
    rotationY: Math.PI,
  })),
];

export const starterDistrict: CityDistrict = {
  id: "founders-crossing",
  name: "Founders Crossing",
  plots,
  entities,
};
