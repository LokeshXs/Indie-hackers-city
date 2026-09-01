export type CityAssetId =
  | "map-base"
  | "road-straight"
  | "sidewalk-straight"
  | "grass-plot"
  | "driveway-straight"
  | "roundabout"
  | "road-link"
  | "palm-tree"
  | "canopy-tree"
  | "street-lamp"
  | "launch-monument"
  | "district-sign-gantry"
  | "startup-building-level-1"
  | "corner-studio-level-1"
  | "indie-garage-level-1";

export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

export interface CityPlot {
  id: string;
  label: string;
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
