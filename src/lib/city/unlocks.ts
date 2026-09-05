/** What a founder's plot gains as their XP grows.
 *
 * Each threshold is an exact achievement total on the common earning path, so every unlock lands on
 * its own action rather than two firing at once:
 *
 *    10  claim
 *   110  first launch          +100   lights
 *   190  100+ users             +80   (open — the flag was pulled, see git history)
 *   240  first $10              +50   marquee
 *   390  first $100            +150   status
 *   490  second product launch +100   level 2
 *
 * Round numbers would be worse here, not better: with cascading, `revenue_100` grants 200 in one
 * call, so a threshold sitting between two totals is crossed silently while the founder is looking
 * at something else.
 *
 * LADDER is the single source of truth; the thresholds map and `unlocksFor` are derived from it, so
 * the two cannot drift apart. */

export interface LadderReward {
  key: UnlockKey;
  label: string;
  description: string;
}

export interface LadderEntry {
  threshold: number;
  /** Absent until the reward is designed. Those entries exist so the timeline always has road
   * ahead, and render as a sealed parcel whatever the founder's XP.
   *
   * Passing one is not a broken promise: unlocks are derived from xp_total rather than stored, so a
   * founder already past the threshold receives the reward the moment it ships — no migration, no
   * backfill. */
  reward?: LadderReward;
}

export type UnlockKey = "lights" | "marquee" | "status" | "levelTwo";

export type Unlocks = Record<UnlockKey, boolean>;

export const LADDER: readonly LadderEntry[] = [
  {
    threshold: 100,
    reward: { key: "lights", label: "Roof lights", description: "A string of lights around your roof edge." },
  },
  {
    threshold: 240,
    reward: { key: "marquee", label: "Scrolling billboard", description: "Your billboard text travels, like a station board." },
  },
  {
    threshold: 390,
    reward: { key: "status", label: "Status bubble", description: "Tell the city what you are working on." },
  },
  {
    threshold: 490,
    reward: { key: "levelTwo", label: "A bigger building", description: "Choose from a new set of premises." },
  },
  // Placeholders. The thresholds are real landings on the earning curve — 570 is a second product's
  // users complete, 670 a third launch, 850 a third product's users complete — so the "every unlock
  // lands on an achievement" property still holds once these are named.
  { threshold: 570 },
  { threshold: 670 },
  { threshold: 850 },
];

export const UNLOCK_THRESHOLDS = Object.fromEntries(
  LADDER.flatMap((entry) => (entry.reward ? [[entry.reward.key, entry.threshold]] : [])),
) as Record<UnlockKey, number>;

/** Derived from xp_total alone — nothing about a founder's unlocks is stored. */
export function unlocksFor(xp: number): Unlocks {
  return {
    lights: xp >= UNLOCK_THRESHOLDS.lights,
    marquee: xp >= UNLOCK_THRESHOLDS.marquee,
    status: xp >= UNLOCK_THRESHOLDS.status,
    levelTwo: xp >= UNLOCK_THRESHOLDS.levelTwo,
  };
}

/** The next thing to earn, or null once the whole ladder is behind you. */
export function nextEntry(xp: number): LadderEntry | null {
  return LADDER.find((entry) => xp < entry.threshold) ?? null;
}

export interface RewardLeg {
  /** The rung just cleared. Zero before the first one, so a new founder is on a real leg rather
   * than nowhere. */
  from: number;
  /** The rung being worked toward. */
  to: number;
  /** Absent on the placeholder rungs, which have a threshold but no reward designed yet. */
  reward?: LadderReward;
  /** XP still needed. Always positive — `to` is by definition above `xp`. */
  remaining: number;
  /** 0-1 across this leg. */
  progress: number;
}

/** Where a founder stands on the stretch between the reward they last earned and the next one, or
 * null once the whole ladder is behind them.
 *
 * Measured across the leg rather than from zero, and that is the whole point. From zero, a founder
 * at 250 with the 390 rung ahead reads 64% — a bar two-thirds full while they still need 140 XP,
 * more than half of everything they have ever earned. Across the leg it reads 7%, which is the
 * truth: they just collected a reward and have barely started on the next.
 *
 * The cost is that the bar empties each time a reward lands. That is a feature — it is what makes
 * "nearly full" mean "nearly there" at every point on the ladder. */
export function currentLeg(xp: number, ladder: readonly LadderEntry[] = LADDER): RewardLeg | null {
  const nextIndex = ladder.findIndex((entry) => xp < entry.threshold);
  if (nextIndex === -1) return null;

  const target = ladder[nextIndex];
  const from = nextIndex === 0 ? 0 : ladder[nextIndex - 1].threshold;
  const span = target.threshold - from;

  return {
    from,
    to: target.threshold,
    reward: target.reward,
    remaining: target.threshold - xp,
    // The span guard has exactly one reachable path, and it is worth naming so nobody deletes it as
    // dead: when nextIndex > 0, findIndex guarantees from <= xp < to, so the span is strictly
    // positive. Only nextIndex === 0 can produce a zero span, and only if the first threshold is
    // itself <= 0. Degenerate, but a NaN there would reach CSS as `width: NaN%` and silently blank
    // the bar rather than throwing. The clamp is the everyday one: negative xp.
    progress: span <= 0 ? 1 : Math.min(1, Math.max(0, (xp - from) / span)),
  };
}

/** How many entries a ladder view shows at once.
 *
 * `TIMELINE_WINDOW` and `timelineWindow` below currently have no UI consumer — the strip that used
 * them was removed, and its replacement has not been built yet. They are kept rather than deleted
 * because they are the pure, tested answer to "where on the ladder does this founder stand", which
 * any replacement needs first. `unlocksFor` is the live part of this module: RoofProps and
 * plot-builds derive real decorations from it. */
export const TIMELINE_WINDOW = 5;

export interface TimelineEntry extends LadderEntry {
  earned: boolean;
  /** The one the founder is working toward — exactly one entry per window, unless the ladder is
   * entirely behind them. */
  isNext: boolean;
}

export interface Timeline {
  entries: TimelineEntry[];
  /** 0-1 along the window's rail, for the marker and the filled portion. */
  progress: number;
  /** XP still needed for the next entry, or null once the ladder is complete. */
  remaining: number | null;
}

/** A window of the ladder centred on where the founder stands.
 *
 * Keeping two earned entries behind them means the strip always shows something achieved — the
 * point of the thing is that rewards feel real, not hypothetical. The clamps handle both ends: a
 * new founder sees mostly parcels, one near the top sees mostly icons, and the window stays the
 * same size throughout so the layout never jumps. */
export function timelineWindow(xp: number, ladder: readonly LadderEntry[] = LADDER): Timeline {
  const nextIndex = ladder.findIndex((entry) => xp < entry.threshold);
  const complete = nextIndex === -1;
  const maxStart = Math.max(0, ladder.length - TIMELINE_WINDOW);
  const start = complete ? maxStart : Math.min(Math.max(nextIndex - 2, 0), maxStart);

  const entries = ladder.slice(start, start + TIMELINE_WINDOW).map((entry, index) => ({
    ...entry,
    earned: xp >= entry.threshold,
    isNext: !complete && start + index === nextIndex,
  }));

  return {
    entries,
    progress: railProgress(xp, entries),
    remaining: complete ? null : ladder[nextIndex].threshold - xp,
  };
}

/** Where the marker sits along the window, in 0-1.
 *
 * Nodes are evenly spaced rather than to scale — the real gaps run 100, 240, 390, 490, and spacing
 * to scale would crush the early ones together — so the marker interpolates within whichever slot
 * the founder currently occupies. */
function railProgress(xp: number, entries: readonly TimelineEntry[]): number {
  if (entries.length === 0) return 0;
  const step = 1 / (entries.length - 1 || 1);
  const nextIndex = entries.findIndex((entry) => !entry.earned);
  if (nextIndex === -1) return 1;
  if (nextIndex === 0) return 0;

  const from = entries[nextIndex - 1].threshold;
  const to = entries[nextIndex].threshold;
  const withinSlot = to === from ? 1 : (xp - from) / (to - from);
  return Math.min(1, Math.max(0, (nextIndex - 1 + withinSlot) * step));
}
