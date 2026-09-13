"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Modal } from "@/components/ui";
import type { CityDevelopment } from "@/lib/city/types";
import { shareImageAlt, xShareUrl, type PlotShareResult } from "@/lib/sharing/shared";
import styles from "./PlotShareModal.module.css";

export function PlotShareModal({ development, prepare, onClose }: {
  development: CityDevelopment;
  prepare(signal: AbortSignal): Promise<PlotShareResult>;
  onClose(): void;
}) {
  const [result, setResult] = useState<PlotShareResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [toast, setToast] = useState<{ message: string; id: number } | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(timer);
  }, [toast]);
  const [imageReady, setImageReady] = useState(false);
  const prepareRef = useRef(prepare);
  useEffect(() => { prepareRef.current = prepare; });
  useEffect(() => {
    const controller = new AbortController();
    // Defer one microtask so Strict Mode's discarded effect cannot start a duplicate upload.
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      try {
        const snapshot = await prepareRef.current(controller.signal);
        if (!controller.signal.aborted) setResult(snapshot);
      } catch (caught) {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Your image could not be prepared. Please retry.");
      }
    });
    return () => controller.abort();
  }, [attempt]);
  const ready = result && imageReady && !error;
  return <Modal labelledBy="plot-share-title" closeLabel="Close share preview" onClose={onClose}
    initialFocus="close" layout="panel" width="min(54rem, calc(100vw - 2rem))" zIndex={30} className={styles.modal}>
    {toast ? <div key={toast.id} role="status" className={styles.toast}>{toast.message}</div> : null}
    <h2 id="plot-share-title">Share your corner of the city</h2>
    {result ? <div className={styles.captionBox}>
      <p className={styles.caption}>“{result.caption}”</p>
      <button type="button" className={styles.copyButton} aria-label={copyStatus === "copied" ? "Copied!" : "Copy caption"} title="Copy caption" onClick={async () => {
        try {
          await navigator.clipboard.writeText(result.caption);
          if (copyTimer.current) clearTimeout(copyTimer.current);
          setCopyStatus("copied");
          setToast({ message: "Caption copied!", id: Date.now() });
          copyTimer.current = setTimeout(() => setCopyStatus("idle"), 500);
        } catch {
          setCopyStatus("failed");
          setToast({ message: "Could not copy. Select the caption to copy it manually.", id: Date.now() });
        }
      }}>
        <svg key={copyStatus} className={styles.copyIcon} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {copyStatus === "copied" ? <path d="m5 12 4 4L19 6" /> : <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4" /></>}
        </svg>
      </button>
    </div> : null}
    <div className={styles.preview} aria-busy={!ready && !error}>
      {result ? <Image key={`${result.shareId}-${attempt}`} src={`${result.imageUrl}${attempt ? `?retry=${attempt}` : ""}`}
        alt={shareImageAlt(development.founder.fullName, development.progression.xp)} width={1200} height={630} unoptimized
        onLoad={() => setImageReady(true)} onError={() => setError("Your image could not be loaded. Please retry.")} /> : null}
      {!ready && !error ? <span role="status" className={styles.preparing}>Preparing your share image…</span> : null}
    </div>
    {error ? <Alert>{error}</Alert> : null}
    <div className={styles.actions}>
      {ready ? <>
        <Button as="a" href={xShareUrl(result)} target="_blank" rel="noopener noreferrer">Share on X</Button>
        <Button as="a" variant="secondary" href={`${result.imageUrl}?download=1`} download={`indie-hackers-city-${result.shareId}.png`}>Download image</Button>
      </> : error ? <Button onClick={() => { setError(null); setImageReady(false); setAttempt((value) => value + 1); }}>Retry</Button> : <>
        <Button disabled>Share on X</Button><Button variant="secondary" disabled>Download image</Button>
      </>}
    </div>
  </Modal>;
}
