"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Modal } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { condenseTimeline, loadPublicTimeline, type PublicMilestone } from "@/lib/city/timeline";
import { normalizeWebsite } from "@/lib/city/validation";
import type { CityDevelopment } from "@/lib/city/types";
import styles from "./VisitorPlotCard.module.css";

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
function displayDate(value: string) { return DATE_FORMAT.format(new Date(value)); }

const XP_FORMAT = new Intl.NumberFormat("en-US");

function AnimatedXp({ xp }: { xp: number }) {
  const numberRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const number = numberRef.current;
    if (!number) return;
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const finish = () => { cancelAnimationFrame(frame); number.textContent = XP_FORMAT.format(xp); };
    if (media?.matches) { finish(); return; }
    const start = performance.now();
    number.textContent = "0";
    function tick(now: number) {
      const progress = Math.min(Math.max((now - start) / 2400, 0), 1);
      if (number) number.textContent = XP_FORMAT.format(Math.round(xp * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    media?.addEventListener("change", finish);
    return () => { cancelAnimationFrame(frame); media?.removeEventListener("change", finish); };
  }, [xp]);
  return <p className={styles.xp} aria-label={`${XP_FORMAT.format(xp)} city XP`}>
    <span ref={numberRef} aria-hidden="true">{XP_FORMAT.format(xp)}</span><span className={styles.xpUnit} aria-hidden="true">XP</span>
  </p>;
}

const MILESTONE_ASSETS: Partial<Record<PublicMilestone["category"], string>> = {
  claim: "/assets/timeline_modal_assets/plot_claim.png",
  launch: "/assets/timeline_modal_assets/product_launch.png",
  users: "/assets/timeline_modal_assets/users_gained.png",
  revenue: "/assets/timeline_modal_assets/revenue_earned.png",
};

function MilestoneIcon({ category }: { category: PublicMilestone["category"] }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source = MILESTONE_ASSETS[category];
  if (source && failedSource !== source) {
    return <Image src={source} alt="" width={48} height={48} sizes="48px" className={styles.milestoneImage} onError={() => setFailedSource(source)} />;
  }
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {category === "users" ? <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2" /></>
      : category === "revenue" ? <><circle cx="12" cy="12" r="9" /><path d="M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9m3-10v12" /></>
      : category === "launch" ? <><path d="M9 15c-3-7 5-12 11-11 1 6-4 14-11 11Zm0 0-4 4m2-9-4 1v5l5-1m6 2-1 4h-5l1-5" /><circle cx="15" cy="9" r="2" /></>
      : <><path d="M5 21V3m0 1h14l-3 4 3 4H5" /></>}
  </svg>;
}

export function VisitorPlotCard({ development, onClose }: { development: CityDevelopment; onClose(): void }) {
  const [milestones, setMilestones] = useState<PublicMilestone[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await loadPublicTimeline(getSupabaseBrowserClient(), development.ownerId, development.claimedAt);
        if (!cancelled) { setMilestones(result); setFailed(false); }
      } catch { if (!cancelled) setFailed(true); }
    })();
    return () => { cancelled = true; };
  }, [development.ownerId, development.claimedAt, attempt]);

  function expand() {
    setExpanded(true);
    requestAnimationFrame(() => toggleRef.current?.focus({ preventScroll: true }));
  }
  function collapse() {
    setExpanded(false);
    requestAnimationFrame(() => {
      timelineRef.current?.scrollTo?.({ left: 0 });
      timelineRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    });
  }
  const items = milestones ? condenseTimeline(milestones, expanded) : [];
  const website = normalizeWebsite(development.project.websiteUrl);
  const initials = development.founder.fullName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => Array.from(part)[0]).join("");

  return <Modal closeLabel="Close founder profile" onClose={onClose} labelledBy="visitor-founder-name" containment="fixed" layout="surface" zIndex={32} width="min(78rem, 100%)" className={styles.modal} initialFocus="close">
    <div className={styles.content}>
      <header className={styles.profile}>
        <div className={styles.identity}>
          <span className={styles.avatar}>
            {development.founder.avatarUrl && !avatarFailed ? <Image src={development.founder.avatarUrl} alt="" width={64} height={64} unoptimized onError={() => setAvatarFailed(true)} /> : initials}
          </span>
          <div className={styles.nameBlock}>
            <h2 id="visitor-founder-name">{development.founder.fullName}</h2>
            <div className={styles.profileLinks}>
              {development.founder.xHandle ? <>
                <a href={`https://x.com/${encodeURIComponent(development.founder.xHandle.replace(/^@/, ""))}`} target="_blank" rel="noopener noreferrer" className={styles.social}>
                  @{development.founder.xHandle.replace(/^@/, "")}
                </a>
                <span className={styles.linkSeparator} aria-hidden="true">|</span>
              </> : null}
        {website ? <a href={website} target="_blank" rel="noopener noreferrer" className={styles.projectLink}>
          {development.project.name}<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M14 3h7v7m0-7L10 14M10 3H4v17h17v-6" /></svg>
        </a> : <strong className={styles.projectLink}>{development.project.name}</strong>}
            </div>
          </div>
        </div>
        {development.founder.bio ? <p className={styles.bio}>{development.founder.bio}</p> : null}
      </header>

      <section className={styles.journey} aria-label="Founder journey">
        {failed ? <div className={styles.feedback} role="status">The journey couldn’t be loaded. <button className={styles.linkButton} onClick={() => { setFailed(false); setAttempt((value) => value + 1); }}>Try again</button></div>
          : !milestones ? <div className={styles.skeleton} role="status" aria-label="Loading founder journey"><span /><span /><span /></div>
          : <>
            <div ref={timelineRef} className={styles.timelineScroll} tabIndex={0} aria-label="Achievement timeline, scroll for more milestones">
              <ol id="visitor-timeline" className={`${styles.timeline} ${expanded ? styles.expanded : ""}`}>
                {items.map((item, index) => <li key={item.id} className={styles.stop} style={{ "--delay": `${(index + 0.5) / items.length * 2800}ms` } as CSSProperties}>
                  {"hidden" in item ? <button className={styles.gap} aria-expanded={false} aria-controls="visitor-timeline" aria-label={`Show ${item.hidden} more milestones`} onClick={expand}><strong>···</strong><span>{item.hidden} more</span></button>
                    : <><span className={styles.dot} /><article className={styles.milestone}>
                      <span className={styles.milestoneIcon}><MilestoneIcon category={item.category} /></span>
                      <strong>{item.label}</strong>
                      {item.projectName ? <span className={styles.projectName}>{item.projectName}</span> : null}
                      <time dateTime={item.date}>{displayDate(item.date)}</time>
                    </article></>}
                </li>)}
              </ol>
            </div>
            {expanded ? <button ref={toggleRef} className={styles.linkButton} aria-expanded={true} aria-controls="visitor-timeline" onClick={collapse}>Show less</button> : null}
          </>}
      </section>

      <section className={styles.showcase} aria-label="Founder XP">
        <AnimatedXp xp={development.progression.xp} />
      </section>

    </div>
  </Modal>;
}
