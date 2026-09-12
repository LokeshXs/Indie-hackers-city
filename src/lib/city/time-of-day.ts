/** The city's two lighting phases, and how it moves between them.
 *
 * Everything here is pure arithmetic, with no three.js and no React, because the easing is the one
 * part of this feature worth testing directly -- the rest is lights and materials, which a unit test
 * can only assert the shape of.
 *
 * The colours below are the second half of the module. They are plain hex and numbers rather than
 * THREE.Color instances for the same reason: a palette is data, and building GPU objects at import
 * time would make every test that touches this module pay for them. TimeOfDay.tsx turns them into
 * colours once, at mount. */

export type CityPhase = "morning" | "night";

/** How long a switch takes, in seconds.
 *
 * Long enough to read as the light changing rather than a switch being thrown, short enough that
 * someone who pressed the button does not wonder whether it worked. The whole city moves together
 * over this span: sky, sun, sea, every lit window, and the HUD.  */
export const TRANSITION_SECONDS = 1.4;

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Where a phase sits on the 0..1 line the transition runs along. */
export function targetFor(phase: CityPhase): number {
  return phase === "night" ? 1 : 0;
}

/** Moves the transition one frame closer to where it is heading.
 *
 * Linear on purpose -- the shaping is applied afterwards by `easeBlend`, and keeping the position
 * itself linear is what lets the switch be pressed again mid-flight: the city turns round from
 * wherever it had got to, at the same speed, rather than jumping.
 *
 * Clamped at both ends so a frame that arrives late -- a tab waking up, a long asset decode -- lands
 * exactly on the target instead of sailing past it and easing back. */
export function advanceTransition(
  position: number,
  target: number,
  deltaSeconds: number,
  duration: number = TRANSITION_SECONDS,
): number {
  if (duration <= 0) return target;
  const step = Math.max(deltaSeconds, 0) / duration;
  if (position < target) return Math.min(position + step, target);
  if (position > target) return Math.max(position - step, target);
  return target;
}

/** The linear position, shaped into the value the city is actually lit by.
 *
 * A smoothstep, so the light leaves and arrives gently and does its travelling in the middle. A
 * linear ramp between two palettes this far apart reads as a dimmer being turned by hand; the eased
 * one reads as dusk. */
export function easeBlend(position: number): number {
  const t = clamp01(position);
  return t * t * (3 - 2 * t);
}

export interface CityWaterPalette {
  shallow: string;
  mid: string;
  deep: string;
  highlight: string;
  /** How much of the depth colour survives against white. Lower is a paler, hazier sea. */
  tint: number;
}

export interface CityEnvironment {
  background: string;
  fog: string;
  /** Fog is distance-from-camera and the camera sits ~996 units back — see Scene's note. */
  fogNear: number;
  fogFar: number;
  /** Hemisphere sky and ground, the map's fill light. */
  sky: string;
  ground: string;
  hemisphereIntensity: number;
  /** The single directional light, which is the sun by day and the moon by night. */
  sunColor: string;
  sunIntensity: number;
  sunPosition: readonly [number, number, number];
  water: CityWaterPalette;
  /** Bloom at full strength for this phase. Zero by day: see CityBloom. */
  bloomIntensity: number;
}

/** Daylight, and every value in it is the one the map already rendered before this feature existed.
 *
 * That is deliberate and worth keeping true: this adds a night, it does not restyle the morning.
 * Anything that looks different in daylight after this is a bug, not a decision. */
export const MORNING_ENVIRONMENT: CityEnvironment = {
  background: "#0a3a63",
  fog: "#0a3a63",
  fogNear: 1086,
  fogFar: 1186,
  sky: "#fff3c8",
  ground: "#174544",
  hemisphereIntensity: 1.35,
  sunColor: "#ffffff",
  sunIntensity: 2.65,
  sunPosition: [-16, 24, 12],
  water: {
    shallow: "#7ff2ea",
    mid: "#2a90c9",
    deep: "#1c5f96",
    highlight: "#f4fffd",
    tint: 0.6,
  },
  bloomIntensity: 0,
};

/** Night.
 *
 * The fill light drops hardest and the key light drops least, which is what keeps the city readable
 * after dark: a map lit to a true midnight is a black rectangle with some orange dots on it. The
 * moon is the same directional light recoloured and swung to the other side of the sky rather than
 * a second light -- one more light would recompile every material on the map for a source that is
 * doing a fifth of the work the sun does. */
export const NIGHT_ENVIRONMENT: CityEnvironment = {
  background: "#050d24",
  fog: "#050d24",
  fogNear: 1086,
  fogFar: 1186,
  sky: "#2b3d6b",
  ground: "#050f16",
  hemisphereIntensity: 0.46,
  sunColor: "#a9c4ff",
  sunIntensity: 0.52,
  sunPosition: [15, 21, -11],
  water: {
    shallow: "#1c5a72",
    mid: "#103550",
    deep: "#061a2e",
    highlight: "#bcd6ff",
    // Higher than the morning's: the night sea keeps more of its own colour, because lightening it
    // toward white is what reads as haze, and a hazy sea at midnight reads as fog on the water.
    tint: 0.78,
  },
  bloomIntensity: 1.15,
};
