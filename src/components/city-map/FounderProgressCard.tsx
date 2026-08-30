"use client";

import type { RefObject } from "react";
import { getBuildingProgress } from "@/lib/city/progression";
import type { CityDevelopment } from "@/lib/city/types";
import styles from "./FounderProgressCard.module.css";

interface FounderProgressCardProps {
  development: CityDevelopment;
  buttonRef?: RefObject<HTMLButtonElement | null>;
  onViewBuilding(): void;
}

const XP_FORMATTER = new Intl.NumberFormat("en-US");

export function FounderProgressCard({
  development,
  buttonRef,
  onViewBuilding,
}: FounderProgressCardProps) {
  const { xp, buildingLevel } = development.progression;
  const progress = getBuildingProgress(development.progression);
  const progressCopy = progress.isMaximumLevel
    ? "Maximum building level"
    : progress.remainingXp !== null && progress.nextLevel !== null
      ? `${XP_FORMATTER.format(progress.remainingXp)} XP until Level ${progress.nextLevel}`
      : null;
  const accessibleProgress = progressCopy ? `, ${progressCopy}` : "";

  return (
    <button
      ref={buttonRef}
      type="button"
      className={styles.card}
      aria-label={`Level ${buildingLevel}, ${XP_FORMATTER.format(xp)} XP${accessibleProgress}. View my building.`}
      onClick={onViewBuilding}
    >
      <span className={styles.heading}>
        <span>Founder progress</span>
        <strong>Lvl {buildingLevel}</strong>
      </span>
      <span className={styles.xp}>{XP_FORMATTER.format(xp)} <small>XP</small></span>
      {progress.requiredWithinLevel !== null || progress.isMaximumLevel ? (
        <span className={styles.track} aria-hidden="true">
          <span style={{ width: `${progress.percentage}%` }} />
        </span>
      ) : null}
      {progressCopy ? <span className={styles.next}>{progressCopy}</span> : null}
      <span className={styles.action}>View my building <span aria-hidden="true">→</span></span>
    </button>
  );
}
