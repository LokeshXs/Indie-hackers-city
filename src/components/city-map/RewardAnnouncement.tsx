"use client";

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect } from "react";
import { Button, Overlay } from "@/components/ui";
import type { RewardAnnouncement as Announcement } from "@/lib/city/rewards";
import styles from "./RewardAnnouncement.module.css";

const FORMAT = new Intl.NumberFormat("en-US");
const EASE = [0.22, 1, 0.36, 1] as const;
const PARTICLE_COUNT = 80;
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
  const angle = (i / PARTICLE_COUNT) * Math.PI * 2;
  return { x: `${Math.cos(angle) * (22 + (i % 3) * 6)}vw`, y: `${Math.sin(angle) * (24 + (i % 3) * 5)}vh` };
});

function headline(achievements: Announcement["achievements"]) {
  if (achievements.length !== 1) return achievements.length ? "Look how far you’ve come" : "Your hard work paid off";
  const achievement = achievements[0];
  if (achievement.type.startsWith("users_")) return `You reached ${achievement.label.replace("+", "")}`;
  if (achievement.type.startsWith("revenue_")) return `You earned ${achievement.label.replace(" earned", "")}`;
  return achievement.label;
}

interface RewardAnnouncementProps {
  announcement: Announcement;
  onDismiss(): void;
}

/** One shared tween keeps earned XP and reward progress in step, without React renders per frame. */
export function RewardAnnouncement({ announcement, onDismiss }: RewardAnnouncementProps) {
  const {
    levelChanged, buildingLevel, xpGained, previousXpTotal, xpTotal, currentLevelXp, nextLevelXp, achievements,
  } = announcement;
  const still = Boolean(useReducedMotion());
  const earned = useMotionValue(still ? xpGained : 0);
  const count = useTransform(earned, (value) => `+${FORMAT.format(Math.round(value))}`);
  const hasNextLevel = nextLevelXp !== null && nextLevelXp > currentLevelXp;
  // The celebration always follows the building level that the founder finishes on. A level-up
  // therefore starts a fresh stretch (490 → 690 for level 2), while an ordinary reward fills the
  // current stretch (0 → 490 for level 1) without resetting at smaller cosmetic unlocks.
  const fill = useTransform(earned, (value) => {
    if (!hasNextLevel || nextLevelXp === null) return 1;
    return Math.min(1, Math.max(0,
      (previousXpTotal + value - currentLevelXp) / (nextLevelXp - currentLevelXp),
    ));
  });
  const nextLevel = buildingLevel + 1;
  const progressLabel = hasNextLevel ? `Level ${nextLevel} unlocks` : "All current levels unlocked";
  const progressDetail = hasNextLevel && nextLevelXp !== null
    ? `${FORMAT.format(Math.max(0, nextLevelXp - xpTotal))} XP to go`
    : "";

  useEffect(() => {
    earned.set(still ? xpGained : 0);
    if (still) return;
    const controls = animate(earned, xpGained, { duration: 2.4, delay: 0.3, ease: [0.3, 0, 0.3, 1] });
    return () => controls.stop();
  }, [earned, still, xpGained, previousXpTotal]);

  return (
    <Overlay containment="absolute" tone="reward" zIndex={10}>
      <div className={styles.effects} aria-hidden="true">
        <div className={styles.glow} />
          {!still && <div className={styles.particles}>{PARTICLES.map((particle, i) => (
            <motion.i key={i} className={styles.particle}
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
              animate={{ x: particle.x, y: particle.y, opacity: [0, 0.85, 0], scale: [0.4, 1, 0.5], rotate: i * 37 }}
              transition={{ duration: 2.3, delay: 0.5 + (i % 3) * 0.04, ease: "easeOut" }} />
          ))}</div>}
      </div>
      <motion.div
        className={styles.stage}
        role="dialog"
        aria-modal="true"
        aria-label={(levelChanged ? `Level ${buildingLevel}. ` : "")
          + `${FORMAT.format(xpGained)} XP awarded, for a total of ${FORMAT.format(xpTotal)}.`
          + (achievements.length ? ` Unlocked: ${achievements.map((a) => a.label).join(", ")}.` : "")}
        initial={still ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        <div className={styles.emblem} aria-hidden="true">
          <svg viewBox="0 0 48 48" fill="none">
            <path d="m24 5 5.6 11.4L42 18.2l-9 8.8 2.1 12.4L24 33.5l-11.1 5.9L15 27l-9-8.8 12.4-1.8L24 5Z" fill="currentColor" />
          </svg>
        </div>
        <header className={styles.heading}>
          <p className={styles.caption}>{achievements.length > 1 ? "Achievements unlocked" : achievements.length ? "Achievement unlocked" : "XP earned"}</p>
          <h2>{headline(achievements)}</h2>
          <p className={styles.message}>Every milestone builds your place in the city.</p>
        </header>

        <motion.div className={styles.reward} aria-hidden="true"
          initial={still ? false : { scale: 0.96 }} animate={{ scale: 1 }}
          transition={{ duration: 1.1, ease: EASE }}>
          <p className={styles.count}><motion.span>{count}</motion.span><span className={styles.unit}>XP</span></p>
          <span className={styles.earned}>Well earned.</span>
        </motion.div>

        <div className={styles.progress}>
          <div className={styles.progressHeading}>
            <strong>Level {buildingLevel}</strong><span>Total XP: {FORMAT.format(xpTotal)}</span>
          </div>
          {hasNextLevel && nextLevelXp !== null ? <>
            <div className={styles.track} role="progressbar" aria-label={`Progress toward ${progressLabel}`}
              aria-valuemin={currentLevelXp} aria-valuemax={nextLevelXp} aria-valuenow={Math.min(xpTotal, nextLevelXp)}>
              <motion.div className={styles.fill} style={{ scaleX: fill }} />
            </div>
            <div className={styles.legend}><span>{progressLabel}</span><span>{progressDetail}</span></div>
          </> : <p className={styles.completed}>All current levels unlocked</p>}
          {levelChanged && <motion.p className={styles.levelUp}
            initial={still ? false : { opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 2.7, duration: 0.3 }}>✦ Level {buildingLevel} unlocked</motion.p>}
        </div>
        <div className={styles.action}><Button onClick={onDismiss}>Continue</Button></div>
      </motion.div>
    </Overlay>
  );
}
