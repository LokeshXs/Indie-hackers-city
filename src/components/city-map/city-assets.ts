import type { CityAssetId } from "./map-types";

export const CITY_ASSET_PATHS: Record<CityAssetId, string> = {
  "map-base": "/assets/city/v3/map-base.glb",
  "road-straight": "/assets/city/v3/road-straight.glb",
  "sidewalk-straight": "/assets/city/v3/sidewalk-straight.glb",
  "grass-plot": "/assets/city/v3/grass-plot.glb",
  "driveway-straight": "/assets/city/v3/driveway-straight.glb",
  "startup-building-level-1": "/assets/city/v3/startup-building-level-1.glb",
  "corner-studio-level-1": "/assets/city/v3/corner-studio-level-1.glb",
};

// Name of the mesh material representing each building's main wall surface,
// verified against the exported glb material names — used to recolor buildings at runtime.
export const BUILDING_WALL_MATERIAL: Partial<Record<CityAssetId, string>> = {
  "startup-building-level-1": "Warm cream walls",
  "corner-studio-level-1": "Warm studio cream",
};
