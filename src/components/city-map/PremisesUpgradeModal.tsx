"use client";

import Image from "next/image";
import { useState } from "react";
import { Alert, Button, Modal, VisuallyHidden, XpFigure } from "@/components/ui";
import type { CityDevelopment, LevelTwoBuildingAssetId } from "@/lib/city/types";
import { LADDER, unlocksFor } from "@/lib/city/unlocks";
import { cn } from "@/lib/ui/cn";
import { BuildingPreview, PreviewStage } from "./ModelPreview";
import styles from "./PremisesUpgradeModal.module.css";

/** The same sprite the founder progress card marks the next reward with, so the thing they have
 * been watching creep closer is the thing that greets them here. */
const GIFT_MARKER = "/assets/ui/reward-gift-marker.png";

/** The named rungs, in ladder order. The three placeholder rungs above 490 carry no reward yet and
 * are left out: this block is what the founder has earned, not what is still owed. */
const REWARD_RUNGS = LADDER.flatMap((entry) => (entry.reward ? [{ ...entry.reward, threshold: entry.threshold }] : []));

const XP_FORMATTER = new Intl.NumberFormat("en-US");

/** The premises the 490 XP reward offers, in the order the carousel steps through them. */
const PREMISES: ReadonlyArray<{ assetId: LevelTwoBuildingAssetId; label: string; description: string }> = [
  {
    assetId: "slat-studio-level-2",
    label: "Slat Studio",
    description: "A timber-clad studio behind a full wall of glass, with a deck and a stepped roofline.",
  },
  {
    assetId: "teal-brow-level-2",
    label: "Teal Brow",
    description: "Two storeys in stone and teal — a glazed conference room upstairs over a recessed porch.",
  },
];

interface PremisesUpgradeModalProps {
  development: CityDevelopment;
  onClose(): void;
  onUpgraded(development: CityDevelopment): void;
}

/** Redeems the "A bigger building" reward at 490 XP.
 *
 * Deliberately has no dismissal that sticks: nothing records that a founder has seen this, so it
 * reopens on the next load until they actually choose. The predicate that mounts it lives in
 * CityMap3D and reads the asset id -- choosing writes a level-2 id, and that write is the only
 * thing that stops the modal coming back. There is no "seen" flag anywhere to go stale. */
export function PremisesUpgradeModal({ development, onClose, onUpgraded }: PremisesUpgradeModalProps) {
  const [index, setIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choice = PREMISES[index];
  const unlocks = unlocksFor(development.progression.xp);

  function browse(direction: -1 | 1) {
    setIndex((current) => (current + direction + PREMISES.length) % PREMISES.length);
  }

  async function confirm() {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/plot-claim/premises", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buildingAssetId: choice.assetId }),
      });
      const payload = await response.json() as {
        development?: CityDevelopment;
        error?: { code?: string; message?: string };
      };
      if (!response.ok || !payload.development) {
        throw new Error(payload.error?.message || "Your new premises could not be built.");
      }
      onUpgraded(payload.development);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Your new premises could not be built.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      containment="absolute"
      layout="surface"
      width="min(78rem, 100%)"
      zIndex={20}
      label="Choose your new premises"
      busy={isSaving}
      closeLabel="Close premises chooser"
      initialFocus={false}
      onClose={onClose}
    >
      <Modal.Split previewColumn="minmax(0, 1.15fr)" actionColumn="minmax(22rem, 0.85fr)">
        <Modal.Preview label="Rotating preview of your new premises">
          <div className={styles.previewInfo}>
            <strong className={styles.previewBuildingName}>{choice.label}</strong>
            <p className={styles.previewEyebrow}><span aria-hidden="true">◆</span>Level 2 premises</p>
          </div>
          <PreviewStage className={styles.previewCanvas}>
            {/* Keyed so the turntable restarts on each step. */}
            <BuildingPreview key={choice.assetId} assetId={choice.assetId} />
          </PreviewStage>
          <Button variant="secondary" icon className={styles.previewArrowLeft} aria-label="Previous premises" onClick={() => browse(-1)}>‹</Button>
          <Button variant="secondary" icon className={styles.previewArrowRight} aria-label="Next premises" onClick={() => browse(1)}>›</Button>
          <div className={styles.previewDots} aria-label={`${index + 1} of ${PREMISES.length}`}>
            {PREMISES.map((option) => (
              <span key={option.assetId} className={option.assetId === choice.assetId ? styles.previewDotActive : undefined} />
            ))}
          </div>
        </Modal.Preview>
        <Modal.Pane className={styles.pane}>
          {/* The moment first. This is the payoff for a reward the founder has been watching
              approach on their progress card, and the old pane opened on a generic heading. */}
          <header className={styles.reward}>
            <Image className={styles.marker} src={GIFT_MARKER} alt="" width={42} height={42} unoptimized />
            <span className={styles.rewardText}>
              <span className={styles.eyebrow}>Reward unlocked</span>
              {/* Their own total, not the 490 threshold -- the rung is named in the ladder below. */}
              <XpFigure xp={development.progression.xp} />
            </span>
          </header>

          <section className={styles.earned}>
            <h3 className={styles.eyebrow}>What you have earned</h3>
            <ul className={styles.rungs}>
              {REWARD_RUNGS.map((rung) => {
                // levelTwo is the rung being spent right now; the rest are read from xp rather
                // than assumed, so the list stays honest if the ladder is ever reordered.
                const isCurrent = rung.key === "levelTwo";
                const isEarned = unlocks[rung.key];
                return (
                  <li key={rung.key} className={cn(styles.rung, isCurrent && styles.rungCurrent, !isEarned && styles.rungLocked)}>
                    <span className={styles.rungMark} aria-hidden="true">{isCurrent ? "◆" : isEarned ? "✓" : "·"}</span>
                    <VisuallyHidden>{isCurrent ? "Ready to claim:" : isEarned ? "Earned:" : "Not yet earned:"}</VisuallyHidden>
                    <span className={styles.rungLabel}>{rung.label}</span>
                    <span className={styles.rungXp}>{XP_FORMATTER.format(rung.threshold)} XP</span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className={styles.choice}>
            <strong className={styles.choiceName}>{choice.label}</strong>
            <p className={styles.description}>{choice.description}</p>
          </section>

          <div className={styles.actions}>
            <Button size="lg" block disabled={isSaving} onClick={confirm}>
              {isSaving ? "Building…" : `Move into the ${choice.label}`}
            </Button>
            <p className={styles.permanentNote}>This choice is permanent — your building keeps everything you have earned.</p>
          </div>
          {error ? <Alert>{error}</Alert> : null}
        </Modal.Pane>
      </Modal.Split>
    </Modal>
  );
}
