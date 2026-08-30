"use client";

import { useEffect, useMemo, useState } from "react";
import { useProgress } from "@react-three/drei";
import styles from "./CityLoadingScreen.module.css";

const MINIMUM_INTRO_MS = 1800;
const READY_HOLD_MS = 220;
const EXIT_MS = 350;

export type CityLoadingPhase = "loading" | "ready" | "exiting" | "hidden" | "error";

export interface CityLoadingScreenProps {
  sceneReady: boolean;
  assetError: Error | null;
  onComplete: () => void;
  onRetry: () => void;
}

export function getCityLoadingStage(progress: number, waitingForFrame = false): string {
  if (progress >= 100) return waitingForFrame ? "Preparing your first view…" : "City ready";
  if (progress >= 90) return "Lighting the district…";
  if (progress >= 70) return "Raising landmarks…";
  if (progress >= 45) return "Preparing founder plots…";
  if (progress >= 20) return "Laying the city roads…";
  return "Surveying the shoreline…";
}

export function CityLoadingScreen({
  sceneReady,
  assetError,
  onComplete,
  onRetry,
}: CityLoadingScreenProps) {
  const active = useProgress((state) => state.active);
  const rawProgress = useProgress((state) => state.progress);
  const total = useProgress((state) => state.total);
  const loaderErrors = useProgress((state) => state.errors);
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [phase, setPhase] = useState<CityLoadingPhase>("loading");

  const progress = useMemo(() => {
    if (sceneReady && !active && total === 0) return 100;
    return Math.round(Math.max(0, Math.min(100, rawProgress)));
  }, [active, rawProgress, sceneReady, total]);
  const hasError = Boolean(assetError || loaderErrors.length);
  const assetsReady = !active && (progress >= 100 || (sceneReady && total === 0));
  const visiblePhase: CityLoadingPhase = hasError ? "error" : phase;
  const stage = visiblePhase === "ready" || visiblePhase === "exiting"
    ? "City ready"
    : getCityLoadingStage(progress, progress >= 100 && !sceneReady);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumElapsed(true), MINIMUM_INTRO_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (phase !== "loading" || !minimumElapsed || !assetsReady || !sceneReady) return;
    const timer = window.setTimeout(() => setPhase("ready"), 0);
    return () => window.clearTimeout(timer);
  }, [assetsReady, minimumElapsed, phase, sceneReady]);

  useEffect(() => {
    if (phase !== "ready") return;
    const timer = window.setTimeout(() => setPhase("exiting"), READY_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== "exiting") return;
    const timer = window.setTimeout(() => {
      setPhase("hidden");
      onComplete();
    }, EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [onComplete, phase]);

  if (visiblePhase === "hidden") return null;

  if (visiblePhase === "error") {
    return (
      <section className={styles.screen} data-phase="error" role="alert">
        <div className={styles.errorMark} aria-hidden="true">!</div>
        <p className={styles.kicker}>Indie Hackers City</p>
        <h1>The city couldn’t finish loading</h1>
        <p className={styles.errorCopy}>One or more map assets could not be downloaded.</p>
        <button className={styles.retryButton} type="button" onClick={onRetry}>Try again</button>
      </section>
    );
  }

  return (
    <section
      className={`${styles.screen} ${visiblePhase === "exiting" ? styles.exiting : ""}`}
      data-phase={visiblePhase}
      role="status"
      aria-label="Loading Indie Hackers City"
    >
      <div className={styles.content}>
        <header className={styles.brand}>
          <span className={styles.brandDiamond} aria-hidden="true">◆</span>
          <p>Welcome to</p>
          <h1>Indie Hackers City</h1>
        </header>

        <div className={styles.loadingReadout}>
          <div className={styles.stageRow} aria-live="polite">
            <strong>{stage}</strong>
            <span>{visiblePhase === "ready" || visiblePhase === "exiting" ? "100" : progress}%</span>
          </div>
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-label={stage}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={visiblePhase === "ready" || visiblePhase === "exiting" ? 100 : progress}
          >
            <span style={{ width: `${visiblePhase === "ready" || visiblePhase === "exiting" ? 100 : progress}%` }} />
          </div>
          <p>Building a place for independent makers.</p>
        </div>
      </div>
    </section>
  );
}
