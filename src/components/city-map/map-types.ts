export type PlotStatus = "available" | "reserved" | "occupied";

export type CityAssetId =
  | "map-base"
  | "road-straight"
  | "sidewalk-straight"
  | "grass-plot"
  | "driveway-straight"
  | "startup-building-level-1"
  | "corner-studio-level-1";

export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

export interface CityPlot {
  id: string;
  label: string;
  status: PlotStatus;
  buildingId?: string;
  projectId?: string;
}

export interface CityDistrict {
  id: string;
  name: string;
  plots: CityPlot[];
  entities: CityEntity[];
}

export interface CityEntity {
  id: string;
  assetId: CityAssetId;
  position: WorldPosition;
  rotationY?: number;
  scale?: number;
  scaleXZ?: { x: number; z: number };
  buildingColor?: string;
  plotId?: string;
  interactive?: boolean;
}
