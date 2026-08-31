import type { CityDistrict, CityEntity, CityPlot } from "./map-types";

const plotColumns = [-18, -6, 6, 18];

interface PlotRowConfig {
  idPrefix: string;
  labelPrefix: string;
  plotZ: number;
  drivewayZ: number;
  /** true → rotationY omitted (faces +z); false → rotationY: Math.PI (faces -z) */
  pointsPositiveZ: boolean;
  /** only set for rows that need their own flanking pathway (the two original rows already
   * have a standalone pathway-center-north/south, so they leave this unset) */
  pathwayZ?: number;
}

function createPlotRow(config: PlotRowConfig): { plots: CityPlot[]; entities: CityEntity[] } {
  const rotationY = config.pointsPositiveZ ? undefined : Math.PI;

  const plots: CityPlot[] = plotColumns.map((_, index) => ({
    id: `plot-${config.idPrefix}-${index + 1}`,
    label: `${config.labelPrefix} ${index + 1}`,
  }));

  const grassTiles: CityEntity[] = plotColumns.map((x, index) => ({
    id: `grass-plot-${config.idPrefix}-${index + 1}`,
    assetId: "grass-plot" as const,
    position: { x, y: 0, z: config.plotZ },
    rotationY,
    plotId: `plot-${config.idPrefix}-${index + 1}`,
    interactive: true,
  }));

  const driveways: CityEntity[] = plotColumns.map((x, index) => ({
    id: `driveway-${config.idPrefix}-${index + 1}`,
    assetId: "driveway-straight" as const,
    position: { x, y: 0.02, z: config.drivewayZ },
    rotationY,
  }));

  const pathway: CityEntity[] = config.pathwayZ === undefined ? [] : [{
    id: `pathway-${config.idPrefix}`,
    assetId: "sidewalk-straight",
    position: { x: 0, y: 0, z: config.pathwayZ },
    rotationY,
    scaleXZ: { x: 0.972, z: 0.3 },
  }];

  return { plots, entities: [...grassTiles, ...driveways, ...pathway] };
}

/** Connects a row's outer X edge to ring-road-west/east — one pair per row. */
function createRowXConnectors(idSuffix: string, zCenter: number, length: number): CityEntity[] {
  const scaleXZ = { x: length / 50, z: 0.3 };
  return [
    { id: `pathway-inner-west-${idSuffix}`, assetId: "sidewalk-straight", position: { x: -24.0, y: 0, z: zCenter }, rotationY: Math.PI / 2, scaleXZ },
    { id: `pathway-inner-east-${idSuffix}`, assetId: "sidewalk-straight", position: { x: 24.0, y: 0, z: zCenter }, rotationY: -Math.PI / 2, scaleXZ },
  ];
}

type BlockSide = "north" | "south" | "east" | "west";

/** Each block's outermost pathway, one per side. Sides facing an avenue are split so a
 * connector road can reach the ring road without a raised kerb blocking it. */
const BLOCK_OUTER_PATHWAYS: ReadonlyArray<{
  side: BlockSide;
  position: { x: number; z: number };
  rotationY?: number;
  /** true → the strip runs along X, so its split segments shift in X */
  alongX: boolean;
}> = [
  { side: "north", position: { x: 0, z: -28.25 }, alongX: true },
  { side: "south", position: { x: 0, z: 28.25 }, rotationY: Math.PI, alongX: true },
  { side: "west", position: { x: -28.9, z: 0 }, rotationY: Math.PI / 2, alongX: false },
  { side: "east", position: { x: 28.9, z: 0 }, rotationY: -Math.PI / 2, alongX: false },
];
/** Half-width of the gap cut for a connector. Slightly narrower than the 4.3-wide link road
 * (half 2.15) so the road overlaps each cut end by 0.05 — exactly matching gaps would leave
 * the cut face and the road's side face coplanar, which z-fights along their shared band. */
const LINK_GAP_HALF_WIDTH = 2.10;
/** Half-length of an unsplit outer pathway (50 * 1.142 / 2). */
const OUTER_PATHWAY_HALF = 28.55;

function createBlockOuterPathways(connectedSides: readonly BlockSide[]): CityEntity[] {
  return BLOCK_OUTER_PATHWAYS.flatMap(({ side, position, rotationY, alongX }) => {
    if (!connectedSides.includes(side)) {
      return [{
        id: `pathway-outer-${side}`,
        assetId: "sidewalk-straight" as const,
        position: { x: position.x, y: 0, z: position.z },
        rotationY,
        scaleXZ: { x: 1.142, z: 0.3 },
      }];
    }
    // Two segments either side of the connector gap, which is centred on the block's centre line.
    const segmentLength = OUTER_PATHWAY_HALF - LINK_GAP_HALF_WIDTH;
    const segmentCentre = LINK_GAP_HALF_WIDTH + segmentLength / 2;
    return [-1, 1].map((end) => ({
      id: `pathway-outer-${side}-${end < 0 ? "a" : "b"}`,
      assetId: "sidewalk-straight" as const,
      position: {
        x: position.x + (alongX ? end * segmentCentre : 0),
        y: 0,
        z: position.z + (alongX ? 0 : end * segmentCentre),
      },
      rotationY,
      scaleXZ: { x: segmentLength / 50, z: 0.3 },
    }));
  });
}

/** One full city block (center street, ring road, 4 plot rows, shoreline-adjacent pathways),
 * built in local block-relative coordinates with unprefixed ids. */
function createLocalBlock(connectedSides: readonly BlockSide[]): { plots: CityPlot[]; entities: CityEntity[] } {
  const north = createPlotRow({
    idPrefix: "north",
    labelPrefix: "North plot",
    plotZ: -7.90,
    drivewayZ: -2.15,
    pointsPositiveZ: true,
  });
  const south = createPlotRow({
    idPrefix: "south",
    labelPrefix: "South plot",
    plotZ: 7.90,
    drivewayZ: 2.15,
    pointsPositiveZ: false,
  });
  const northOuter = createPlotRow({
    idPrefix: "north-outer",
    labelPrefix: "North Ring plot",
    plotZ: -18.00,
    drivewayZ: -23.65,
    pointsPositiveZ: false,
    pathwayZ: -23.35,
  });
  const southOuter = createPlotRow({
    idPrefix: "south-outer",
    labelPrefix: "South Ring plot",
    plotZ: 18.00,
    drivewayZ: 23.65,
    pointsPositiveZ: true,
    pathwayZ: 23.35,
  });

  const plots: CityPlot[] = [...north.plots, ...south.plots, ...northOuter.plots, ...southOuter.plots];

  const entities: CityEntity[] = [
    { id: "road-starter", assetId: "road-straight", position: { x: 0, y: 0, z: 0 } },
    { id: "pathway-center-north", assetId: "sidewalk-straight", position: { x: 0, y: 0, z: -2.45 }, scaleXZ: { x: 0.972, z: 0.3 } },
    { id: "pathway-center-south", assetId: "sidewalk-straight", position: { x: 0, y: 0, z: 2.45 }, rotationY: Math.PI, scaleXZ: { x: 0.972, z: 0.3 } },
    { id: "road-ring-north", assetId: "road-straight", position: { x: 0, y: 0, z: -25.80 }, scaleXZ: { x: 1.144, z: 1 } },
    { id: "road-ring-south", assetId: "road-straight", position: { x: 0, y: 0, z: 25.80 }, rotationY: Math.PI, scaleXZ: { x: 1.144, z: 1 } },
    { id: "road-ring-west", assetId: "road-straight", position: { x: -26.45, y: 0, z: 0 }, rotationY: Math.PI / 2, scaleXZ: { x: 1.118, z: 1 } },
    { id: "road-ring-east", assetId: "road-straight", position: { x: 26.45, y: 0, z: 0 }, rotationY: -Math.PI / 2, scaleXZ: { x: 1.118, z: 1 } },
    ...createBlockOuterPathways(connectedSides),
    ...createRowXConnectors("north", -8.20, 10.90),
    ...createRowXConnectors("south", 8.20, 10.90),
    ...createRowXConnectors("north-outer", -18.30, 10.70),
    ...createRowXConnectors("south-outer", 18.30, 10.70),
    ...north.entities,
    ...south.entities,
    ...northOuter.entities,
    ...southOuter.entities,
  ];

  return { plots, entities };
}

/** Instantiates a full city block at a given quadrant offset, with unique ids/labels and
 * plotId cross-references correctly remapped. */
function createCityBlock(blockId: string, streetId: string, streetName: string, offsetX: number, offsetZ: number): { plots: CityPlot[]; entities: CityEntity[] } {
  // The two sides facing the map centre are the ones an avenue runs past; the other two face
  // the shoreline and keep an unbroken pathway.
  const connectedSides: BlockSide[] = [offsetX < 0 ? "east" : "west", offsetZ < 0 ? "south" : "north"];
  const local = createLocalBlock(connectedSides);

  const canonicalPlot = (plot: CityPlot) => {
    const match = /^plot-(north|south|north-outer|south-outer)-(\d+)$/.exec(plot.id);
    if (!match) throw new Error(`Invalid local plot id: ${plot.id}`);
    const [, rowId, lot] = match;
    const lotNumber = lot.padStart(2, "0");
    const rowLabel = {
      north: "North",
      south: "South",
      "north-outer": "North Ring",
      "south-outer": "South Ring",
    }[rowId];
    return {
      id: `pioneer:${streetId}:${rowId}:${lotNumber}`,
      label: `Pioneer District · ${streetName} · ${rowLabel} Plot ${lotNumber}`,
    };
  };

  const plots: CityPlot[] = local.plots.map(canonicalPlot);

  const plotIdMap = new Map(local.plots.map((plot) => [plot.id, canonicalPlot(plot).id]));

  const entities: CityEntity[] = local.entities.map((entity) => ({
    ...entity,
    id: `${blockId}-${entity.id}`,
    position: { x: entity.position.x + offsetX, y: entity.position.y, z: entity.position.z + offsetZ },
    plotId: entity.plotId ? plotIdMap.get(entity.plotId) : entity.plotId,
  }));

  return { plots, entities };
}

/** Distance from the map centre to each block's centre, on both axes. */
const BLOCK_OFFSET = 40;
/** Outer faces of a block's ring road, measured from the block centre. */
const BLOCK_RING_OUTER_X = 28.6;
const BLOCK_RING_OUTER_Z = 27.95;

const nw = createCityBlock("nw", "jobs", "Jobs Avenue", -BLOCK_OFFSET, -BLOCK_OFFSET);
const ne = createCityBlock("ne", "lovelace", "Lovelace Lane", BLOCK_OFFSET, -BLOCK_OFFSET);
const sw = createCityBlock("sw", "turing", "Turing Street", -BLOCK_OFFSET, BLOCK_OFFSET);
const se = createCityBlock("se", "hopper", "Hopper Way", BLOCK_OFFSET, BLOCK_OFFSET);

/** The avenues fill the channels between blocks and meet at the central roundabout.
 * Arms stop just inside the ring's 9.5 outer radius so their straight ends tuck under the
 * curve instead of leaving gaps at the corners. */
const ROUNDABOUT_ARM_START = 8.4;
/** Paved edge of the merged island (block offset + a block's outermost pathway). */
const CITY_PAVED_HALF_X = 69.2;
const CITY_PAVED_HALF_Z = 68.55;

/** Palms are planted along each verge's centreline. Spacing leaves a gap between the ~3.2-radius
 * crowns, and the offsets keep them clear of the roundabout and the block edges. */
const PALM_SPACING = 18;
const PALM_START_OFFSET = 4.5;
const PALM_END_MARGIN = 2.3;
/** Verge grass tops out at ~0.107 (Y is never scaled), so this seats the trunk base in it. */
const PALM_GROUND_Y = 0.10;

/** Deterministic 0..1 from an integer seed. Integer math only — no Math.sin — so the value is
 * bit-identical on the server and in every browser, which matters because this module is
 * evaluated during SSR and any drift would be a hydration mismatch. */
function seededUnit(seed: number): number {
  return ((Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0) % 1000) / 1000;
}

/** Spins and sizes each palm slightly so a row does not read as clones. */
function palmVariation(seed: number): { rotationY: number; scale: number } {
  return {
    rotationY: seededUnit(seed) * Math.PI * 2,
    scale: 0.9 + seededUnit(seed + 101) * 0.2,
  };
}

/** One avenue arm: a double-width road, a flanking pathway each side, and a grass verge
 * each side running out to the neighbouring blocks' edges, planted with palms. */
function createAvenueArm(
  armId: string,
  /** true → runs along X (east/west arm); false → runs along Z (north/south arm) */
  alongX: boolean,
  /** -1 → the negative-axis arm, +1 → the positive-axis arm */
  direction: number,
): CityEntity[] {
  const farEdge = alongX ? CITY_PAVED_HALF_X : CITY_PAVED_HALF_Z;
  const length = farEdge - ROUNDABOUT_ARM_START;
  const centre = direction * (ROUNDABOUT_ARM_START + length / 2);
  // Verges reach out to the block edges, which sit closer in X than in Z.
  const vergeOuter = alongX ? 11.45 : 10.8;
  const vergeWidth = vergeOuter - 4.9;
  const vergeCentre = 4.9 + vergeWidth / 2;
  const rotationY = alongX ? undefined : direction * (Math.PI / 2);

  const at = (along: number, across: number) =>
    alongX ? { x: along, y: 0, z: across } : { x: across, y: 0, z: along };

  // A connector road crosses the pathway and verge on each side, level with the neighbouring
  // block's centre line, so both strips are split into two segments around a matching gap.
  const gapInner = BLOCK_OFFSET - LINK_GAP_HALF_WIDTH;
  const gapOuter = BLOCK_OFFSET + LINK_GAP_HALF_WIDTH;
  const strips: ReadonlyArray<{ id: string; from: number; to: number }> = [
    { id: "inner", from: ROUNDABOUT_ARM_START, to: gapInner },
    { id: "outer", from: gapOuter, to: farEdge },
  ];
  /** Outer face of the ring road the connector tees into, measured from the map centre. */
  const ringFace = BLOCK_OFFSET - (alongX ? BLOCK_RING_OUTER_Z : BLOCK_RING_OUTER_X);
  // Overshoot the avenue road and the ring road by 0.5 at each end so the joins read as merged.
  const linkNear = 4.3 - 0.5;
  const linkFar = ringFace + 0.5;

  return [
    {
      id: `avenue-${armId}-road`,
      assetId: "road-straight",
      position: at(centre, 0),
      rotationY,
      scaleXZ: { x: length / 50, z: 2 },
    },
    ...[-1, 1].flatMap((side) => strips.map((strip) => ({
      id: `avenue-${armId}-pathway-${side < 0 ? "a" : "b"}-${strip.id}`,
      assetId: "sidewalk-straight" as const,
      position: at(direction * ((strip.from + strip.to) / 2), side * 4.6),
      rotationY,
      scaleXZ: { x: (strip.to - strip.from) / 50, z: 0.3 },
    }))),
    ...[-1, 1].flatMap((side) => strips.map((strip) => ({
      id: `avenue-${armId}-verge-${side < 0 ? "a" : "b"}-${strip.id}`,
      assetId: "grass-plot" as const,
      position: at(direction * ((strip.from + strip.to) / 2), side * vergeCentre),
      rotationY,
      scaleXZ: { x: (strip.to - strip.from) / 11.4, z: vergeWidth / 10.3 },
    }))),
    // Runs perpendicular to the arm, so it takes the opposite rotation. Left at y=0 like every
    // other road: it overlaps the avenue and the ring road, but both are the same asphalt at the
    // same height, so the overlap is invisible — exactly how the block's own streets already meet
    // their ring road. Raising it instead would put a visible lip across both junctions.
    ...[-1, 1].map((side) => ({
      id: `avenue-${armId}-link-${side < 0 ? "a" : "b"}`,
      assetId: "road-link" as const,
      position: at(direction * BLOCK_OFFSET, side * ((linkNear + linkFar) / 2)),
      rotationY: alongX ? Math.PI / 2 : undefined,
      scaleXZ: { x: (linkFar - linkNear) / 10, z: 1 },
    })),
    ...[-1, 1].flatMap((side) => {
      // Pick a count from the target spacing, then distribute evenly across the span. Arms differ
      // slightly in length, so even distribution keeps every arm's end margin matching (and avoids
      // accumulating float drift that could drop the last palm).
      const firstAlong = ROUNDABOUT_ARM_START + PALM_START_OFFSET;
      const lastAlong = farEdge - PALM_END_MARGIN;
      const gaps = Math.max(1, Math.round((lastAlong - firstAlong) / PALM_SPACING));
      return Array.from({ length: gaps + 1 }, (_, index) => {
        const along = firstAlong + ((lastAlong - firstAlong) * index) / gaps;
        const { rotationY: spin, scale } = palmVariation(armId.charCodeAt(0) * 1000 + (side + 1) * 100 + index);
        return {
          id: `avenue-${armId}-palm-${side < 0 ? "a" : "b"}-${index}`,
          assetId: "palm-tree" as const,
          position: { ...at(direction * along, side * vergeCentre), y: PALM_GROUND_Y },
          rotationY: spin,
          scale,
        };
      });
    }),
  ];
}

const cityCentre: CityDistrict["entities"] = [
  // Single merged ground plate (native 50 x 30), sized so the shoreline overhangs its edge
  // by the same small margin each per-block plate used to.
  { id: "map-base", assetId: "map-base", position: { x: 0, y: 0, z: 0 }, scaleXZ: { x: 2.7888, z: 4.6047 } },
  { id: "roundabout", assetId: "roundabout", position: { x: 0, y: 0, z: 0 } },
  // Seated 0.01 into the island's 0.19 grass surface so the pad has no floating gap.
  { id: "launch-monument", assetId: "launch-monument", position: { x: 0, y: 0.18, z: 0 } },
  // Authored in world coordinates around the origin: its pillars land in the four diagonal
  // pockets between the ring and the avenue arms, so it must not be moved, scaled or rotated.
  { id: "district-sign-gantry", assetId: "district-sign-gantry", position: { x: 0, y: 0, z: 0 } },
  ...createAvenueArm("west", true, -1),
  ...createAvenueArm("east", true, 1),
  ...createAvenueArm("north", false, -1),
  ...createAvenueArm("south", false, 1),
];

const plots: CityDistrict["plots"] = [...nw.plots, ...ne.plots, ...sw.plots, ...se.plots];
const entities: CityDistrict["entities"] = [
  ...cityCentre,
  ...nw.entities,
  ...ne.entities,
  ...sw.entities,
  ...se.entities,
];

export const starterDistrict: CityDistrict = {
  id: "pioneer",
  name: "Pioneer District",
  plots,
  entities,
};
