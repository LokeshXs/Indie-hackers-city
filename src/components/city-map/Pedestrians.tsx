"use client";

import { memo, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import type { CityEntity } from "./map-types";
import { PEDESTRIAN_ASSET_PATH, PEDESTRIAN_PARTS, PEDESTRIAN_VARIANTS } from "./city-assets";
import { PAVEMENT_Y, pedestrianRoutes } from "./pedestrian-routes";
import { pointAt, type Route } from "./routes";

/** Walkers on each circuit. Three is what a block's streets carry without reading as a crowd:
 * the interior loops are 138 units round, so three walkers sit about 46 apart and the default
 * camera -- which frames roughly 100 units -- has one or two of them in view at a time. */
const WALKERS_PER_ROUTE = 3;

/** Metres per second, in world units. A comfortable 1.3 m/s at 1.0584 units to the metre. */
const BASE_SPEED = 1.38;
const SPEED_SPREAD = 0.22;

/** Distance covered by one full stride cycle -- left step and right step together.
 *
 * The swing is driven by DISTANCE rather than by time, which is the only way the feet stay
 * planted: a walker given a slower speed but the same cadence would skate, and the eye reads that
 * long before it reads the pose. Tie the phase to how far they have actually come and a fast
 * walker simply takes more steps over the same ground. */
const STRIDE_CYCLE = 1.59;
const LEG_SWING = 0.38;   // radians, about 22 degrees
const ARM_SWING = 0.25;
/** The body rises on each mid-stride, twice per cycle -- small, because at this size a bob big
 * enough to see clearly reads as a limp. */
const BOB_HEIGHT = 0.022;

/** Deterministic 0..1 from an integer seed. Integer math only, matching map-data's own generator,
 * so a walker's colour, speed and starting point are the same on every machine and every reload
 * rather than shuffling under the viewer each time they open the map. */
function seededUnit(seed: number): number {
  return ((Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) >>> 0) % 1000) / 1000;
}

interface Walker {
  route: Route;
  speed: number;
  /** Where on the circuit this walker starts, in units travelled. */
  start: number;
  group: THREE.Group;
  legLeft: THREE.Object3D;
  legRight: THREE.Object3D;
  armLeft: THREE.Object3D;
  armRight: THREE.Object3D;
}

/** One colourway lifted out of the shared glb, as a template to clone per walker.
 *
 * clone() copies the transforms and shares geometry and materials with the cached GLTF, which is
 * what keeps thirty-odd walkers off the GPU's budget: they are the same six meshes drawn many
 * times, not many meshes. Nothing here mutates a material, so the sharing is safe. */
function variantTemplate(scene: THREE.Object3D, variant: number): THREE.Group | null {
  const group = new THREE.Group();
  for (const part of PEDESTRIAN_PARTS) {
    const source = scene.getObjectByName(`pedestrian_${variant}_${part}`);
    if (!source) return null;
    const copy = source.clone(true);
    copy.name = part;
    group.add(copy);
  }
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    // Walkers take shadows but do not throw them, the way the trees and street lamps already
    // do not. Every caster has to be re-rendered into the shadow map, and these are the only
    // things on the map that move every frame; at the size a pedestrian occupies on screen the
    // shadow it would cast is a couple of pixels.
    object.castShadow = false;
    object.receiveShadow = true;
  });
  return group;
}

export const Pedestrians = memo(function Pedestrians({ entities }: { entities: readonly CityEntity[] }) {
  const { scene } = useGLTF(PEDESTRIAN_ASSET_PATH);
  const stillness = usePrefersReducedMotion();

  const walkers = useMemo<Walker[]>(() => {
    const routes = pedestrianRoutes(entities);
    const templates = Array.from({ length: PEDESTRIAN_VARIANTS },
      (_, variant) => variantTemplate(scene, variant));
    const built: Walker[] = [];
    routes.forEach((route, routeIndex) => {
      for (let index = 0; index < WALKERS_PER_ROUTE; index += 1) {
        const seed = routeIndex * 31 + index;
        const template = templates[Math.floor(seededUnit(seed) * PEDESTRIAN_VARIANTS) % PEDESTRIAN_VARIANTS];
        if (!template) continue;
        const group = template.clone(true);
        const limb = (name: string) => group.getObjectByName(name);
        const legLeft = limb("leg_left");
        const legRight = limb("leg_right");
        const armLeft = limb("arm_left");
        const armRight = limb("arm_right");
        if (!legLeft || !legRight || !armLeft || !armRight) continue;
        built.push({
          route,
          // Spread so no two on a circuit walk in step, and so the group does not pulse.
          speed: BASE_SPEED + (seededUnit(seed + 401) - 0.5) * 2 * SPEED_SPREAD,
          start: (route.length * index) / WALKERS_PER_ROUTE
            + seededUnit(seed + 907) * (route.length / WALKERS_PER_ROUTE) * 0.6,
          group, legLeft, legRight, armLeft, armRight,
        });
      }
    });
    return built;
  }, [entities, scene]);

  useFrame(({ clock }) => {
    const elapsed = stillness ? 0 : clock.elapsedTime;
    for (const walker of walkers) {
      const travelled = walker.start + elapsed * walker.speed;
      const { x, z, heading } = pointAt(walker.route, travelled);
      const phase = (travelled / STRIDE_CYCLE) * Math.PI * 2;
      const swing = stillness ? 0 : Math.sin(phase);
      walker.group.position.set(
        x,
        PAVEMENT_Y + (stillness ? 0 : Math.abs(Math.sin(phase)) * BOB_HEIGHT),
        z,
      );
      walker.group.rotation.y = heading;
      walker.legLeft.rotation.x = swing * LEG_SWING;
      walker.legRight.rotation.x = -swing * LEG_SWING;
      // Arms counter the legs, which is what stops a walker reading as a marching toy.
      walker.armLeft.rotation.x = -swing * ARM_SWING;
      walker.armRight.rotation.x = swing * ARM_SWING;
    }
  });

  return (
    <group name="pedestrians">
      {walkers.map((walker, index) => (
        <primitive key={`${walker.route.id}-${index}`} object={walker.group} />
      ))}
    </group>
  );
});
