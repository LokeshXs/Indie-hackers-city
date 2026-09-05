"use client";

import Image from "next/image";
import type { CSSProperties, RefObject } from "react";
import { currentLeg } from "@/lib/city/unlocks";
import type { CityDevelopment } from "@/lib/city/types";
import styles from "./FounderProgressCard.module.css";

interface FounderProgressCardProps {
  development: CityDevelopment;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  onViewBuilding(): void;
}

const XP_FORMATTER = new Intl.NumberFormat("en-US");

/** Baked from the same GLB the reward models use, by scripts/ui/render-reward-sprite.py. A marker
 * that never moves does not earn a WebGL context of its own. */
const GIFT_MARKER = "/assets/ui/reward-gift-marker.png";

/** Stands in on the three ladder rungs that have a threshold but no reward designed yet, so the
 * block keeps its shape instead of showing a blank line. */
const UNNAMED_REWARD = "A new reward";

/** The founder's own standing, and what their XP is buying next.
 *
 * The bar measures the stretch between the reward last earned and the next one — not building
 * level, which renders identically at every level, and not total XP, which makes a fresh leg look
 * two-thirds done. Crossing a reward threshold visibly changes the building: lights appear on the
 * roof, the billboard starts scrolling. That is what is worth measuring. */
export function FounderProgressCard({
  development,
  buttonRef,
  onViewBuilding,
}: FounderProgressCardProps) {
  const { xp, buildingLevel } = development.progression;
  const leg = currentLeg(xp);
  const rewardName = leg ? leg.reward?.label ?? UNNAMED_REWARD : null;

  return (
    <button
      ref={buttonRef}
      type="button"
      className={styles.card}
      aria-label={`Level ${buildingLevel}, ${XP_FORMATTER.format(xp)} XP.${
        leg ? ` Next reward ${rewardName}, ${XP_FORMATTER.format(leg.remaining)} XP to go.` : ""
      } View my building.`}
      onClick={onViewBuilding}
    >
      <span className={styles.heading}>
        <span>Founder progress</span>
        <strong>Lvl {buildingLevel}</strong>
      </span>

      {/* No space between figure and unit: the gap is a baseline-aligned flex gap, so the unit's
          own letter-spacing cannot add to it. */}
      <span className={styles.xp}>{XP_FORMATTER.format(xp)}<small>XP</small></span>

      {/* Dropped once every rung is behind the founder. A full bar with nothing past it invites the
          question of what comes next, and the honest answer is "nothing yet".

          Hidden from assistive tech rather than given role="progressbar": it sits inside a button,
          whose accessible name computation flattens its contents anyway, so the reward and the
          distance travel in the label above instead. */}
      {leg ? (
        <span className={styles.reward} aria-hidden="true">
          <Image className={styles.marker} src={GIFT_MARKER} alt="" width={42} height={42} unoptimized />
          <span className={styles.rewardText}>
            <span className={styles.eyebrow}>Next reward</span>
            <strong className={styles.rewardName}>{rewardName}</strong>
          </span>

          <span className={styles.track}>
            <span className={styles.trackWell}>
              <span className={styles.fill} style={{ "--fill": `${leg.progress * 100}%` } as CSSProperties} />
            </span>
          </span>

          <span className={styles.legend}>
            <span className={styles.remaining}>{XP_FORMATTER.format(leg.remaining)} XP to go</span>
            <span className={styles.target}>{XP_FORMATTER.format(leg.to)} XP</span>
          </span>
        </span>
      ) : null}

      <span className={styles.action}>View my building <span aria-hidden="true">→</span></span>
    </button>
  );
}
