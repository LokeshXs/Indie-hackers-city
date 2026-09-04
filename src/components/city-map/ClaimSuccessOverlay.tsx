"use client";

import type { RefObject } from "react";
import { Button, Overlay } from "@/components/ui";
import styles from "./ClaimSuccessOverlay.module.css";

const CONFETTI_COUNT = 24;

const CLAIM_DATE_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/** Builds the serrated outer ring: points alternating between two radii, the way a rubber stamp's
 * edge is cut. Generated rather than hand-authored so the tooth count stays adjustable. */
function serratedRing(centre: number, outer: number, inner: number, teeth: number): string {
  const points: string[] = [];
  const total = teeth * 2;
  for (let index = 0; index < total; index += 1) {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    const radius = index % 2 === 0 ? outer : inner;
    points.push(`${(centre + Math.cos(angle) * radius).toFixed(2)},${(centre + Math.sin(angle) * radius).toFixed(2)}`);
  }
  return `M${points.join("L")}Z`;
}

const SERRATED_RING = serratedRing(60, 58, 52, 38);

function DeedStamp() {
  return (
    <svg className={styles.stamp} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        {/* A little turbulence roughens every edge at once, standing in for the ink bleed and
            broken coverage of a stamp pressed by hand. */}
        <filter id="deed-stamp-ink">
          <feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>

      <g filter="url(#deed-stamp-ink)" fill="none" stroke="currentColor">
        <path d={SERRATED_RING} strokeWidth="3.4" strokeLinejoin="round" />
        <circle cx="60" cy="60" r="47" strokeWidth="2.4" />
        <circle cx="60" cy="60" r="40" strokeWidth="1.1" />

        {/* The banner: the word set on a diagonal between two rules, as on the reference. */}
        <g transform="rotate(-18 60 60)">
          <line x1="19" y1="50" x2="101" y2="50" strokeWidth="2.2" />
          <line x1="19" y1="70" x2="101" y2="70" strokeWidth="2.2" />
          <text className={styles.stampWord} x="60" y="64" textAnchor="middle" fill="currentColor" stroke="none">Claimed</text>
        </g>

        <g fill="currentColor" stroke="none" className={styles.stampStar}>
          <text x="14.5" y="63" textAnchor="middle">★</text>
          <text x="105.5" y="63" textAnchor="middle">★</text>
        </g>
      </g>
    </svg>
  );
}

interface ClaimSuccessOverlayProps {
  districtName: string;
  plotLabel: string;
  founderName: string;
  projectName: string;
  claimedAt: string;
  actionRef: RefObject<HTMLButtonElement | null>;
  onViewBuilding: () => void;
}

/** The deed of claim.
 *
 * Deliberately not a Modal. Run it through Modal's props and every one has to be switched off: it
 * takes no focus, ignores Escape, cannot be dismissed by the backdrop, traps nothing and has no
 * close button — because it has no close path at all. It leaves by clicking its own button on a
 * timer, which also flies the camera to the building and opens the project card. That is a state
 * transition, not a dismissal, so it shares only the backdrop with the real modals.
 *
 * Known issue, left alone on purpose: `role="dialog" aria-modal="true"` on something that never
 * receives focus and cannot be dismissed is a lie to a screen reader. `role="status"` is the honest
 * answer, but changing it moves the accessible name that CityMap3D.test.tsx queries, so it belongs
 * in its own reviewed change rather than riding along with a redesign. */
export function ClaimSuccessOverlay({
  districtName,
  plotLabel,
  founderName,
  projectName,
  claimedAt,
  actionRef,
  onViewBuilding,
}: ClaimSuccessOverlayProps) {
  return (
    <Overlay containment="absolute" tone="success" zIndex={9}>
      <article className={styles.deed} role="dialog" aria-modal="true" aria-label="Plot claimed successfully">
        <div className={styles.confetti} aria-hidden="true">
          {Array.from({ length: CONFETTI_COUNT }, (_, index) => (
            <i
              key={index}
              style={{ left: `${4 + ((index * 19) % 92)}%`, animationDelay: `${(index % 8) * -0.18}s` }}
            />
          ))}
        </div>

        <header className={styles.masthead}>
          <p className={styles.district}>{districtName}</p>
          <h2 className={styles.title}>Deed of Claim</h2>
        </header>

        <hr className={styles.rule} />

        <dl className={styles.record}>
          <dt>Plot</dt>
          <dd>{plotLabel}</dd>
          <dt>Founder</dt>
          <dd>{founderName}</dd>
          <dt>Project</dt>
          <dd>{projectName}</dd>
          <dt>Claimed</dt>
          <dd>{CLAIM_DATE_FORMAT.format(new Date(claimedAt))}</dd>
        </dl>

        <div className={styles.foot}>
          <Button ref={actionRef} className={styles.action} onClick={onViewBuilding}>
            View my building <span aria-hidden="true">→</span>
          </Button>
          <DeedStamp />
        </div>
      </article>
    </Overlay>
  );
}
