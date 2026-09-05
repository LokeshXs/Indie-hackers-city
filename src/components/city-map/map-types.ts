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
  | "billboard"
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
  /** Card content painted onto the billboard's face at runtime. */
  billboard?: { name: string; textColor: string; backgroundColor: string; scrolling?: boolean };
  plotId?: string;
  interactive?: boolean;
  /** Set on assets that stand on a plot (building, billboard) rather than being the plot pad.
   * They share the plot's id so they stay clickable, but the plot outline is drawn once — by the
   * pad — or every asset would stamp its own copy at its own offset and scale. */
  suppressPlotHighlight?: boolean;
}
