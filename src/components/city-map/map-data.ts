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
  { id: "map-base", assetId: "map-base", position: { x: 0, y: 0, z: 0 }, scaleXZ: { x: 1.1888, z: 1.2713 } },
  { id: "road-starter", assetId: "road-straight", position: { x: 0, y: 0, z: 0 } },
  { id: "pathway-center-north", assetId: "sidewalk-straight", position: { x: 0, y: 0, z: -2.45 }, scaleXZ: { x: 0.972, z: 0.3 } },
  { id: "pathway-center-south", assetId: "sidewalk-straight", position: { x: 0, y: 0, z: 2.45 }, rotationY: Math.PI, scaleXZ: { x: 0.972, z: 0.3 } },
  { id: "road-ring-north", assetId: "road-straight", position: { x: 0, y: 0, z: -15.80 }, scaleXZ: { x: 1.144, z: 1 } },
  { id: "road-ring-south", assetId: "road-straight", position: { x: 0, y: 0, z: 15.80 }, rotationY: Math.PI, scaleXZ: { x: 1.144, z: 1 } },
  { id: "road-ring-west", assetId: "road-straight", position: { x: -26.45, y: 0, z: 0 }, rotationY: Math.PI / 2, scaleXZ: { x: 0.718, z: 1 } },
  { id: "road-ring-east", assetId: "road-straight", position: { x: 26.45, y: 0, z: 0 }, rotationY: -Math.PI / 2, scaleXZ: { x: 0.718, z: 1 } },
  { id: "pathway-inner-north", assetId: "sidewalk-straight", position: { x: 0, y: 0, z: -13.35 }, scaleXZ: { x: 0.972, z: 0.3 } },
  { id: "pathway-inner-south", assetId: "sidewalk-straight", position: { x: 0, y: 0, z: 13.35 }, rotationY: Math.PI, scaleXZ: { x: 0.972, z: 0.3 } },
  { id: "pathway-inner-west-north", assetId: "sidewalk-straight", position: { x: -24.0, y: 0, z: -8.20 }, rotationY: Math.PI / 2, scaleXZ: { x: 0.218, z: 0.3 } },
  { id: "pathway-inner-west-south", assetId: "sidewalk-straight", position: { x: -24.0, y: 0, z: 8.20 }, rotationY: Math.PI / 2, scaleXZ: { x: 0.218, z: 0.3 } },
  { id: "pathway-inner-east-north", assetId: "sidewalk-straight", position: { x: 24.0, y: 0, z: -8.20 }, rotationY: -Math.PI / 2, scaleXZ: { x: 0.218, z: 0.3 } },
  { id: "pathway-inner-east-south", assetId: "sidewalk-straight", position: { x: 24.0, y: 0, z: 8.20 }, rotationY: -Math.PI / 2, scaleXZ: { x: 0.218, z: 0.3 } },
  { id: "pathway-outer-north", assetId: "sidewalk-straight", position: { x: 0, y: 0, z: -18.25 }, scaleXZ: { x: 1.168, z: 0.3 } },
  { id: "pathway-outer-south", assetId: "sidewalk-straight", position: { x: 0, y: 0, z: 18.25 }, rotationY: Math.PI, scaleXZ: { x: 1.168, z: 0.3 } },
  { id: "pathway-outer-west", assetId: "sidewalk-straight", position: { x: -28.9, y: 0, z: 0 }, rotationY: Math.PI / 2, scaleXZ: { x: 0.742, z: 0.3 } },
  { id: "pathway-outer-east", assetId: "sidewalk-straight", position: { x: 28.9, y: 0, z: 0 }, rotationY: -Math.PI / 2, scaleXZ: { x: 0.742, z: 0.3 } },
  ...plotColumns.map((x, index) => ({
    id: `grass-plot-north-${index + 1}`,
    assetId: "grass-plot" as const,
    position: { x, y: 0, z: -7.90 },
    plotId: `plot-north-${index + 1}`,
    interactive: true,
  })),
  ...plotColumns.map((x, index) => ({
    id: `grass-plot-south-${index + 1}`,
    assetId: "grass-plot" as const,
    position: { x, y: 0, z: 7.90 },
    rotationY: Math.PI,
    plotId: `plot-south-${index + 1}`,
    interactive: true,
  })),
  ...plotColumns.map((x, index) => ({
    id: `driveway-north-${index + 1}`,
    assetId: "driveway-straight" as const,
    position: { x, y: 0.02, z: -2.15 },
  })),
  ...plotColumns.map((x, index) => ({
    id: `driveway-south-${index + 1}`,
    assetId: "driveway-straight" as const,
    position: { x, y: 0.02, z: 2.15 },
    rotationY: Math.PI,
  })),
];

export const starterDistrict: CityDistrict = {
  id: "founders-crossing",
  name: "Founders Crossing",
  plots,
  entities,
};
