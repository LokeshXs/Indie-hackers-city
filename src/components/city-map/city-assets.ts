import type { PlotBuildingAssetId } from "@/lib/city/types";
import type { CityAssetId } from "./map-types";

export const CITY_ASSET_PATHS: Record<CityAssetId, string> = {
  "map-base": "/assets/city/v3/map-base.glb",
  "road-straight": "/assets/city/v3/road-straight.glb",
  "sidewalk-straight": "/assets/city/v3/sidewalk-straight.glb",
  "grass-plot": "/assets/city/v3/grass-plot.glb",
  "driveway-straight": "/assets/city/v3/driveway-straight.glb",
  "roundabout": "/assets/city/v3/roundabout.glb",
  "road-link": "/assets/city/v3/road-link.glb",
  "palm-tree": "/assets/city/v3/trees/palm-tree.glb",
  "canopy-tree": "/assets/city/v3/trees/canopy-tree.glb",
  "street-lamp": "/assets/city/v3/props/street-lamp.glb",
  "billboard": "/assets/city/v3/props/billboard.glb",
  "launch-monument": "/assets/city/v3/landmarks/launch-monument.glb",
  "district-sign-gantry": "/assets/city/v3/landmarks/district-sign-gantry.glb",
  "startup-building-level-1": "/assets/city/v3/startup-building-level-1.glb",
  "corner-studio-level-1": "/assets/city/v3/corner-studio-level-1.glb",
  "indie-garage-level-1": "/assets/city/v3/indie-garage-level-1.glb",
  "slat-studio-level-2": "/assets/city/v3/level2/slat-studio-level-2.glb",
  "teal-brow-level-2": "/assets/city/v3/level2/teal-brow-level-2.glb",
  "coffee-shop": "/assets/city/v3/shops/coffee-shop.glb",
};

/** The pedestrians who walk the pavements.
 *
 * Deliberately outside CITY_ASSET_PATHS. Every id in that record is a `CityEntity.assetId` -- a
 * thing the district places at a position -- and a walker has no position to place: it is put on
 * the map by a route, and the same glb serves every one of them. Listing it there would invite
 * someone to drop a pedestrian into the entity list, where it would stand motionless forever. */
export const PEDESTRIAN_ASSET_PATH = "/assets/city/v3/props/pedestrian.glb";

/** How many colourways build-pedestrian.py writes into that glb, as `pedestrian-<n> <part>`. */
export const PEDESTRIAN_VARIANTS = 6;

/** The five nodes each colourway ships, kept separate so the runtime can swing the limbs.
 *
 * Underscored because three.js sanitises node names as it loads a glb, turning any whitespace
 * into "_". These are the names as they arrive in the scene graph, which is the only spelling
 * getObjectByName will match. */
export const PEDESTRIAN_PARTS = ["body", "leg_left", "leg_right", "arm_left", "arm_right"] as const;

/** The traffic on the district's roads.
 *
 * Outside CITY_ASSET_PATHS for the same reason the pedestrians are: every id in that record is a
 * `CityEntity.assetId`, a thing the district places at a position, and a car has no position to
 * place -- it is put on the map by a circuit, and the same glb serves every one of them. Listing
 * it there would invite someone to drop a car into the entity list, where it would sit parked in
 * the middle of a road forever. */
export const CAR_ASSET_PATH = "/assets/city/v3/vehicles/car.glb";

/** How many colourways build-car.py writes into that glb, each as a single node named `car_<n>`.
 * Unlike the pedestrians it ships no separate parts: a car's only moving part is the car. */
export const CAR_VARIANTS = 4;

// Name of the mesh material representing each building's main wall surface,
// verified against the exported glb material names — used to recolor buildings at runtime.
/** Mesh material on the billboard whose map the runtime replaces with the painted product card.
 * Verified against the exported glb material names. */
export const BILLBOARD_FACE_MATERIAL = "Billboard Dynamic Face";

/** Where roof props sit on each building, in the building's own local space.
 *
 * The Blender sources create no empties, so there is nothing in the glb to hang a prop off, and no
 * two of these roofs are alike. The numbers below are measured off the build scripts.
 *
 * `garland` is a CLOSED POLYLINE rather than a rectangle, and each point carries its own height.
 * That is what the corner studio needs: it is an L of two masses whose roofs sit 0.74 apart, so a
 * single rectangle at a single height either floats off the facade or cuts through the tower. A
 * polyline traces the actual outline and lets the wire climb where the building does.
 *
 * The run sits just OUTSIDE the widest roof tier, at that tier's lip. A garland hung on the deck
 * itself is swallowed by the roof, because a bulb hangs about 0.2 below its wire and the wire sags
 * a further 0.3. Outside the lip they drape down the wall, which is where festoon lights hang.
 *
 * Two conversions are baked in. The scripts are authored Z-up and exported with export_yup=True,
 * so a Blender (x, y, z) is three (x, z, -y) — the Z sign flips. And the cube() helper scales a
 * 2x2x2 primitive, so every scale tuple in those scripts is a half-extent, not a size.
 *
 * These are LOCAL coordinates: props render inside a group carrying the building's own placement
 * and its scale of 1.4, so they need no conversion to world space and inherit its rotation. */
export interface RoofAnchors {
  /** Closed polyline the garland is strung along. Consecutive points are joined, last back to first. */
  garland: Array<{ x: number; y: number; z: number }>;
  /** Clear of the tallest point, including antennas. */
  bubbleY: number;
}

/** How far outside the roof tier the garland hangs, so bulbs clear the fascia. */
const OVERHANG = 0.16;

export const BUILDING_ROOF_ANCHORS: Record<PlotBuildingAssetId, RoofAnchors> = {
  // One mass. Roof shadow tier: top 3.75, X +-4.08, Z +-2.58.
  "startup-building-level-1": {
    garland: [
      { x: -4.08 - OVERHANG, y: 3.75, z: -2.58 - OVERHANG },
      { x: 4.08 + OVERHANG, y: 3.75, z: -2.58 - OVERHANG },
      { x: 4.08 + OVERHANG, y: 3.75, z: 2.58 + OVERHANG },
      { x: -4.08 - OVERHANG, y: 3.75, z: 2.58 + OVERHANG },
    ],
    bubbleY: 6.0,
  },
  // An L of two masses. Low block roof shadow: top 3.48, X -4.10..3.80, Z -1.09..2.39.
  // Tower roof shadow:                          top 4.22, X  1.30..3.80, Z -3.29..0.79.
  // The wire climbs from the low block to the tower along the right flank, and drops back at the
  // inner corner of the L.
  "corner-studio-level-1": {
    garland: [
      { x: -4.10 - OVERHANG, y: 3.48, z: 2.39 + OVERHANG },
      { x: 3.80 + OVERHANG, y: 3.48, z: 2.39 + OVERHANG },
      { x: 3.80 + OVERHANG, y: 4.22, z: 0.79 },
      { x: 3.80 + OVERHANG, y: 4.22, z: -3.29 - OVERHANG },
      { x: 1.30 - OVERHANG, y: 4.22, z: -3.29 - OVERHANG },
      { x: 1.30 - OVERHANG, y: 3.48, z: -1.09 - OVERHANG },
      { x: -4.10 - OVERHANG, y: 3.48, z: -1.09 - OVERHANG },
    ],
    bubbleY: 7.4,
  },
  // One mass. Roof shadow: top 3.81, X +-4.00, Z -2.54..2.58.
  "indie-garage-level-1": {
    garland: [
      { x: -4.00 - OVERHANG, y: 3.81, z: -2.54 - OVERHANG },
      { x: 4.00 + OVERHANG, y: 3.81, z: -2.54 - OVERHANG },
      { x: 4.00 + OVERHANG, y: 3.81, z: 2.58 + OVERHANG },
      { x: -4.00 - OVERHANG, y: 3.81, z: 2.58 + OVERHANG },
    ],
    bubbleY: 7.0,
  },
  // Level-2 premises. These are not optional: RoofProps bails with `return null` when an asset has
  // no entry here, so a founder redeeming the 490 XP reward would lose the roof lights they earned
  // at 100 XP -- an upgrade that quietly takes a reward away.
  //
  // Two full-width tiers stepped front to back. Bay roof: top 3.12, X +-4.05, Z -2.68..-1.60.
  // Main roof:                                            top 4.34, X +-4.05, Z -1.72..2.52.
  // The wire runs the back and both flanks high, then drops to the bay across the frontage.
  "slat-studio-level-2": {
    garland: [
      { x: -4.05 - OVERHANG, y: 4.34, z: 2.52 + OVERHANG },
      { x: 4.05 + OVERHANG, y: 4.34, z: 2.52 + OVERHANG },
      { x: 4.05 + OVERHANG, y: 4.34, z: -1.72 },
      { x: 4.05 + OVERHANG, y: 3.12, z: -2.68 - OVERHANG },
      { x: -4.05 - OVERHANG, y: 3.12, z: -2.68 - OVERHANG },
      { x: -4.05 - OVERHANG, y: 4.34, z: -1.72 },
    ],
    bubbleY: 6.6,
  },
  // One slab, oversailing the walls on every side. Roof slab: top 7.20, X +-4.05, Z -3.05..2.95.
  "teal-brow-level-2": {
    garland: [
      { x: -4.05 - OVERHANG, y: 7.20, z: -3.05 - OVERHANG },
      { x: 4.05 + OVERHANG, y: 7.20, z: -3.05 - OVERHANG },
      { x: 4.05 + OVERHANG, y: 7.20, z: 2.95 + OVERHANG },
      { x: -4.05 - OVERHANG, y: 7.20, z: 2.95 + OVERHANG },
    ],
    bubbleY: 9.2,
  },
};
