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
import { useNightBlend } from "./TimeOfDay";
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
  return group;
}

export const Cars = memo(function Cars({ entities }: { entities: readonly CityEntity[] }) {
  const { scene } = useGLTF(CAR_ASSET_PATH);
  const stillness = usePrefersReducedMotion();
  const nightAware = useNightBlend() !== null;

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
