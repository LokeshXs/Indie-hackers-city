"use client";

import { createContext, memo, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import type { CityAssetId, CityEntity } from "./map-types";

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
export const TimeOfDayLighting = memo(function TimeOfDayLighting({
  fogNear = MORNING_ENVIRONMENT.fogNear,
  fogFar = MORNING_ENVIRONMENT.fogFar,
}: {
  /** Where the haze over the sea starts and finishes, as distances from the camera. The map works
   * these out from the viewport, because how far the water has to reach depends on the screen --
   * see computeSeaExtent. The defaults are the fixed pair this used to be built with. */
  fogNear?: number;
  fogFar?: number;
}) {
  const blend = useNightBlend();
  const backgroundRef = useRef<THREE.Color>(null);
  const fogRef = useRef<THREE.Fog>(null);
  const hemisphereRef = useRef<THREE.HemisphereLight>(null);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const applied = useRef(-1);

  // Mutated rather than passed as `args`, which would rebuild the Fog on every resize and reset its
  // colour to the morning one part-way through a transition to night.
  useEffect(() => {
    if (!fogRef.current) return;
    fogRef.current.near = fogNear;
    fogRef.current.far = fogFar;
  }, [fogNear, fogFar]);

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
      {/* Fog is distance-from-camera, hence the very large numbers: the camera sits ~1039 units
          back from the city, and the sea now runs out well past that. */}
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

/** How each kind of lamp in the kit throws its light, measured off its own build script.
 *
 * `lit` is the height of the light itself above the lamp's footing. The rest is how big the haze
 * around it is, how far the pool on the ground spreads, and how strong each is at full night. The
 * pool stays the fainter of the two throughout: the halo is the lamp being bright, the pool is only
 * where that brightness lands, and matching them turns a street of lamps into a street of discs
 * painted on the road.
 *
 * Both entries are placed unscaled, so these are world units. Anything not in this table simply
 * gets no glow -- which is the right default for the rest of the kit. */
interface LampGlowKind {
  lit: number;
  /** The bulb: small and bright, drawn over the haze. */
  coreSize: number;
  coreOpacity: number;
  /** The haze in the air around it: several times the core, much softer, and deliberately kept
   * tight. Haze is what you see looking AT a lamp, and it belongs close to the globe -- spread wide
   * it stops being air catching the light and becomes a disc pasted over the buildings behind. The
   * reach belongs to the pool below, which is on the ground where light actually travels. */
  haloSize: number;
  haloOpacity: number;
  /** Where that light lands. The widest of the three and the faintest by area, because a pool as
   * strong as its halo reads as a second lamp lying on the road.
   *
   * Opacity comes DOWN as these sizes go up, and has to: a quad's area grows with the square of
   * its size, so widening the reach at a fixed strength does not spread the same light further --
   * it pours several times as much onto the ground, and a street of overlapping pools washes out
   * into one flat sheet. Reach is the size; brightness is the opposite adjustment. */
  poolSize: number;
  poolOpacity: number;
}

const LAMP_GLOW_KINDS: Partial<Record<CityAssetId, LampGlowKind>> = {
  "street-lamp": {
    lit: 3.14,
    coreSize: 1.15,
    coreOpacity: 0.95,
    haloSize: 6.5,
    haloOpacity: 0.52,
    poolSize: 30,
    poolOpacity: 0.165,
  },
  // Lower, smaller and softer on every axis. A carriageway lamp lights a road; these light the
  // Coffee House's terrace and the lanes between the plots, and at the street's strength they
  // would out-shine the shopfronts they stand outside.
  "cafe-lamp": {
    lit: 1.78,
    coreSize: 0.78,
    coreOpacity: 0.82,
    haloSize: 4,
    haloOpacity: 0.4,
    poolSize: 18,
    poolOpacity: 0.13,
  },
};

/** A soft round gradient, painted once into a canvas.
 *
 * Cheaper than it looks and much cheaper than the alternative: a glow like this is otherwise a
 * shader, and this is a 128px texture shared by every lamp on the map. Returns null where there is
 * no 2D canvas to paint into, which is jsdom -- the glow is then simply absent, and the tests that
 * render the map do not care. */
export function radialGlowTexture(stops: ReadonlyArray<readonly [number, string]>): THREE.Texture | null {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** The spill: a long, gentle falloff, warm all the way out.
 *
 * The shape of this curve is the whole difference between a lamp and a candle. The first version
 * was down to a fifth of its strength by the halfway mark, which put nearly all the light in the
 * middle few pixels -- a hot point with a quick edge, which is a flame. Real lamplight does the
 * opposite: it holds most of its strength well out from the source and then takes a long time to
 * reach nothing. Eight stops rather than four, because canvas interpolates linearly between them
 * and a curve this shallow needs the samples to stay smooth. */
const LAMP_GLOW_STOPS = [
  [0, "rgba(255, 240, 200, 0.95)"],
  [0.12, "rgba(255, 234, 182, 0.86)"],
  [0.26, "rgba(255, 222, 154, 0.64)"],
  [0.42, "rgba(255, 208, 128, 0.42)"],
  [0.58, "rgba(255, 194, 106, 0.25)"],
  [0.74, "rgba(255, 182, 90, 0.13)"],
  [0.88, "rgba(255, 174, 82, 0.05)"],
  [1, "rgba(255, 170, 80, 0)"],
] as const;

/** The core: the bulb itself, small and hot.
 *
 * Kept as a separate texture rather than folded into the spill above, and that split is the other
 * half of the fix. One gradient cannot be both -- widen it and the source stops reading as a
 * source, tighten it and the spill disappears -- so the lamp is drawn as two sprites: a small
 * bright disc for the globe, sitting inside a much larger soft one for the light it throws. */
const LAMP_CORE_STOPS = [
  [0, "rgba(255, 252, 240, 1)"],
  [0.3, "rgba(255, 242, 206, 0.78)"],
  [0.62, "rgba(255, 224, 158, 0.22)"],
  [1, "rgba(255, 214, 140, 0)"],
] as const;

/** A neutral falloff for anything that would rather tint its own glow through the material, which
 * is what the traffic does -- one texture serving a warm headlight wash and a red tail wash. */
export const NEUTRAL_GLOW_STOPS = [
  [0, "rgba(255, 255, 255, 1)"],
  [0.28, "rgba(255, 255, 255, 0.66)"],
  [0.62, "rgba(255, 255, 255, 0.2)"],
  [1, "rgba(255, 255, 255, 0)"],
] as const;

interface LampGlowMaterials {
  core: THREE.SpriteMaterial;
  halo: THREE.SpriteMaterial;
  pool: THREE.MeshBasicMaterial;
}

interface LampGlowAssets {
  /** One set of materials per kind of lamp, so each can be faded to its own strength. */
  kinds: Map<CityAssetId, LampGlowMaterials>;
  plane: THREE.PlaneGeometry;
}

/** `undefined` is "not built yet"; `null` is "this browser has no canvas to build it from". */
let lampGlowAssets: LampGlowAssets | null | undefined;

/** The texture, two materials and one quad every lamp on the map shares.
 *
 * Exported so the Coffee House's door lamps can wear the same halo. Sharing the material also
 * shares its fade: StreetLampGlow already drives this one's opacity every frame, so a borrower gets
 * the cycle for free and cannot fall out of step with the street.
 *
 * Module state rather than a useMemo, which is the same shape RoofProps' garland uses and for the
 * same two reasons: the assets are identical for every district, and building them on first use
 * keeps the cost off any test that merely imports this module. They are never disposed, because
 * there is exactly one set and the map holds it for as long as the page is open. */
export function getLampGlowAssets(): LampGlowAssets | null {
  if (lampGlowAssets !== undefined) return lampGlowAssets;

  const spill = radialGlowTexture(LAMP_GLOW_STOPS);
  const core = radialGlowTexture(LAMP_CORE_STOPS);
  if (!spill || !core) {
    lampGlowAssets = null;
    return lampGlowAssets;
  }

  const sprite = (map: THREE.Texture) => new THREE.SpriteMaterial({
    map,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    // Depth-tested on purpose: the lamps stand among trees and beside buildings, and a halo that
    // survives them reads as a decal in front of the city rather than as light in the air.
    depthTest: true,
    toneMapped: false,
  });

  const kinds = new Map<CityAssetId, LampGlowMaterials>();
  for (const assetId of Object.keys(LAMP_GLOW_KINDS) as CityAssetId[]) {
    kinds.set(assetId, {
      core: sprite(core),
      halo: sprite(spill),
      pool: new THREE.MeshBasicMaterial({
        map: spill,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    });
  }

  lampGlowAssets = { kinds, plane: new THREE.PlaneGeometry(1, 1) };
  return lampGlowAssets;
}

/** The haze around each lamp, and the light it puts on the ground.
 *
 * The lamp glbs glow on their own -- that is the material table doing its work -- but a glowing
 * globe is a bright dot, not a light. This is what makes a street or a terrace read as lit: a halo
 * in the air and a pool on the ground, both additive, both fading in with the switch.
 *
 * EVERY LAMP OF A KIND SHARES ONE PAIR OF MATERIALS, which is the whole reason this is affordable.
 * Fading them is two property writes per kind per frame however many lamps the district grows to,
 * and the quads they are worn by are small and transparent.
 *
 * Deliberately not real point lights. Twenty of those would recompile every material on the map and
 * cost more than the rest of the scene put together, to light a city that is already readable. */
export const LampGlow = memo(function LampGlow({
  entities,
}: {
  entities: readonly CityEntity[];
}) {
  const blend = useNightBlend();
  const glow = getLampGlowAssets();
  const lamps = useMemo(
    () => entities.flatMap((entity) => {
      const kind = LAMP_GLOW_KINDS[entity.assetId];
      return kind ? [{ entity, kind }] : [];
    }),
    [entities],
  );

  useFrame(() => {
    // Fetched again here rather than closed over from the render above. The two calls return the
    // same object -- it is built once and cached -- but reaching for it inside the callback keeps
    // this a mutation of module state rather than of something captured out of a render.
    const assets = getLampGlowAssets();
    if (!assets) return;
    const t = blend?.current ?? 0;
    // Nothing to draw at noon, and a transparent quad still costs a draw call and a blend.
    const lit = t > 0.002;
    for (const [assetId, materials] of assets.kinds) {
      const kind = LAMP_GLOW_KINDS[assetId];
      if (!kind) continue;
      materials.core.opacity = kind.coreOpacity * t;
      materials.halo.opacity = kind.haloOpacity * t;
      materials.pool.opacity = kind.poolOpacity * t;
      materials.core.visible = lit;
      materials.halo.visible = lit;
      materials.pool.visible = lit;
    }
  });

  if (!glow) return null;

  return (
    <group name="lamp-glow">
      {lamps.map(({ entity, kind }) => {
        const materials = glow.kinds.get(entity.assetId);
        if (!materials) return null;
        return (
          <group key={`${entity.id}-glow`} position={[entity.position.x, entity.position.y, entity.position.z]}>
            <sprite material={materials.halo} position={[0, kind.lit, 0]} scale={[kind.haloSize, kind.haloSize, 1]} />
            {/* Drawn after the haze, so the bulb sits inside it rather than behind it. */}
            <sprite material={materials.core} position={[0, kind.lit, 0]} scale={[kind.coreSize, kind.coreSize, 1]} renderOrder={2} />
            {/* Just clear of whatever the lamp is footed on, so the pool never z-fights it. */}
            <mesh material={materials.pool} geometry={glow.plane} position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[kind.poolSize, kind.poolSize, 1]} renderOrder={1} raycast={() => null} />
          </group>
        );
      })}
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
