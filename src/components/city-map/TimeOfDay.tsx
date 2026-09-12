"use client";

import { createContext, memo, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import type { BloomEffect } from "postprocessing";
import * as THREE from "three";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import {
  MORNING_ENVIRONMENT,
  NIGHT_ENVIRONMENT,
  advanceTransition,
  easeBlend,
  lerp,
  targetFor,
  type CityPhase,
} from "@/lib/city/time-of-day";
import { applyNightBlend } from "./night-materials";
import type { CityEntity } from "./map-types";

/** How night it is, right now, without re-rendering anything.
 *
 * A switch takes a second and a bit to cross, and the city has to follow it every frame of that,
 * which in React terms is the worst possible shape: a value that changes each frame, read by half
 * the scene. Putting it in state would re-render the map sixty times a second to move some numbers
 * that React does not own anyway, since lights and materials are mutable three.js objects.
 *
 * So it is a ref, passed through context, and every consumer reads it inside its own frame loop.
 * The context value is the ref object itself and never changes identity, so no consumer ever
 * re-renders because of it.
 *
 * NULL IS MEANINGFUL: it says "there is no switch here", which is the answer the claim modal's
 * preview stage needs. Those previews mount the same components against their own Canvas, and a
 * shop window has to be lit whichever way the map is set -- so they simply do not provide this, and
 * everything downstream reads the absence as permanent daylight. */
export interface NightBlend {
  current: number;
}

const NightBlendContext = createContext<NightBlend | null>(null);

export function useNightBlend(): NightBlend | null {
  return useContext(NightBlendContext);
}

/** Carries the switch. One per Canvas, wrapping everything that should know which phase it is.
 *
 * The phase itself is ordinary React state, owned by the map and flipped by the toggle. What this
 * adds is the travel between the two: React is told once, when the button is pressed, and the
 * frame loop below spends the next second and a bit walking the city across. */
export function CityTimeProvider({
  phase,
  children,
}: {
  phase: CityPhase;
  children: ReactNode;
}) {
  const stillness = usePrefersReducedMotion();
  // THE REF ITSELF is what goes down the context, never its value: the identity is stable, so no
  // consumer re-renders, and `.current` is only ever touched inside a frame callback -- here to
  // write it, and in each consumer to read it. That is ordinary ref usage rather than a ref being
  // read during render, which is the thing a ref must not be.
  const blendRef = useRef(0);
  // Where the transition has got to, before easing. Kept separate from the eased value because
  // easing an already-eased number a second time flattens the ends into a stall.
  const positionRef = useRef(0);

  useFrame((_, delta) => {
    // Someone who has asked for less motion gets the two phases and nothing in between: a zero
    // duration makes the step land on the target immediately.
    const position = advanceTransition(positionRef.current, targetFor(phase), delta, stillness ? 0 : undefined);
    if (position === positionRef.current) return;
    positionRef.current = position;
    blendRef.current = easeBlend(position);
  });

  return <NightBlendContext.Provider value={blendRef}>{children}</NightBlendContext.Provider>;
}

/** The palettes, as GPU colours. Built once at module scope: there are sixteen of them and they
 * never change, and rebuilding them per frame is the classic way to make a colour lerp expensive. */
const SKY = [new THREE.Color(MORNING_ENVIRONMENT.sky), new THREE.Color(NIGHT_ENVIRONMENT.sky)] as const;
const GROUND = [new THREE.Color(MORNING_ENVIRONMENT.ground), new THREE.Color(NIGHT_ENVIRONMENT.ground)] as const;
const SUN = [new THREE.Color(MORNING_ENVIRONMENT.sunColor), new THREE.Color(NIGHT_ENVIRONMENT.sunColor)] as const;
const BACKGROUND = [new THREE.Color(MORNING_ENVIRONMENT.background), new THREE.Color(NIGHT_ENVIRONMENT.background)] as const;
const FOG = [new THREE.Color(MORNING_ENVIRONMENT.fog), new THREE.Color(NIGHT_ENVIRONMENT.fog)] as const;

/** Sky, fog and the two lights, driven from the switch.
 *
 * This replaces the five fixed lines the scene used to open with, and the morning end of every
 * value below is exactly what those lines said -- see MORNING_ENVIRONMENT. */
export const TimeOfDayLighting = memo(function TimeOfDayLighting() {
  const blend = useNightBlend();
  const backgroundRef = useRef<THREE.Color>(null);
  const fogRef = useRef<THREE.Fog>(null);
  const hemisphereRef = useRef<THREE.HemisphereLight>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const applied = useRef(-1);

  useFrame(() => {
    const t = blend?.current ?? 0;
    if (Math.abs(t - applied.current) < 0.0005) return;
    applied.current = t;

    backgroundRef.current?.lerpColors(BACKGROUND[0], BACKGROUND[1], t);
    if (fogRef.current) fogRef.current.color.lerpColors(FOG[0], FOG[1], t);
    if (hemisphereRef.current) {
      hemisphereRef.current.color.lerpColors(SKY[0], SKY[1], t);
      hemisphereRef.current.groundColor.lerpColors(GROUND[0], GROUND[1], t);
      hemisphereRef.current.intensity = lerp(
        MORNING_ENVIRONMENT.hemisphereIntensity,
        NIGHT_ENVIRONMENT.hemisphereIntensity,
        t,
      );
    }
    if (sunRef.current) {
      sunRef.current.color.lerpColors(SUN[0], SUN[1], t);
      sunRef.current.intensity = lerp(MORNING_ENVIRONMENT.sunIntensity, NIGHT_ENVIRONMENT.sunIntensity, t);
      // The moon is the sun, swung across the sky rather than lit as a second source. Straight
      // interpolation carries it up over the city and down the other side, which is close enough
      // to an arc at the speed this happens.
      sunRef.current.position.set(
        lerp(MORNING_ENVIRONMENT.sunPosition[0], NIGHT_ENVIRONMENT.sunPosition[0], t),
        lerp(MORNING_ENVIRONMENT.sunPosition[1], NIGHT_ENVIRONMENT.sunPosition[1], t),
        lerp(MORNING_ENVIRONMENT.sunPosition[2], NIGHT_ENVIRONMENT.sunPosition[2], t),
      );
    }

    // The lit surfaces of every building, lamp and car, in the same pass.
    applyNightBlend(t);
  });

  return (
    <>
      <color ref={backgroundRef} attach="background" args={[MORNING_ENVIRONMENT.background]} />
      {/* Fog is distance-from-camera, so this range is the original [90, 190] offset by the
          camera's +995.93 move — reproduces the previous look exactly. */}
      <fog ref={fogRef} attach="fog" args={[MORNING_ENVIRONMENT.fog, MORNING_ENVIRONMENT.fogNear, MORNING_ENVIRONMENT.fogFar]} />
      <hemisphereLight
        ref={hemisphereRef}
        args={[MORNING_ENVIRONMENT.sky, MORNING_ENVIRONMENT.ground, MORNING_ENVIRONMENT.hemisphereIntensity]}
      />
      <directionalLight
        ref={sunRef}
        position={MORNING_ENVIRONMENT.sunPosition as unknown as [number, number, number]}
        intensity={MORNING_ENVIRONMENT.sunIntensity}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
      />
    </>
  );
});

/** Height of a lamp's globe above its footing, measured off scripts/props/build-street-lamp.py. */
const LAMP_GLOBE_HEIGHT = 3.14;
/** Across the halo, and across the pool of light it throws on the pavement. */
const LAMP_HALO_SIZE = 3.5;
const LAMP_POOL_SIZE = 7;
/** Opacity of each at full night. The pool stays the fainter of the two: the halo is the lamp
 * being bright, the pool is only where that brightness lands, and matching them turns eighteen
 * lamps into eighteen discs painted on the road. */
const LAMP_HALO_OPACITY = 0.98;
const LAMP_POOL_OPACITY = 0.34;

/** A soft round gradient, painted once into a canvas.
 *
 * Cheaper than it looks and much cheaper than the alternative: a glow like this is otherwise a
 * shader, and this is a 128px texture shared by every lamp on the map. Returns null where there is
 * no 2D canvas to paint into, which is jsdom -- the glow is then simply absent, and the tests that
 * render the map do not care. */
function radialGlowTexture(): THREE.Texture | null {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255, 236, 190, 1)");
  gradient.addColorStop(0.22, "rgba(255, 216, 140, 0.72)");
  gradient.addColorStop(0.55, "rgba(255, 186, 94, 0.22)");
  gradient.addColorStop(1, "rgba(255, 170, 80, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

interface LampGlowAssets {
  halo: THREE.SpriteMaterial;
  pool: THREE.MeshBasicMaterial;
  plane: THREE.PlaneGeometry;
}

/** `undefined` is "not built yet"; `null` is "this browser has no canvas to build it from". */
let lampGlowAssets: LampGlowAssets | null | undefined;

/** The texture, two materials and one quad every lamp on the map shares.
 *
 * Module state rather than a useMemo, which is the same shape RoofProps' garland uses and for the
 * same two reasons: the assets are identical for every district, and building them on first use
 * keeps the cost off any test that merely imports this module. They are never disposed, because
 * there is exactly one set and the map holds it for as long as the page is open. */
function getLampGlowAssets(): LampGlowAssets | null {
  if (lampGlowAssets !== undefined) return lampGlowAssets;

  const map = radialGlowTexture();
  lampGlowAssets = map
    ? {
      halo: new THREE.SpriteMaterial({
        map,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        // Depth-tested on purpose: the lamps stand among trees and beside buildings, and a halo
        // that survives them reads as a decal in front of the city rather than as light in the
        // air around a globe.
        depthTest: true,
        toneMapped: false,
      }),
      pool: new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      plane: new THREE.PlaneGeometry(LAMP_POOL_SIZE, LAMP_POOL_SIZE),
    }
    : null;
  return lampGlowAssets;
}

/** The haze around each street lamp, and the light it puts on the pavement.
 *
 * The lamp glbs glow on their own -- that is the material table doing its work -- but a glowing
 * globe is a bright dot, not a light. This is what makes the street read as lit: a halo in the air
 * and a pool on the ground, both additive, both fading in with the switch.
 *
 * ALL EIGHTEEN LAMPS SHARE TWO MATERIALS, which is the whole reason this is affordable. Fading them
 * is two property writes a frame however many lamps the district grows to, and the thirty-six
 * objects they are worn by are small transparent quads that were going to be cheap regardless.
 *
 * Deliberately not real point lights. Eighteen of those would recompile every material on the map
 * and cost more than the rest of the scene put together, to light a city that is already readable. */
export const StreetLampGlow = memo(function StreetLampGlow({
  entities,
}: {
  entities: readonly CityEntity[];
}) {
  const blend = useNightBlend();
  const glow = getLampGlowAssets();
  const lamps = useMemo(
    () => entities.filter((entity) => entity.assetId === "street-lamp"),
    [entities],
  );

  useFrame(() => {
    // Fetched again here rather than closed over from the render above. The two calls return the
    // same object -- it is built once and cached -- but reaching for it inside the callback keeps
    // this a mutation of module state rather than of something captured out of a render.
    const assets = getLampGlowAssets();
    if (!assets) return;
    const t = blend?.current ?? 0;
    assets.halo.opacity = LAMP_HALO_OPACITY * t;
    assets.pool.opacity = LAMP_POOL_OPACITY * t;
    // Nothing to draw at noon, and a transparent quad still costs a draw call and a blend.
    assets.halo.visible = t > 0.002;
    assets.pool.visible = t > 0.002;
  });

  if (!glow) return null;

  return (
    <group name="street-lamp-glow">
      {lamps.map((lamp) => (
        <group key={`${lamp.id}-glow`} position={[lamp.position.x, lamp.position.y, lamp.position.z]}>
          <sprite material={glow.halo} position={[0, LAMP_GLOBE_HEIGHT, 0]} scale={[LAMP_HALO_SIZE, LAMP_HALO_SIZE, 1]} />
          {/* Just clear of the paving pad the lamp stands on, which is 0.10 deep. */}
          <mesh material={glow.pool} geometry={glow.plane} position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1} raycast={() => null} />
        </group>
      ))}
    </group>
  );
});

/** Bloom, at night only.
 *
 * WHY IT UNMOUNTS BY DAY rather than fading to zero intensity: an EffectComposer takes the render
 * loop off three.js and runs the scene through its own buffers, and however careful the library is
 * about colour space, that is not the same path as rendering straight to the canvas. Keeping it
 * mounted at zero would put every daylight frame down a path the city has never been down, to buy
 * nothing -- the map already looked right. Unmounted, noon renders exactly as it did before this
 * feature existed, and the composer only exists during the hours it is doing something.
 *
 * The cost is a pipeline rebuild as dusk starts, worth perhaps a dropped frame, twice every ten
 * minutes, at the moment the light is already changing. */
export const CityBloom = memo(function CityBloom() {
  const blend = useNightBlend();
  const bloomRef = useRef<BloomEffect>(null);
  const [lit, setLit] = useState(false);

  useFrame(() => {
    const t = blend?.current ?? 0;
    const next = t > 0.002;
    if (next !== lit) setLit(next);
    if (bloomRef.current) bloomRef.current.intensity = NIGHT_ENVIRONMENT.bloomIntensity * t;
  });

  if (!lit) return null;

  return (
    <EffectComposer
      // Four rather than the default eight. The city is orthographic and full of straight edges, so
      // dropping antialiasing entirely is very visible here; eight samples on top of the water's
      // per-frame vertex work is more than the effect is worth.
      multisampling={4}
    >
      <Bloom
        ref={bloomRef}
        mipmapBlur
        intensity={0}
        // Above the lit windows and below the lamps, so the map glows at its light sources rather
        // than everywhere the moon catches a pale wall.
        luminanceThreshold={0.62}
        luminanceSmoothing={0.14}
      />
    </EffectComposer>
  );
});
