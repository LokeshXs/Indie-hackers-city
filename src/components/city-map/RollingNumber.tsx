"use client";

import {
  animate, motion, useMotionValue, useTransform,
  type MotionValue, type ValueAnimationTransition,
} from "motion/react";
import { useEffect } from "react";
import styles from "./RollingNumber.module.css";

// The repeated zero keeps the window filled as a wheel rolls over from nine.
const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

/** Hoisted rather than written as a default parameter: an object literal in the signature is a new
 * reference on every render, and the effect that drives the wheels has it in its dependencies. */
const DEFAULT_ROLL: ValueAnimationTransition<number> = { type: "spring", duration: 2, bounce: 0.3 };

/** Higher wheels move only while the lower places carry into them. At every integer total,
 * each wheel rests on a whole digit instead of retaining a fraction of the lower places. */
function Wheel({ progress, place }: { progress: MotionValue<number>; place: number }) {
  const y = useTransform(progress, (value) => {
    const current = Math.max(value, 0);
    const digit = Math.floor(current / place) % 10;
    const carry = Math.max(0, (current % place) - (place - 1));
    return `${-(digit + carry)}em`;
  });

  return (
    <span className={styles.slot}>
      <motion.span className={styles.column} style={{ y }}>
        {DIGITS.map((digit, index) => <span key={index} className={styles.cell}>{digit}</span>)}
      </motion.span>
    </span>
  );
}

/** Place values from the highest down to the units: 490 becomes [100, 10, 1]. */
function placesFor(value: number): number[] {
  const width = Math.max(1, Math.floor(Math.abs(value)).toString().length);
  return Array.from({ length: width }, (_, index) => 10 ** (width - 1 - index));
}

interface RollingNumberProps {
  value: number;
  /** Seconds to wait before the wheels start turning, so the roll can be cued after the reveal. */
  delay?: number;
  /** How the wheels travel. The caller owns this because the roll has to sit inside the reveal
   * sequence it belongs to, not set its own pace. */
  transition?: ValueAnimationTransition<number>;
  /** Skips the roll entirely and renders the figure at rest. */
  still?: boolean;
  className?: string;
}

/** Counts up from zero on spinning wheels, overshooting slightly and settling back.
 *
 * The whole thing is aria-hidden: ten digits per slot is nonsense to a screen reader, and a value
 * changing sixty times a second is worse. The figure travels in the announcement's dialog label
 * instead, stated once. */
export function RollingNumber({
  value,
  delay = 0,
  transition = DEFAULT_ROLL,
  still = false,
  className,
}: RollingNumberProps) {
  const progress = useMotionValue(still ? value : 0);

  useEffect(() => {
    if (still) {
      progress.set(value);
      return;
    }
    // A spring rather than a tween: the overshoot past the target and the settle back are the
    // bounce, and they cost nothing to get right this way.
    const controls = animate(progress, value, { ...transition, delay });
    return () => controls.stop();
  }, [delay, progress, still, transition, value]);

  return (
    <span className={[styles.number, className].filter(Boolean).join(" ")} aria-hidden="true" data-value={value}>
      {placesFor(value).map((place) => <Wheel key={place} progress={progress} place={place} />)}
    </span>
  );
}
