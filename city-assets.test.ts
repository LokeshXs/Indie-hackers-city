import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BILLBOARD_FACE_MATERIAL,
  CAR_ASSET_PATH,
  CITY_ASSET_PATHS,
  NIGHT_EMISSIVE_MATERIALS,
  PEDESTRIAN_ASSET_PATH,
  PET_DOG_ASSET_PATH,
  PET_DOG_PARTS,
} from "./src/components/city-map/city-assets";
import { BUILDING_LAWN_BANDS } from "./src/components/city-map/city-assets";
import { PET_DEPTH_CLEARANCE, PET_SCALE, PET_SIDE_CLEARANCE } from "./src/components/city-map/pet-dog";
import { PLOT_BUILDING_SCALE } from "./src/components/city-map/plot-builds";

/** Every material name inside a .glb.
 *
 * A GLB is a 12-byte header followed by length-prefixed chunks, the first of which is always the
 * glTF JSON. Reading it directly rather than through a loader keeps this test free of three.js and
 * of a WebGL context, neither of which exists in jsdom. */
interface Gltf {
  materials?: Array<{ name?: string }>;
  nodes?: Array<{ name?: string; children?: number[]; mesh?: number; translation?: number[] }>;
  meshes?: Array<{ primitives: Array<{ attributes: Record<string, number> }> }>;
  accessors?: Array<{ min?: number[]; max?: number[] }>;
}

async function gltfJson(assetPath: string): Promise<Gltf> {
  const file = await readFile(join(process.cwd(), "public", assetPath.replace(/^\//, "")));
  expect(file.toString("utf8", 0, 4)).toBe("glTF");
  const chunkLength = file.readUInt32LE(12);
  const chunkType = file.toString("utf8", 16, 20);
  expect(chunkType.trim()).toBe("JSON");
  return JSON.parse(file.toString("utf8", 20, 20 + chunkLength));
}

async function materialNames(assetPath: string): Promise<string[]> {
  const gltf = await gltfJson(assetPath);
  return (gltf.materials ?? []).flatMap((material) => (material.name ? [material.name] : []));
}

describe("3D city asset kit", () => {
  it("ships every retained map model as a non-empty GLB asset", async () => {
    // The two moving models are checked alongside the placed ones even though they are not in
    // CITY_ASSET_PATHS: they are kept out of that record because a route puts them on the map
    // rather than an entity, which is a reason not to give them an assetId and no reason at all
    // to stop checking that they ship.
    const assets = [...Object.values(CITY_ASSET_PATHS), PEDESTRIAN_ASSET_PATH, CAR_ASSET_PATH, PET_DOG_ASSET_PATH];
    await Promise.all(assets.map(async (assetPath) => {
      const path = join(process.cwd(), "public", assetPath.replace(/^\//, ""));
      await access(path);
      expect((await stat(path)).size).toBeGreaterThan(1000);
    }));
  });

  // The night lighting is wired to materials BY NAME, and a name that matches nothing is silent:
  // the city simply renders one dark building in a lit street, with no error anywhere. These two
  // cases are what turn that into a failing test instead of a bug report.
  it("names only materials that the shipped models actually carry", async () => {
    const assets = [...Object.values(CITY_ASSET_PATHS), CAR_ASSET_PATH];
    const shipped = new Set((await Promise.all(assets.map(materialNames))).flat());

    const missing = Object.keys(NIGHT_EMISSIVE_MATERIALS).filter((name) => !shipped.has(name));
    expect(missing).toEqual([]);
    expect(shipped.has(BILLBOARD_FACE_MATERIAL)).toBe(true);
  });

  it("lights something on every building and landmark the city places", async () => {
    // A plot shell with no lit surface is a house with its lights off in a lit street, and an
    // unlit landmark is a hole in the middle of the map. The billboard is exempt: its face is lit
    // per board at runtime, from the founder's own card.
    for (const assetId of [
      "startup-building-level-1",
      "corner-studio-level-1",
      "indie-garage-level-1",
      "slat-studio-level-2",
      "teal-brow-level-2",
      "coffee-shop",
      "street-lamp",
      "cafe-lamp",
      "launch-monument",
      "district-sign-gantry",
    ] as const) {
      const names = await materialNames(CITY_ASSET_PATHS[assetId]);
      expect(
        names.filter((name) => name in NIGHT_EMISSIVE_MATERIALS),
        `${assetId} has no night-lit material`,
      ).not.toEqual([]);
    }
  });

  // The dog is posed by node name, and a name that matches nothing is just as silent as a missing
  // night material: getObjectByName returns undefined, buildDog bails, and the lawn is simply
  // empty. Nothing errors, nothing logs, and the founder's reward never appears.
  it("ships every node the dog is posed by, with the head and ears parented to carry a sit", async () => {
    const gltf = await gltfJson(PET_DOG_ASSET_PATH);
    const nodes = gltf.nodes ?? [];
    const names = nodes.flatMap((node) => (node.name ? [node.name] : []));
    expect(PET_DOG_PARTS.filter((part) => !names.includes(part))).toEqual([]);

    // The hierarchy is what makes a sit one rotation instead of four kept in agreement: the body
    // pitches up and takes the head, ears and tail with it. The four legs must NOT be children —
    // they stay planted while the chest rises.
    const childrenOf = (name: string) =>
      (nodes.find((node) => node.name === name)?.children ?? []).map((index) => nodes[index]?.name);
    expect(childrenOf("dog_body").sort()).toEqual(["dog_head", "dog_tail"]);
    expect(childrenOf("dog_head").sort()).toEqual(["dog_ear_left", "dog_ear_right"]);
    for (const leg of PET_DOG_PARTS.filter((part) => part.startsWith("dog_leg_"))) {
      expect(childrenOf(leg), leg).toEqual([]);
    }
  });

  // THE TEST THAT DECIDES WHERE THE DOG MAY WALK.
  //
  // The lawn band in pet-dog.ts is a handful of numbers, and nothing about them is self-evidently
  // right: get `near` wrong and a dog spends part of its lap inside a doorstep, on one shell, at
  // one end of its loop, with no error anywhere. It is checked here rather than beside the band
  // itself because only the shipped .glb files can answer it.
  //
  // Reading the frontage off the build scripts is what got it wrong the first time. The piece of a
  // shell that reaches furthest toward the road is usually a CANOPY -- the startup and corner
  // studio awnings overhang to f = 3.41 and f = 4.42, both of them 3.7 units up with nothing
  // underneath -- so the honest question is not how far the building reaches but how far it
  // reaches WITHIN THE DOG'S OWN HEIGHT.
  it("leaves each shell's lawn band clear of that shell, at the dog's own height", async () => {
    // Plot-local, with +f toward the road. The building sits 1.24 back from the pad centre at
    // PLOT_BUILDING_SCALE, and its front is its -z face -- see getBuildingPlacement.
    const BUILDING_OFFSET = -1.24;
    // The dog as it is actually drawn. Anything whose underside clears its back is a canopy it
    // walks beneath -- which is most of what reaches furthest forward on these shells.
    const DOG_HEIGHT = 0.52 * PET_SCALE;

    for (const assetId of Object.keys(BUILDING_LAWN_BANDS) as Array<keyof typeof BUILDING_LAWN_BANDS>) {
      const band = BUILDING_LAWN_BANDS[assetId];
      const gltf = await gltfJson(CITY_ASSET_PATHS[assetId]);
      for (const node of gltf.nodes ?? []) {
        if (node.mesh === undefined) continue;
        const [tx = 0, ty = 0, tz = 0] = node.translation ?? [];
        for (const primitive of gltf.meshes?.[node.mesh]?.primitives ?? []) {
          const accessor = gltf.accessors?.[primitive.attributes.POSITION];
          if (!accessor?.min || !accessor.max) continue;
          if ((accessor.min[1] + ty) * PLOT_BUILDING_SCALE >= DOG_HEIGHT) continue;
          const front = BUILDING_OFFSET + PLOT_BUILDING_SCALE * -(accessor.min[2] + tz);
          if (front <= band.near - PET_DEPTH_CLEARANCE) continue;
          // It reaches into the band's depth, so it has to miss the band sideways instead. The
          // corner studio's entry step is the real case: it blocks half that shell's frontage,
          // which is why its band alone does not span the full width of the plot.
          const left = (accessor.min[0] + tx) * PLOT_BUILDING_SCALE;
          const right = (accessor.max[0] + tx) * PLOT_BUILDING_SCALE;
          // Building-local +x is plot-local -side on every row: the pad and the building are
          // always turned a half-turn apart, on both the rows that face +z and the ones facing -z.
          const [sideLow, sideHigh] = [-right, -left];
          const clears = sideHigh <= band.sideMin - PET_SIDE_CLEARANCE
            || sideLow >= band.sideMax + PET_SIDE_CLEARANCE;
          expect(
            clears,
            `${assetId}: "${node.name}" reaches f=${front.toFixed(2)} at dog height across `
              + `side ${sideLow.toFixed(2)}..${sideHigh.toFixed(2)}, inside that shell's lawn band`,
          ).toBe(true);
        }
      }
    }
  });

  it("keeps editable Blender sources for the base and straight road", async () => {
    for (const source of [
      "artwork/3d/v3/map-base.blend",
      "artwork/3d/v3/road-straight.blend",
      "artwork/3d/v3/sidewalk-straight.blend",
      "artwork/3d/v3/grass-plot.blend",
      "artwork/3d/v3/driveway-straight.blend",
      "artwork/3d/v3/roundabout.blend",
      "artwork/3d/v3/road-link.blend",
      "artwork/3d/v3/landmarks/launch-monument.blend",
      "artwork/3d/v3/landmarks/district-sign-gantry.blend",
      "artwork/3d/v3/trees/palm-tree.blend",
      "artwork/3d/v3/trees/canopy-tree.blend",
      "artwork/3d/v3/props/street-lamp.blend",
      "artwork/3d/v3/props/cafe-lamp.blend",
      "artwork/3d/v3/props/billboard.blend",
      "artwork/3d/v3/props/pedestrian.blend",
      "artwork/3d/v3/props/pet-dog.blend",
      "artwork/3d/v3/vehicles/car.blend",
      "artwork/3d/v3/startup-building-level-1.blend",
      "artwork/3d/v3/corner-studio-level-1.blend",
      "artwork/3d/v3/indie-garage-level-1.blend",
      "artwork/3d/v3/level2/slat-studio-level-2.blend",
      "artwork/3d/v3/level2/teal-brow-level-2.blend",
    ]) {
      const path = join(process.cwd(), source);
      await access(path);
      expect((await stat(path)).size).toBeGreaterThan(1000);
    }
  });
});
