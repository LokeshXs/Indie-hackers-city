"use client";

import { memo, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import type { CityEntity } from "./map-types";
import { CAR_ASSET_PATH, CAR_VARIANTS } from "./city-assets";
import { ROAD_Y, carRoutes } from "./car-routes";
import { nightLitMaterial } from "./night-materials";
import { NEUTRAL_GLOW_STOPS, radialGlowTexture, useNightBlend } from "./TimeOfDay";
import { pointAt, type Route } from "./routes";

/** How many cars are on the map at once -- the one dial for how busy the district feels. */
const CAR_COUNT = 6;

/** Share `total` cars out between circuits in proportion to how long each one is.
 *
 * The circuits are nothing like the same size -- a block half is 144 units round and the avenue
 * lap is 513 -- so an even split would make the blocks busy and the avenues deserted. A share is
 * rarely a whole number of cars, and the leftovers go to the circuits that lost the most to
 * rounding, which is what makes the total come out at exactly `total` rather than near it.
 *
 * BELOW ONE CAR PER CIRCUIT THIS LEAVES SOME EMPTY, and that is the honest answer: six cars cannot
 * cover nine circuits. Which ones stay empty is decided by the order carRoutes lists them in, and
 * that order is chosen so the ones that get a car are spread across all four blocks. */
function allocate(lengths: readonly number[], total: number): number[] {
  const span = lengths.reduce((sum, length) => sum + length, 0);
  const shares = lengths.map((length) => (length * total) / span);
  const cars = shares.map((share) => Math.floor(share));
  const spare = total - cars.reduce((sum, count) => sum + count, 0);
  shares
    // Rounded before comparing, and that rounding is doing real work rather than being tidy. The
    // eight block circuits are the same length, but only to about twelve decimal places -- each is
    // summed from its own chain of arc points, so they differ in the last bits. Compared raw, that
    // noise outranks the tie-break below and hands both of one block's circuits a car while
    // another block gets none. Rounded, equal-length circuits tie exactly and order decides.
    .map((share, index) => ({ index, remainder: Math.round((share % 1) * 1e9) / 1e9 }))
    // Ties broken by list order rather than left to sort stability, because on these circuits it
    // is ALWAYS a tie: eight block halves the same length, competing for whatever the avenues
    // leave over. carRoutes lists them so that order spreads the cars across all four blocks.
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
    .slice(0, spare)
    .forEach(({ index }) => { cars[index] += 1; });
  return cars;
}

/** World units per second. 6.2 is about 21 km/h at 1.0584 units to the metre -- town speed, and
 * deliberately only four and a half times the pedestrians' pace, because the two are on screen
 * together and a car doing a realistic 50 would streak across the block between glances. */
const BASE_SPEED = 6.2;
const SPEED_SPREAD = 0.9;

/** Deterministic 0..1 from an integer seed. Integer math only, matching map-data's own generator,
 * so a car's colour, speed and starting point are the same on every machine and every reload
 * rather than shuffling under the viewer each time they open the map. */
function seededUnit(seed: number): number {
  return ((Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0) % 1000) / 1000;
}

interface Car {
  route: Route;
  speed: number;
  /** Where on the circuit this car starts, in units travelled. */
  start: number;
  group: THREE.Group;
}

/** One colourway lifted out of the shared glb, as a template to clone per car.
 *
 * The clone is parented to a fresh group rather than driven directly, because the mesh carries the
 * glb's own Z-up-to-Y-up transform: setting rotation.y on it would throw that away and lay every
 * car on its side. The group is what the route turns.
 *
 * clone() copies transforms and shares geometry and materials with the cached GLTF, which is what
 * keeps a city's worth of traffic off the GPU's budget: it is four cars drawn many times, not many
 * cars. Nothing here mutates a material, so the sharing is safe. */
/** The light a car lays on the road, in world units.
 *
 * A lit lens is a car with its headlights on; a lit road is a car with its headlights on at night.
 * The lenses have been coming up since the cycle landed -- this is the half that was missing, and
 * with six cars circling an otherwise dark district it is most of what makes the roads read as
 * roads after dark.
 *
 * FORWARD IS -Z. Every model in the kit faces -z at rotation zero, which is what routes.ts turns
 * the cars by, so the beam goes out ahead at a negative offset and the tail wash sits behind at a
 * positive one. Both lie flat just clear of the deck: the group rides at ROAD_Y, so local zero is
 * already the road surface and this is the margin that keeps them out of it. */
const BEAM_WIDTH = 3.6;
const BEAM_LENGTH = 7.2;
const BEAM_FORWARD = -4.1;
const TAIL_WIDTH = 2.5;
const TAIL_LENGTH = 3.2;
const TAIL_BACK = 3.0;
const GLOW_Y = 0.02;

/** Opacity at full night. The beam is the brighter by some way — a tail lamp washes the road behind
 * it, it does not light it. */
const BEAM_OPACITY = 0.62;
const TAIL_OPACITY = 0.3;

interface CarGlowAssets {
  beam: THREE.MeshBasicMaterial;
  tail: THREE.MeshBasicMaterial;
  plane: THREE.PlaneGeometry;
}

/** `undefined` is "not built yet"; `null` is "this browser has no canvas to build it from". */
let carGlowAssets: CarGlowAssets | null | undefined;

/** One texture, two tinted materials and one quad, shared by every car on the map.
 *
 * Shared is what makes fading them affordable: however many cars the district grows to, night is
 * two property writes a frame. Module state rather than a hook for the same reasons the lamps' glow
 * is -- see getLampGlowAssets, which this mirrors. */
function getCarGlowAssets(): CarGlowAssets | null {
  if (carGlowAssets !== undefined) return carGlowAssets;

  const map = radialGlowTexture(NEUTRAL_GLOW_STOPS);
  const wash = (color: string, opacity: number) => new THREE.MeshBasicMaterial({
    map,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    // Never occludes, and never writes depth: six of these sliding over the roads would otherwise
    // punch holes in the kerbs and each other.
    depthWrite: false,
    toneMapped: false,
  });

  carGlowAssets = map
    ? { beam: wash("#ffeccb", 0), tail: wash("#ff3418", 0), plane: new THREE.PlaneGeometry(1, 1) }
    : null;
  return carGlowAssets;
}

/** Lays one wash flat on the road at `z`, in the car's own frame. */
function roadWash(
  assets: CarGlowAssets,
  material: THREE.MeshBasicMaterial,
  z: number,
  width: number,
  length: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(assets.plane, material);
  // Laid down flat, which turns the quad's own y axis into the road's z.
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, GLOW_Y, z);
  mesh.scale.set(width, length, 1);
  // After the road and the kerbs, so an additive quad blends over them rather than under.
  mesh.renderOrder = 1;
  mesh.raycast = () => undefined;
  return mesh;
}

function variantTemplate(scene: THREE.Object3D, variant: number, nightAware: boolean): THREE.Group | null {
  const source = scene.getObjectByName(`car_${variant}`);
  if (!source) return null;
  const group = new THREE.Group();
  const copy = source.clone(true);
  copy.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    // Cars take shadows but do not throw them, exactly as the pedestrians do not. Every caster is
    // re-rendered into the shadow map and these are among the only things on the map that move
    // every frame; the sun's default shadow camera reaches +-5 anyway, so all but the handful of
    // cars nearest the monument are outside it and toggling this would change nothing for them.
    object.castShadow = false;
    object.receiveShadow = true;
    // The lamps the glb already carries -- build-car.py models a headlight and a taillight on every
    // colourway and gives both a little emission, so they read at noon. After dark the same two
    // materials are turned up, and they become the only moving lights in the district. All four
    // colourways share them, so this is two materials for the whole of the traffic.
    if (nightAware) {
      const lit = nightLitMaterial("car", object.material);
      if (lit) object.material = lit;
    }
  });
  group.add(copy);

  const glow = nightAware ? getCarGlowAssets() : null;
  if (glow) {
    group.add(roadWash(glow, glow.beam, BEAM_FORWARD, BEAM_WIDTH, BEAM_LENGTH));
    group.add(roadWash(glow, glow.tail, TAIL_BACK, TAIL_WIDTH, TAIL_LENGTH));
  }
  return group;
}

export const Cars = memo(function Cars({ entities }: { entities: readonly CityEntity[] }) {
  const { scene } = useGLTF(CAR_ASSET_PATH);
  const stillness = usePrefersReducedMotion();
  const blend = useNightBlend();
  const nightAware = blend !== null;

  const cars = useMemo<Car[]>(() => {
    const routes = carRoutes(entities);
    const traffic = allocate(routes.map((route) => route.length), CAR_COUNT);
    const templates = Array.from({ length: CAR_VARIANTS },
      (_, variant) => variantTemplate(scene, variant, nightAware));
    const built: Car[] = [];
    routes.forEach((route, routeIndex) => {
      const share = traffic[routeIndex];
      for (let index = 0; index < share; index += 1) {
        const seed = routeIndex * 37 + index;
        const template = templates[Math.floor(seededUnit(seed) * CAR_VARIANTS) % CAR_VARIANTS];
        if (!template) continue;
        built.push({
          route,
          // Spread so no two on a circuit hold station, and so the group does not pulse.
          speed: BASE_SPEED + (seededUnit(seed + 401) - 0.5) * 2 * SPEED_SPREAD,
          start: (route.length * index) / share
            + seededUnit(seed + 907) * (route.length / share) * 0.6,
          group: template.clone(true),
        });
      }
    });
    return built;
  }, [entities, nightAware, scene]);

  useFrame(({ clock }) => {
    // Fetched here rather than closed over from the render, so this stays a write to module state
    // rather than to something captured out of a render pass.
    const glow = getCarGlowAssets();
    if (glow) {
      const night = blend?.current ?? 0;
      glow.beam.opacity = BEAM_OPACITY * night;
      glow.tail.opacity = TAIL_OPACITY * night;
      // Nothing to draw by day, and a transparent quad still costs a draw call and a blend.
      glow.beam.visible = night > 0.002;
      glow.tail.visible = night > 0.002;
    }

    const elapsed = stillness ? 0 : clock.elapsedTime;
    for (const car of cars) {
      const { x, z, heading } = pointAt(car.route, car.start + elapsed * car.speed);
      car.group.position.set(x, ROAD_Y, z);
      car.group.rotation.y = heading;
    }
  });

  return (
    <group name="cars">
      {cars.map((car, index) => (
        <primitive key={`${car.route.id}-${index}`} object={car.group} />
      ))}
    </group>
  );
});
