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
    status: "available" as const,
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

/** One full city block (center street, ring road, 4 plot rows, shoreline-adjacent pathways),
 * built in local block-relative coordinates with unprefixed ids. */
function createLocalBlock(): { plots: CityPlot[]; entities: CityEntity[] } {
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
    { id: "map-base", assetId: "map-base", position: { x: 0, y: 0, z: 0 }, scaleXZ: { x: 1.1888, z: 1.9380 } },
    { id: "road-starter", assetId: "road-straight", position: { x: 0, y: 0, z: 0 } },
    { id: "pathway-center-north", assetId: "sidewalk-straight", position: { x: 0, y: 0, z: -2.45 }, scaleXZ: { x: 0.972, z: 0.3 } },
    { id: "pathway-center-south", assetId: "sidewalk-straight", position: { x: 0, y: 0, z: 2.45 }, rotationY: Math.PI, scaleXZ: { x: 0.972, z: 0.3 } },
    { id: "road-ring-north", assetId: "road-straight", position: { x: 0, y: 0, z: -25.80 }, scaleXZ: { x: 1.144, z: 1 } },
    { id: "road-ring-south", assetId: "road-straight", position: { x: 0, y: 0, z: 25.80 }, rotationY: Math.PI, scaleXZ: { x: 1.144, z: 1 } },
    { id: "road-ring-west", assetId: "road-straight", position: { x: -26.45, y: 0, z: 0 }, rotationY: Math.PI / 2, scaleXZ: { x: 1.118, z: 1 } },
    { id: "road-ring-east", assetId: "road-straight", position: { x: 26.45, y: 0, z: 0 }, rotationY: -Math.PI / 2, scaleXZ: { x: 1.118, z: 1 } },
    { id: "pathway-outer-north", assetId: "sidewalk-straight", position: { x: 0, y: 0, z: -28.25 }, scaleXZ: { x: 1.142, z: 0.3 } },
    { id: "pathway-outer-south", assetId: "sidewalk-straight", position: { x: 0, y: 0, z: 28.25 }, rotationY: Math.PI, scaleXZ: { x: 1.142, z: 0.3 } },
    { id: "pathway-outer-west", assetId: "sidewalk-straight", position: { x: -28.9, y: 0, z: 0 }, rotationY: Math.PI / 2, scaleXZ: { x: 1.142, z: 0.3 } },
    { id: "pathway-outer-east", assetId: "sidewalk-straight", position: { x: 28.9, y: 0, z: 0 }, rotationY: -Math.PI / 2, scaleXZ: { x: 1.142, z: 0.3 } },
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
function createCityBlock(blockId: string, blockLabel: string, offsetX: number, offsetZ: number): { plots: CityPlot[]; entities: CityEntity[] } {
  const local = createLocalBlock();

  const plots: CityPlot[] = local.plots.map((plot) => ({
    ...plot,
    id: `${blockId}-${plot.id}`,
    label: `${blockLabel} ${plot.label}`,
  }));

  const plotIdMap = new Map(local.plots.map((plot) => [plot.id, `${blockId}-${plot.id}`]));

  const entities: CityEntity[] = local.entities.map((entity) => ({
    ...entity,
    id: `${blockId}-${entity.id}`,
    position: { x: entity.position.x + offsetX, y: entity.position.y, z: entity.position.z + offsetZ },
    plotId: entity.plotId ? plotIdMap.get(entity.plotId) : entity.plotId,
  }));

  return { plots, entities };
}

const nw = createCityBlock("nw", "Northwest", -40, -40);
const ne = createCityBlock("ne", "Northeast", 40, -40);
const sw = createCityBlock("sw", "Southwest", -40, 40);
const se = createCityBlock("se", "Southeast", 40, 40);

const plots: CityDistrict["plots"] = [...nw.plots, ...ne.plots, ...sw.plots, ...se.plots];
const entities: CityDistrict["entities"] = [...nw.entities, ...ne.entities, ...sw.entities, ...se.entities];

export const starterDistrict: CityDistrict = {
  id: "founders-crossing",
  name: "Founders Crossing",
  plots,
  entities,
};
