"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { BUILDING_COLOR_OPTIONS, X_HANDLE_PATTERN } from "@/lib/city/constants";
import type { CityDevelopment, ProjectType, StartupBuildingAssetId } from "@/lib/city/types";
import { contrastRatio } from "./billboard-texture";
import { BillboardPreview, BuildingPreview, PreviewStage } from "./ModelPreview";
import styles from "./ProjectCard.module.css";

const BUILDINGS: ReadonlyArray<{ value: StartupBuildingAssetId; label: string }> = [
  { value: "startup-building-level-1", label: "Startup Shop" },
  { value: "corner-studio-level-1", label: "Corner Studio" },
  { value: "indie-garage-level-1", label: "Garage" },
];

const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  website: "Website",
  app: "App",
  "chrome-extension": "Chrome extension",
};

/** The three panes the card swaps between. All of them share the same shell and preview stage. */
type CardMode = "view" | "details" | "billboard";

interface ProjectCardProps {
  development: CityDevelopment;
  address: string;
  currentUserId?: string;
  onClose(): void;
  onUpdated(development: CityDevelopment): void;
}

export function ProjectCard({ development, address, currentUserId, onClose, onUpdated }: ProjectCardProps) {
  const isOwner = currentUserId === development.ownerId;
  const [mode, setMode] = useState<CardMode>("view");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState(development.founder.fullName);
  const [xHandle, setXHandle] = useState(development.founder.xHandle ?? "");
  const [projectName, setProjectName] = useState(development.project.name);
  const [websiteUrl, setWebsiteUrl] = useState(development.project.websiteUrl);
  const [projectType, setProjectType] = useState(development.project.type);
  const [assetId, setAssetId] = useState(development.building.assetId);
  const [color, setColor] = useState(development.building.color);
  const [billboardTextColor, setBillboardTextColor] = useState(development.billboard.textColor);
  const [billboardBackgroundColor, setBillboardBackgroundColor] = useState(development.billboard.backgroundColor);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  // The board paints the live project name, so a rename made in the details pane is already
  // showing by the time the billboard designer opens.
  const billboardCard = useMemo(() => ({
    name: projectName.trim() || "Untitled",
    textColor: billboardTextColor,
    backgroundColor: billboardBackgroundColor,
  }), [projectName, billboardTextColor, billboardBackgroundColor]);

  const billboardContrastWarning = contrastRatio(billboardTextColor, billboardBackgroundColor) < 3
    ? "These colors are close together — the name may be hard to read."
    : null;

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (mode !== "view") firstFieldRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isSaving, onClose]);

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const normalizedHandle = xHandle.trim().replace(/^@/, "");
    if (!fullName.trim() || !X_HANDLE_PATTERN.test(normalizedHandle)) {
      setError("Check the founder name and X handle.");
      return;
    }

    // The RPC behind PATCH replaces the whole showcased project, so every pane sends all nine
    // fields — a billboard-only save still has to carry the founder and building values.
    const formData = new FormData();
    formData.set("fullName", fullName.trim());
    formData.set("xHandle", normalizedHandle);
    formData.set("projectName", projectName.trim());
    formData.set("websiteUrl", websiteUrl.trim());
    formData.set("projectType", projectType);
    formData.set("buildingAssetId", assetId);
    formData.set("buildingColor", color);
    formData.set("billboardTextColor", billboardTextColor);
    formData.set("billboardBackgroundColor", billboardBackgroundColor);

    setIsSaving(true);
    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(development.project.id)}`, {
        method: "PATCH",
        body: formData,
      });
      const payload = await response.json() as {
        development?: CityDevelopment;
        error?: { code?: string; message?: string };
      };
      if (!response.ok || !payload.development) throw new Error(payload.error?.message || "The project could not be updated.");
      onUpdated(payload.development);
      setMode("view");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The project could not be updated.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={styles.backdrop} onMouseDown={(event) => event.currentTarget === event.target && !isSaving && onClose()}>
      <article className={styles.card} role="dialog" aria-modal="true" aria-labelledby="project-card-title">
        <button ref={closeButtonRef} className={styles.close} type="button" aria-label="Close project card" disabled={isSaving} onClick={onClose}>×</button>
        <div className={styles.surface}>
          <div className={styles.previewPane}>
            {/* Preview only — every word lives in the action pane. The narrower 40% column needs
                a smaller framing than the claim modal's default zoom. */}
            <PreviewStage className={styles.previewCanvas} zoom={36}>
              {mode === "billboard"
                ? <BillboardPreview card={billboardCard} />
                : <BuildingPreview key={assetId} assetId={assetId} buildingColor={color} />}
            </PreviewStage>
          </div>

          <div className={styles.actionPane}>
            {mode === "view" ? (
              <div className={styles.pane}>
                <div className={styles.identity}>
                  <p className={styles.label}>{PROJECT_TYPE_LABELS[development.project.type]}</p>
                  <h2 id="project-card-title">{development.project.name}</h2>
                  <p className={styles.founder}>
                    Founded by {development.founder.fullName}
                    {development.founder.xHandle ? (
                      <>
                        <span aria-hidden="true"> · </span>
                        <a href={`https://x.com/${encodeURIComponent(development.founder.xHandle)}`} target="_blank" rel="noopener noreferrer">
                          @{development.founder.xHandle}
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className={styles.progressionStamp} aria-label={`Building Level ${development.progression.buildingLevel}, ${development.progression.xp} city XP`}>
                  <span><small>Building level</small><strong>{development.progression.buildingLevel}</strong></span>
                  <i aria-hidden="true" />
                  <span><small>City XP</small><strong>{new Intl.NumberFormat("en-US").format(development.progression.xp)}</strong></span>
                </div>
                <dl className={styles.details}>
                  <div><dt className={styles.label}>Location</dt><dd>{address}</dd></div>
                  <div><dt className={styles.label}>Building</dt><dd>{BUILDINGS.find((item) => item.value === development.building.assetId)?.label}</dd></div>
                  <div><dt className={styles.label}>Claimed</dt><dd>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(development.claimedAt))}</dd></div>
                </dl>
                <div className={styles.actions}>
                  <a className={styles.primaryButton} href={development.project.websiteUrl} target="_blank" rel="noopener noreferrer">Visit project <span aria-hidden="true">↗</span></a>
                  {isOwner ? (
                    <div className={styles.ownerActions}>
                      <button className={styles.secondaryButton} type="button" onClick={() => { setError(null); setMode("details"); }}>Edit project</button>
                      <button className={styles.secondaryButton} type="button" onClick={() => { setError(null); setMode("billboard"); }}>Edit billboard</button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : mode === "details" ? (
              <form className={styles.pane} onSubmit={saveProject} aria-busy={isSaving}>
                <div className={styles.stepIntro}><strong id="project-card-title">Edit your project</strong><span>{address}</span></div>
                <div className={styles.twoColumn}>
                  <div className={styles.field}>
                    <label htmlFor="edit-founder">Founder name</label>
                    <input ref={firstFieldRef} id="edit-founder" value={fullName} maxLength={60} required onChange={(event) => setFullName(event.target.value)} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="edit-x">X handle</label>
                    <input id="edit-x" value={xHandle} maxLength={16} required autoCapitalize="none" spellCheck={false} onChange={(event) => setXHandle(event.target.value)} />
                  </div>
                </div>
                <div className={styles.field}>
                  <label htmlFor="edit-name">Project name</label>
                  <input id="edit-name" value={projectName} maxLength={40} required onChange={(event) => setProjectName(event.target.value)} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="edit-url">Project URL</label>
                  <input id="edit-url" type="url" value={websiteUrl} maxLength={2048} required inputMode="url" autoCapitalize="none" spellCheck={false} onChange={(event) => setWebsiteUrl(event.target.value)} />
                </div>
                <div className={styles.twoColumn}>
                  <div className={styles.field}>
                    <label htmlFor="edit-type">Project type</label>
                    <select id="edit-type" value={projectType} onChange={(event) => setProjectType(event.target.value as ProjectType)}>
                      {Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="edit-building">Building</label>
                    <select id="edit-building" value={assetId} onChange={(event) => setAssetId(event.target.value as StartupBuildingAssetId)}>
                      {BUILDINGS.map((building) => <option key={building.value} value={building.value}>{building.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className={styles.field}>
                  <label id="edit-color-label">Building color</label>
                  <div className={styles.swatches} role="radiogroup" aria-labelledby="edit-color-label">
                    {BUILDING_COLOR_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={color === option.hex}
                        aria-label={option.label}
                        className={`${styles.colorSwatch} ${color === option.hex ? styles.colorSwatchActive : ""}`}
                        style={{ background: option.hex }}
                        onClick={() => setColor(option.hex)}
                      />
                    ))}
                  </div>
                </div>
                {error ? <p className={styles.error} role="alert">{error}</p> : null}
                <div className={styles.formActions}>
                  <button className={styles.secondaryButton} type="button" disabled={isSaving} onClick={() => setMode("view")}>← Back</button>
                  <button className={styles.primaryButton} type="submit" disabled={isSaving}>{isSaving ? "Updating city…" : "Save changes"}</button>
                </div>
              </form>
            ) : (
              <form className={styles.pane} onSubmit={saveProject} aria-busy={isSaving}>
                <div className={styles.stepIntro}><strong id="project-card-title">Design your billboard</strong><span>It stands on your lawn at {address}.</span></div>
                <div className={styles.field}>
                  <label htmlFor="edit-billboard-bg">Billboard background</label>
                  <input ref={firstFieldRef} id="edit-billboard-bg" type="color" className={styles.colorInput} value={billboardBackgroundColor} onChange={(event) => setBillboardBackgroundColor(event.target.value.toLowerCase())} />
                </div>
                <div className={styles.field}>
                  <label htmlFor="edit-billboard-text">Product name color</label>
                  <input id="edit-billboard-text" type="color" className={styles.colorInput} value={billboardTextColor} onChange={(event) => setBillboardTextColor(event.target.value.toLowerCase())} />
                  {billboardContrastWarning ? <small className={styles.warning}>{billboardContrastWarning}</small> : null}
                </div>
                {error ? <p className={styles.error} role="alert">{error}</p> : null}
                <div className={styles.formActions}>
                  <button className={styles.secondaryButton} type="button" disabled={isSaving} onClick={() => setMode("view")}>← Back</button>
                  <button className={styles.primaryButton} type="submit" disabled={isSaving}>{isSaving ? "Updating city…" : "Save billboard"}</button>
                </div>
              </form>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}
