"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { BUILDING_COLOR_OPTIONS, X_HANDLE_PATTERN } from "@/lib/city/constants";
import type { CityDevelopment, ProjectType, StartupBuildingAssetId } from "@/lib/city/types";
import styles from "./ProjectCard.module.css";

const BUILDINGS: ReadonlyArray<{ value: StartupBuildingAssetId; label: string }> = [
  { value: "startup-building-level-1", label: "Startup Shop" },
  { value: "corner-studio-level-1", label: "Corner Studio" },
];

const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  website: "Website",
  app: "App",
  "chrome-extension": "Chrome extension",
};

interface ProjectCardProps {
  development: CityDevelopment;
  address: string;
  currentUserId?: string;
  onClose(): void;
  onUpdated(development: CityDevelopment): void;
}

export function ProjectCard({ development, address, currentUserId, onClose, onUpdated }: ProjectCardProps) {
  const isOwner = currentUserId === development.ownerId;
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState(development.founder.fullName);
  const [xHandle, setXHandle] = useState(development.founder.xHandle ?? "");
  const [projectName, setProjectName] = useState(development.project.name);
  const [websiteUrl, setWebsiteUrl] = useState(development.project.websiteUrl);
  const [projectType, setProjectType] = useState(development.project.type);
  const [assetId, setAssetId] = useState(development.building.assetId);
  const [color, setColor] = useState(development.building.color);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

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

    const formData = new FormData();
    formData.set("fullName", fullName.trim());
    formData.set("xHandle", normalizedHandle);
    formData.set("projectName", projectName.trim());
    formData.set("websiteUrl", websiteUrl.trim());
    formData.set("projectType", projectType);
    formData.set("buildingAssetId", assetId);
    formData.set("buildingColor", color);

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
      setIsEditing(false);
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
        <div className={styles.deedHeader}>
          <span>Registered development</span>
          <small>{address}</small>
        </div>

        {!isEditing ? (
          <div className={styles.showcase}>
            <div className={styles.projectIdentity}>
              <p>{PROJECT_TYPE_LABELS[development.project.type]}</p>
              <h2 id="project-card-title">{development.project.name}</h2>
              <span>Founded by {development.founder.fullName}</span>
              {development.founder.xHandle ? (
                <a href={`https://x.com/${encodeURIComponent(development.founder.xHandle)}`} target="_blank" rel="noopener noreferrer">
                  @{development.founder.xHandle}
                </a>
              ) : null}
            </div>
            <dl className={styles.details}>
              <div><dt>Building</dt><dd>{BUILDINGS.find((item) => item.value === development.building.assetId)?.label}</dd></div>
              <div><dt>Claimed</dt><dd>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(development.claimedAt))}</dd></div>
            </dl>
            <div className={styles.actions}>
              <a className={styles.visit} href={development.project.websiteUrl} target="_blank" rel="noopener noreferrer">Visit project <span aria-hidden="true">↗</span></a>
              {isOwner ? <button type="button" onClick={() => { setError(null); setIsEditing(true); }}>Edit project</button> : null}
            </div>
          </div>
        ) : (
          <form className={styles.editForm} onSubmit={saveProject} aria-busy={isSaving}>
            <div><label htmlFor="edit-founder">Founder name</label><input id="edit-founder" value={fullName} maxLength={60} required onChange={(event) => setFullName(event.target.value)} /></div>
            <div><label htmlFor="edit-x">X handle</label><input id="edit-x" value={xHandle} maxLength={16} required onChange={(event) => setXHandle(event.target.value)} /></div>
            <div><label htmlFor="edit-name">Project name</label><input id="edit-name" value={projectName} maxLength={40} required onChange={(event) => setProjectName(event.target.value)} /></div>
            <div><label htmlFor="edit-url">Project URL</label><input id="edit-url" type="url" value={websiteUrl} maxLength={2048} required onChange={(event) => setWebsiteUrl(event.target.value)} /></div>
            <div className={styles.twoColumn}>
              <div><label htmlFor="edit-type">Project type</label><select id="edit-type" value={projectType} onChange={(event) => setProjectType(event.target.value as ProjectType)}>{Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              <div><label htmlFor="edit-building">Building</label><select id="edit-building" value={assetId} onChange={(event) => setAssetId(event.target.value as StartupBuildingAssetId)}>{BUILDINGS.map((building) => <option key={building.value} value={building.value}>{building.label}</option>)}</select></div>
            </div>
            <fieldset><legend>Building color</legend><div className={styles.swatches}>{BUILDING_COLOR_OPTIONS.map((option) => <button key={option.id} type="button" title={option.label} aria-label={option.label} aria-pressed={color === option.hex} style={{ backgroundColor: option.hex }} onClick={() => setColor(option.hex)} />)}</div></fieldset>
            {error ? <p className={styles.error} role="alert">{error}</p> : null}
            <div className={styles.actions}><button type="button" disabled={isSaving} onClick={() => setIsEditing(false)}>Cancel</button><button className={styles.visit} type="submit" disabled={isSaving}>{isSaving ? "Updating city…" : "Save changes"}</button></div>
          </form>
        )}
      </article>
    </div>
  );
}

