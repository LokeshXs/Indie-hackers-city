"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { CityDevelopment } from "@/lib/city/types";
import type { WorldPosition } from "./map-types";
import { unlocksFor } from "@/lib/city/unlocks";
import { BUILDING_ROOF_ANCHORS, type RoofAnchors } from "./city-assets";

/** Bulb size, and how far one hangs below the wire it is clipped to. */
const BULB_RADIUS = 0.105;
const BULB_DROP = 0.055;

/** Roughly how far apart the posts are. Each span between two posts sags on its own, so this is
 * what sets how many swags a side is broken into. */
const SPAN_LENGTH = 2.6;

/** How deep a span dips at its midpoint. Zero would be a taut wire clipped to the roofline; this is
 * what makes it read as a hung garland. */
const SPAN_SAG = 0.3;

/** Wire samples per span, and how many of them carry a bulb. Eight and two put the bulbs about
 * 0.65 apart, matching the spacing the straight string used. */
const SAMPLES_PER_SPAN = 8;
const BULB_EVERY = 2;

/** The bulb palette, cycled along the string. Five is deliberate: an odd count against an even
 * number of bulbs per side stops the chase lining up with the roof corners. */
const BULB_COLORS = ["#ffd98a", "#ff8b6b", "#8ce0b8", "#7fd4f0", "#fff3c8"];

/** Seconds each bulb holds a colour before the pattern steps along. Stepping rather than blending
 * is what makes it read as a string of lights instead of a gradient. */
const CHASE_INTERVAL = 0.32;

/** A lit material whose emissive is tinted per instance.
 *
 * `instanceColor` multiplies a material's `color` and can never reach its `emissive` — which is why
 * the first version rendered every bulb white however it was coloured. Keeping the material lit
 * gives the bulb real shading; the one substitution below routes the instance colour into the
 * emissive term as well, so each bulb glows in its own colour. */
function createBulbMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    emissive: new THREE.Color("#ffffff"),
    emissiveIntensity: 1.25,
    roughness: 0.28,
    metalness: 0,
    toneMapped: false,
  });

  material.onBeforeCompile = (shader) => {
    const target = "vec3 totalEmissiveRadiance = emissive;";
    if (!shader.fragmentShader.includes(target)) {
      // Loud on purpose. A silent no-op here reverts the bulbs to glowing white, which is exactly
      // the bug this replaces, and it would look like a styling problem rather than a broken hook.
      console.warn(
        "[roof-lights] three's emissive hook was not found, so bulbs will glow white instead of "
        + "their own colour. The substitution in createBulbMaterial needs updating for this three version.",
      );
      return;
    }
    // `.rgb`, not bare `vColor`. three declares the varying as `varying vec4 vColor;` whenever
    // USE_COLOR is on — itemSize only decides how it is populated, never its type — so `emissive *
    // vColor` is vec3 * vec4 and fails to compile. A failed compile takes the whole material down,
    // which is why the bulbs rendered as dark lumps rather than merely the wrong colour. Swizzling
    // is also version-proof: `.rgb` is valid on a vec3 too.
    shader.fragmentShader = shader.fragmentShader.replace(
      target,
      "vec3 totalEmissiveRadiance = emissive * vColor.rgb;",
    );
  };

  return material;
}

interface GarlandAssets {
  bulbGeometry: THREE.BufferGeometry;
  capGeometry: THREE.BufferGeometry;
  bulbMaterial: THREE.Material;
  capMaterial: THREE.Material;
  wireMaterial: THREE.Material;
}

let garlandAssets: GarlandAssets | null = null;

/** Geometry and materials are identical for every plot, so they are built once and shared. Only the
 * wire differs per building, because it follows that roof's own rectangle.
 *
 * Built on first use rather than at module scope: this module is imported by CityMap3D and by the
 * preview stage, so building at import time made every test that touches either of them pay for
 * geometry it never renders — enough to tip a marginal test past its timeout. */
function getGarlandAssets(): GarlandAssets {
  if (garlandAssets) return garlandAssets;

  // An ellipsoid rather than a sphere: taller than it is wide reads as a bulb, not a bead.
  const bulbGeometry = new THREE.SphereGeometry(BULB_RADIUS, 8, 6);
  bulbGeometry.scale(1, 1.35, 1);

  // A white vertex-colour attribute, which the bulb material needs to exist.
  //
  // `vertexColors: true` switches on three's USE_COLOR path, and that path multiplies vColor by the
  // geometry's `color` attribute. With no such attribute WebGL supplies (0, 0, 0), so vColor came
  // out black — black diffuse, and emissive * vColor = no glow at all. Filling it with white makes
  // the multiply a no-op and leaves vColor carrying exactly the instance colour.
  bulbGeometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(new Float32Array(bulbGeometry.attributes.position.count * 3).fill(1), 3),
  );

  // Pre-translated onto the top of the bulb, so caps and bulbs can share one set of instance
  // matrices instead of maintaining two.
  const capGeometry = new THREE.CylinderGeometry(BULB_RADIUS * 0.6, BULB_RADIUS * 0.74, BULB_RADIUS * 0.66, 6);
  capGeometry.translate(0, BULB_RADIUS * 1.35 + BULB_RADIUS * 0.2, 0);

  garlandAssets = {
    bulbGeometry,
    capGeometry,
    bulbMaterial: createBulbMaterial(),
    capMaterial: new THREE.MeshStandardMaterial({ color: "#22402f", roughness: 0.72 }),
    wireMaterial: new THREE.MeshStandardMaterial({ color: "#1b2a25", roughness: 0.86 }),
  };
  return garlandAssets;
}

interface Garland {
  /** Sagged samples all the way round, for the wire. */
  wire: THREE.Vector3[];
  /** Where each bulb hangs, already dropped below its wire sample. */
  bulbs: THREE.Vector3[];
}

/** Walks the closed polyline, breaking each run into spans that sag between their posts.
 *
 * The sag is a parabola, `4t(1-t)`, which peaks at the midpoint of a span — close enough to a hung
 * cable at this scale, and far cheaper than a real catenary. Height is interpolated along each run,
 * so a garland can climb from one roof mass to a taller one, which is what the L-shaped studio
 * needs. */
function buildGarland(outline: RoofAnchors["garland"]): Garland {
  const wire: THREE.Vector3[] = [];
  const bulbs: THREE.Vector3[] = [];

  outline.forEach((from, index) => {
    const to = outline[(index + 1) % outline.length];
    // Span count comes from the horizontal run: a near-vertical climb should not gain extra swags.
    const runLength = Math.hypot(to.x - from.x, to.z - from.z);
    const spans = Math.max(1, Math.round(runLength / SPAN_LENGTH));

    for (let span = 0; span < spans; span += 1) {
      for (let sample = 0; sample < SAMPLES_PER_SPAN; sample += 1) {
        // Position along the whole run, and along this span for the sag.
        const alongRun = (span + sample / SAMPLES_PER_SPAN) / spans;
        const alongSpan = sample / SAMPLES_PER_SPAN;
        const x = from.x + (to.x - from.x) * alongRun;
        const z = from.z + (to.z - from.z) * alongRun;
        const y = from.y + (to.y - from.y) * alongRun
          - SPAN_SAG * 4 * alongSpan * (1 - alongSpan);

        wire.push(new THREE.Vector3(x, y, z));
        if (sample % BULB_EVERY === 0) {
          bulbs.push(new THREE.Vector3(x, y - BULB_DROP - BULB_RADIUS * 1.35, z));
        }
      }
    }
  });

  return { wire, bulbs };
}

/** Paints the palette onto the string, offset by `step` so the pattern travels. */
function paintBulbs(mesh: THREE.InstancedMesh, count: number, step: number): void {
  const color = new THREE.Color();
  for (let index = 0; index < count; index += 1) {
    // Subtracting makes the pattern run along the string rather than back against it.
    const slot = (((index - step) % BULB_COLORS.length) + BULB_COLORS.length) % BULB_COLORS.length;
    mesh.setColorAt(index, color.set(BULB_COLORS[slot]));
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function RoofLights({ outline }: { outline: RoofAnchors["garland"] }) {
  const assets = getGarlandAssets();
  const bulbsRef = useRef<THREE.InstancedMesh>(null);
  const capsRef = useRef<THREE.InstancedMesh>(null);
  const garland = useMemo(() => buildGarland(outline), [outline]);
  // Which step of the chase is currently painted, so a frame that changes nothing costs one compare.
  const paintedStep = useRef(-1);

  const wireGeometry = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(garland.wire, true, "catmullrom", 0.4);
    return new THREE.TubeGeometry(curve, garland.wire.length * 2, 0.028, 4, true);
  }, [garland.wire]);

  useEffect(() => () => wireGeometry.dispose(), [wireGeometry]);

  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3(1, 1, 1);

    garland.bulbs.forEach((position, index) => {
      // A deterministic wobble so the bulbs do not all hang perfectly plumb. Golden-ratio stepping
      // keeps neighbours from sharing a tilt.
      euler.set(0, 0, (((index * 0.618) % 1) - 0.5) * 0.5);
      matrix.compose(position, quaternion.setFromEuler(euler), scale);
      bulbsRef.current?.setMatrixAt(index, matrix);
      capsRef.current?.setMatrixAt(index, matrix);
    });

    if (bulbsRef.current) bulbsRef.current.instanceMatrix.needsUpdate = true;
    if (capsRef.current) capsRef.current.instanceMatrix.needsUpdate = true;

    // Paint immediately: without instanceColor set, vColor is undefined and the first frame would
    // render the bulbs black.
    if (bulbsRef.current) paintBulbs(bulbsRef.current, garland.bulbs.length, 0);
    paintedStep.current = 0;
  }, [garland]);

  useFrame(({ clock }) => {
    const mesh = bulbsRef.current;
    if (!mesh) return;
    const step = Math.floor(clock.elapsedTime / CHASE_INTERVAL);
    if (step === paintedStep.current) return;
    paintedStep.current = step;
    paintBulbs(mesh, garland.bulbs.length, step);
  });

  return (
    <>
      <mesh geometry={wireGeometry} material={assets.wireMaterial} />
      <instancedMesh ref={bulbsRef} args={[assets.bulbGeometry, assets.bulbMaterial, garland.bulbs.length]} />
      <instancedMesh ref={capsRef} args={[assets.capGeometry, assets.capMaterial, garland.bulbs.length]} />
    </>
  );
}

export interface RoofPropPlacement {
  plotId: string;
  position: WorldPosition;
  rotationY: number | undefined;
  development: CityDevelopment;
}

/** Everything a founder has earned that sits on top of their building.
 *
 * Rendered inside a group carrying the building's own placement, rotation and scale, so the anchor
 * coordinates from city-assets apply directly and the props turn with the building on plots that
 * face the other way. */
export function RoofProps({ development }: { development: CityDevelopment }) {
  const anchors = BUILDING_ROOF_ANCHORS[development.building.assetId];
  const unlocks = unlocksFor(development.progression.xp);


  if (!anchors) return null;

  return (
    <>
      {unlocks.lights ? <RoofLights outline={anchors.garland} /> : null}
    </>
  );
}
