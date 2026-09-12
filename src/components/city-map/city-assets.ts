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

/** How a material behaves after dark.
 *
 * `boost` multiplies whatever emissive strength the glb already carries, so a material that ships
 * dark stays dark and one that ships lit gets brighter -- which is why these are multipliers and
 * not absolute values. Blender's exporter folds any emission strength below 1 into the emissive
 * colour and leaves the strength at 1, so the authored number is not recoverable at runtime; a
 * multiplier does not need it.
 *
 * `nightColor` is for the surfaces that ship no emission at all, where a multiplier has nothing to
 * work on: it fades the emissive from whatever the asset authored (usually black) to this. It is
 * also what turns daylight glazing into lit windows, by walking the blue-green tint the glass wears
 * at noon round to the warm colour of a room with its lamps on. */
export interface NightEmissive {
  boost: number;
  nightColor?: string;
}

/** Everything that lights up after dark, keyed by the material name in the glb.
 *
 * These names are load-bearing and are verified against the build scripts under `scripts/` -- a
 * typo here is silent, and shows up as one building that never turns its lights on. Adding a new
 * asset to the kit means adding its lit surfaces here, or it stands dark in a lit street.
 *
 * The values are all any of this is: the whole look of the city at night is tuned from this table
 * and the palettes in lib/city/time-of-day.ts, and nowhere else. */
export const NIGHT_EMISSIVE_MATERIALS: Record<string, NightEmissive> = {
  // The street lamps. Already the brightest thing the kit ships at 1.8, because they read as lit
  // even at noon; after dark they carry the streets on their own.
  "Lamp globe glow": { boost: 3.4 },

  // Shopfront glazing, on each of the three level-1 shells. Daylight leaves these a cool tint
  // picked to sit against the sea; night walks them round to lamplight.
  "Warm blue glass": { boost: 2.2, nightColor: "#a9702f" },
  "Deep aqua glass": { boost: 2.2, nightColor: "#a9702f" },
  "Garage aqua glass": { boost: 2.2, nightColor: "#a9702f" },

  // The garage's lit interior, which is the one level-1 shell you can see inside.
  "Monitor glow": { boost: 1.5 },
  "Warm work light": { boost: 1.45 },
  "Server alert red": { boost: 1.4 },

  // Level-2 premises. Both ship a furnished room behind glass, lit just enough to be legible in
  // the building's own shadow -- after dark that room becomes the point of the building.
  "Studio back wall": { boost: 3.4 },
  "Laptop screen": { boost: 1.5 },
  "Brow wall light": { boost: 2.6 },
  "Brow room wall": { boost: 3.6 },
  "Brow laptop screen": { boost: 1.5 },
  "Brow whiteboard": { boost: 2.2 },

  // The Coffee House. It is the one building on the map that is somewhere to go rather than
  // somewhere someone works, so it gets the warmest window in the city and the fullest signage.
  "Coffee House glazing": { boost: 3.2, nightColor: "#b4742c" },
  // The fascia: raised cream type on a green board. The type is what lights, the board behind it
  // lifts just enough to stay a board -- letters glowing in front of an unlit panel read as type
  // floating off the building, which is the thing a real fascia sign never does. The shade tone
  // moves with the face by the same small amount, so the board keeps its own modelling.
  "Coffee House lettering": { boost: 1.6, nightColor: "#c9ad7c" },
  "Coffee House green": { boost: 1, nightColor: "#153d1c" },
  "Coffee House green shade": { boost: 1, nightColor: "#0d2712" },
  // The OPEN sign in the doorway, which is the one thing on this building that is already an
  // illuminated sign at noon. The panel comes up; the lettering is deliberately held back, because
  // on a real OPEN sign the letters are the part that does NOT glow -- they are cut out of the lit
  // panel -- and it carries its small emission only so the brown holds its hue in a dark doorway.
  "Coffee House open sign": { boost: 2 },
  "Coffee House open lettering": { boost: 1.3 },

  // The district sign over the roundabout. The lettering ships unlit -- it is cream paint, lit by
  // the sun -- so a multiplier has nothing to work on and the colour is what does the job: after
  // dark the name is an illuminated sign rather than a dark board. The trim picks up a low neon
  // edge behind it, which is what stops the lettering floating unattached in the dark.
  "District sign lettering": { boost: 1.6, nightColor: "#b09256" },
  "District sign trim": { boost: 1.8, nightColor: "#1e6f74" },

  // The launch monument at the centre of the roundabout. The flame and the portholes are the
  // rocket's own lights and simply come up; the hull is lifted a little as though floodlit from
  // the island below it, because a monument that only glows at its engine reads as a candle
  // floating in the dark rather than as a lit landmark.
  "Launch flame": { boost: 2.2 },
  "Launch flame core": { boost: 2.2 },
  "Porthole glass": { boost: 2.2, nightColor: "#a87a35" },
  // The hull is lifted only a little, as though floodlit from the island below it. The red — the
  // nose cone, the band under it, the hull studs and the four stabiliser fins, which are all one
  // material — is lit properly instead, so the rocket keeps its markings after dark rather than
  // fading to a pale shape. It is held under the bloom threshold on purpose: a red bright enough
  // to bloom at this size stops being a painted fin and becomes a lamp.
  "Rocket white": { boost: 1, nightColor: "#3a3630" },
  "Rocket red": { boost: 2.8, nightColor: "#c8341a" },

  // Traffic. Both already carry a little emission so the lenses read at noon; at night they are
  // the only moving lights on the map.
  "Car headlight": { boost: 3.6 },
  "Car taillight": { boost: 2.8 },
};

/** The founder signs, which are lit rather than boosted.
 *
 * Every board carries a different painted card, so there is no shared material to put in the table
 * above: the runtime clones one per board to hang the card on. The clone is lit by routing that
 * same card into the emissive channel -- a flat emissive colour would glow the whole face evenly
 * and swallow the product name, which is the one thing the sign exists to show.
 *
 * Bright, and deliberately the brightest thing on a plot after dark: this is the one surface in the
 * city that belongs to a founder, it now sits on their roof where a shop's name belongs, and a
 * rooftop sign that merely catches the moonlight is not a sign. Only the face takes this -- the
 * navy frame around it stays unlit, which is what an illuminated sign actually looks like and what
 * keeps the card's own colours reading as the lit part. */
export const BILLBOARD_NIGHT_EMISSIVE = "#d8d8d8";

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

/** Where the founder's sign sits on each building's roof, in the building's own local space.
 *
 * THE FRONT OF EVERY SHELL IS ITS -Z FACE. The build scripts are authored Z-up and exported with
 * export_yup=True, which turns a Blender (x, y, z) into a three (x, z, -y) -- so the storefront the
 * scripts put at Blender +y arrives facing -z. Every z below is therefore negative: the sign stands
 * at the front of the roof, above the entrance, looking out over the driveway.
 *
 * `width` is the roof's own width at that point, and the sign is fitted to it rather than to a
 * fixed size -- a sign narrower than its building reads as a placard someone propped up there, and
 * one wider oversails the walls. What the sign actually spans is a shade under this: see
 * SIGN_WIDTH_SHARE in plot-builds.
 *
 * Measured off the same roof tiers as BUILDING_ROOF_ANCHORS above, and set back from the front edge
 * by about half a unit so the frame stands on roof rather than overhanging the facade. */
export interface SignAnchor {
  /** Centre of the sign across the frontage. Zero unless the roof itself is off-centre. */
  x: number;
  /** The roof tier the sign stands on. */
  y: number;
  /** How far forward, always negative -- see above. */
  z: number;
  /** The roof's width at the sign, edge to edge. */
  width: number;
}

export const BUILDING_SIGN_ANCHORS: Record<PlotBuildingAssetId, SignAnchor> = {
  // One mass. The sign stands on the flat deck at 3.98, NOT on the 3.75 shadow tier the garland
  // above is hung from -- that band is the eave below the deck, and a sign seated on it sinks a
  // fifth of a unit into the roof. Width is taken from the eave, which is what reads as the
  // building's width from outside.
  "startup-building-level-1": { x: 0, y: 3.98, z: -2.05, width: 8.16 },
  // The L, and the only shell where the sign cannot simply span the frontage: the tower juts
  // forward to -3.29 and occupies x 1.30..3.80, so a full-width sign on the low block would run
  // straight through it. The sign takes the low block's own frontage instead, from its west corner
  // to the tower's flank -- narrower than the others, and the only placement that is not clipped.
  "corner-studio-level-1": { x: -1.40, y: 3.67, z: -0.62, width: 5.40 },
  // One mass, deck at 4.02 over a 3.81 eave. The raised roof bay sits behind the sign, not under it.
  "indie-garage-level-1": { x: 0, y: 4.02, z: -2.02, width: 8.00 },
  // Two tiers stepped front to back. The sign sits on the lower bay that forms the frontage, and
  // still clears the main roof behind it, which is only 1.22 higher.
  "slat-studio-level-2": { x: 0, y: 3.12, z: -2.14, width: 8.10 },
  // One slab oversailing the walls, front edge at -3.05.
  "teal-brow-level-2": { x: 0, y: 7.20, z: -2.50, width: 8.10 },
};

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
