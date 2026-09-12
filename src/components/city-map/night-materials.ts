import * as THREE from "three";
import { NIGHT_EMISSIVE_MATERIALS } from "./city-assets";

/** Turning the city's lights on, one material at a time.
 *
 * THE PROBLEM THIS SOLVES IS SHARING. `useGLTF` caches one parsed glb per asset and `ModelInstance`
 * clones the scene out of it -- but a three.js clone shares materials with what it was cloned from.
 * That sharing is doing real work here: eighteen street lamps are eighteen meshes pointing at one
 * material, and sixty-four buildings of the same type likewise. Write an emissive value onto one of
 * them and all eighteen light up, for free.
 *
 * It also means writing onto one reaches further than the map. The claim modal's preview stage
 * renders out of the same cache, and it is a shop window that must look the same at every hour --
 * a founder choosing a building at 3am should not be shown three dark boxes. So nothing here ever
 * touches a cached material. Each lit surface gets exactly one clone per asset, shared by every
 * instance of that asset on the map, and the cache is left as it was loaded. Eighteen lamps still
 * cost one material; the previews still get the daylight one.
 *
 * A clone costs no extra draw call. It is the same shader program with different uniforms, on
 * meshes that were already drawn separately. */

interface NightMaterial {
  material: THREE.MeshStandardMaterial;
  dayIntensity: number;
  nightIntensity: number;
  dayColor: THREE.Color;
  nightColor: THREE.Color;
}

/** One clone per asset per material name. Keyed by both because two assets can ship a material of
 * the same name with different values, and because a lamp's globe should not be sharing a uniform
 * with a garage's work light. */
const clones = new Map<string, THREE.MeshStandardMaterial>();

/** Every material the blend drives. Holds the shared clones above for the life of the page -- there
 * are a few dozen, they are reused by every instance, and rebuilding one costs more than keeping
 * it -- plus any per-instance materials registered below, which do come and go. */
const driven = new Set<NightMaterial>();

/** Last blend written, so a frame that changes nothing costs one comparison instead of a walk. */
let applied = -1;

function entryFor(
  material: THREE.MeshStandardMaterial,
  boost: number,
  nightColor: string | undefined,
): NightMaterial {
  return {
    material,
    dayIntensity: material.emissiveIntensity,
    nightIntensity: material.emissiveIntensity * boost,
    dayColor: material.emissive.clone(),
    nightColor: nightColor ? new THREE.Color(nightColor) : material.emissive.clone(),
  };
}

/** The night-driven stand-in for a material, or null if this one does not light up.
 *
 * Call it while cloning a scene and swap the result in where it is not null. Returns the same
 * instance for every mesh in the city wearing that material on that asset. */
export function nightLitMaterial(
  assetId: string,
  material: THREE.Material | THREE.Material[],
): THREE.MeshStandardMaterial | null {
  if (Array.isArray(material) || !(material instanceof THREE.MeshStandardMaterial)) return null;
  const config = NIGHT_EMISSIVE_MATERIALS[material.name];
  if (!config) return null;

  const key = `${assetId}:${material.name}`;
  const existing = clones.get(key);
  if (existing) return existing;

  const clone = material.clone();
  clones.set(key, clone);
  const entry = entryFor(clone, config.boost, config.nightColor);
  driven.add(entry);
  // Start where the city currently is rather than at noon: a building that arrives after dark --
  // someone claiming a plot at midnight -- would otherwise render one frame with its lights off.
  writeBlend(entry, applied < 0 ? 0 : applied);
  return clone;
}

/** Puts a material that is NOT shared under the same control, and takes it back out again.
 *
 * For the founder billboards, whose faces are cloned one per board to carry the painted card. The
 * returned disposer matters here in a way it does not for the shared clones above: boards come and
 * go as the city is claimed and refreshed, and a set that only ever grows would pin every board a
 * visitor has ever seen in memory. */
export function registerNightMaterial(
  material: THREE.MeshStandardMaterial,
  boost: number,
  nightColor?: string,
): () => void {
  const entry = entryFor(material, boost, nightColor);
  driven.add(entry);
  writeBlend(entry, applied < 0 ? 0 : applied);
  return () => {
    driven.delete(entry);
  };
}

function writeBlend(entry: NightMaterial, blend: number): void {
  entry.material.emissiveIntensity = entry.dayIntensity
    + (entry.nightIntensity - entry.dayIntensity) * blend;
  entry.material.emissive.lerpColors(entry.dayColor, entry.nightColor, blend);
  // Neither of those is a shader define -- both are plain uniforms -- so there is deliberately no
  // `needsUpdate` here. Setting it would recompile every lit material on the map, every frame.
}

/** Drives the whole city to a point in the cycle. Called once a frame. */
export function applyNightBlend(blend: number): void {
  if (Math.abs(blend - applied) < 0.0005) return;
  applied = blend;
  for (const entry of driven) writeBlend(entry, blend);
}

/** Test seam. The two module-level collections outlive any one scene by design, which is wrong in
 * a test file where each case builds its own city. */
export function resetNightMaterials(): void {
  clones.clear();
  driven.clear();
  applied = -1;
}
