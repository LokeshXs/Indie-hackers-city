"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Checkbox,
  ChoiceList,
  Field,
  Modal,
  SwatchGroup,
  XpFigure,
  fieldColorControlClass,
  fieldControlClass,
} from "@/components/ui";
import { useFounderProjects } from "@/hooks/useFounderProjects";
import { BUILDING_COLOR_OPTIONS, X_HANDLE_PATTERN } from "@/lib/city/constants";
import type {
  AchievementType,
  CityDevelopment,
  FounderProject,
  ProjectType,
} from "@/lib/city/types";
import type { CityEntity } from "./map-types";
import { contrastRatio } from "./billboard-texture";
import { BillboardPreview, BuildingPreview, PLOT_PREVIEW_CAMERA, PlotPreview, PreviewStage } from "./ModelPreview";
import styles from "./ProjectCard.module.css";

const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  website: "Website",
  app: "App",
  "chrome-extension": "Chrome extension",
};

/** Mirrors public.achievement_definitions. The XP values are display-only — the database reads its
 * own catalog when awarding, so a drift here cannot inflate anyone's score. */
const ACHIEVEMENTS: ReadonlyArray<{
  type: AchievementType;
  label: string;
  description: string;
  xp: number;
}> = [
  { type: "product_launched", label: "Launched a new product", description: "Add it to your portfolio.", xp: 50 },
  { type: "gained_users", label: "Gained users", description: "Real people are using it.", xp: 25 },
  { type: "first_dollar", label: "Earned first dollar", description: "It made money.", xp: 75 },
  { type: "mrr_100", label: "Reached $100 MRR", description: "Recurring revenue, every month.", xp: 150 },
];

/** The screens the card swaps between. All of them share one shell and one preview pane. */
type CardMode =
  | "view"
  | "achievements"
  | "launch-form"
  | "pick-project"
  | "projects"
  | "project-edit"
  | "customise"
  | "founder"
  | "building"
  | "billboard";

/** Which model the left pane shows. Everything but the two appearance editors shows the real plot. */
type PreviewKind = "plot" | "building" | "billboard";

const PREVIEW_BY_MODE: Record<CardMode, PreviewKind> = {
  view: "plot",
  achievements: "plot",
  "launch-form": "plot",
  "pick-project": "plot",
  projects: "plot",
  "project-edit": "plot",
  customise: "plot",
  founder: "plot",
  building: "building",
  billboard: "billboard",
};

interface ProjectCardProps {
  development: CityDevelopment;
  plotEntity?: CityEntity;
  address: string;
  currentUserId?: string;
  onClose(): void;
  onUpdated(development: CityDevelopment): void;
}

export function ProjectCard({
  development,
  plotEntity,
  address,
  currentUserId,
  onClose,
  onUpdated,
}: ProjectCardProps) {
  const isOwner = currentUserId === development.ownerId;
  const [mode, setMode] = useState<CardMode>("view");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { projects, applyProjects } = useFounderProjects(
    isOwner ? development.ownerId : undefined,
    development.project.id,
  );

  // Which achievement the pick-project screen is attaching, and which project project-edit is on.
  const [pendingAchievement, setPendingAchievement] = useState<AchievementType | null>(null);
  const [editingProject, setEditingProject] = useState<FounderProject | null>(null);

  const [fullName, setFullName] = useState(development.founder.fullName);
  const [xHandle, setXHandle] = useState(development.founder.xHandle ?? "");
  const [projectName, setProjectName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("website");
  const [showcase, setShowcase] = useState(false);
  const [color, setColor] = useState(development.building.color);
  const [billboardTextColor, setBillboardTextColor] = useState(development.billboard.textColor);
  const [billboardBackgroundColor, setBillboardBackgroundColor] = useState(development.billboard.backgroundColor);

  const firstFieldRef = useRef<HTMLInputElement>(null);

  const billboardCard = useMemo(() => ({
    name: development.project.name,
    textColor: billboardTextColor,
    backgroundColor: billboardBackgroundColor,
  }), [development.project.name, billboardTextColor, billboardBackgroundColor]);

  const billboardContrastWarning = contrastRatio(billboardTextColor, billboardBackgroundColor) < 3
    ? "These colors are close together — the name may be hard to read."
    : null;

  // Swapping to a form moves focus to its first field. Modal owns the initial focus on mount.
  useEffect(() => {
    if (mode !== "view") firstFieldRef.current?.focus();
  }, [mode]);

  function goTo(next: CardMode) {
    setError(null);
    setMode(next);
  }

  async function send(input: string, init: RequestInit): Promise<Record<string, unknown> | null> {
    setError(null);
    setIsSaving(true);
    try {
      const response = await fetch(input, init);
      const payload = await response.json() as {
        development?: CityDevelopment;
        projects?: FounderProject[];
        error?: { message?: string };
      };
      if (!response.ok || !payload.development) {
        throw new Error(payload.error?.message || "That didn’t work. Try again.");
      }
      onUpdated(payload.development);
      if (payload.projects) applyProjects(payload.projects);
      return payload as Record<string, unknown>;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That didn’t work. Try again.");
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function launchProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("projectName", projectName.trim());
    formData.set("websiteUrl", websiteUrl.trim());
    formData.set("projectType", projectType);
    formData.set("showcase", String(showcase));
    if (await send("/api/projects", { method: "POST", body: formData })) goTo("projects");
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingProject) return;
    const formData = new FormData();
    formData.set("projectName", projectName.trim());
    formData.set("websiteUrl", websiteUrl.trim());
    formData.set("projectType", projectType);
    formData.set("showcase", String(showcase));
    const result = await send(`/api/projects/${encodeURIComponent(editingProject.id)}`, {
      method: "PATCH",
      body: formData,
    });
    if (result) goTo("projects");
  }

  async function logAchievement(projectId: string) {
    if (!pendingAchievement) return;
    const result = await send("/api/achievements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ achievementType: pendingAchievement, projectId }),
    });
    if (result) {
      setPendingAchievement(null);
      goTo("view");
    }
  }

  async function saveFounder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedHandle = xHandle.trim().replace(/^@/, "");
    if (!fullName.trim() || !X_HANDLE_PATTERN.test(normalizedHandle)) {
      setError("Check the founder name and X handle.");
      return;
    }
    const formData = new FormData();
    formData.set("fullName", fullName.trim());
    formData.set("xHandle", normalizedHandle);
    if (await send("/api/profile", { method: "PATCH", body: formData })) goTo("customise");
  }

  async function saveAppearance(event: FormEvent<HTMLFormElement>, next: CardMode) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("buildingColor", color);
    formData.set("billboardTextColor", billboardTextColor);
    formData.set("billboardBackgroundColor", billboardBackgroundColor);
    if (await send("/api/plot-claim/appearance", { method: "PATCH", body: formData })) goTo(next);
  }

  function startLaunch() {
    setProjectName("");
    setWebsiteUrl("");
    setProjectType("website");
    setShowcase(false);
    setPendingAchievement("product_launched");
    goTo("launch-form");
  }

  function startEdit(project: FounderProject) {
    setEditingProject(project);
    setProjectName(project.name);
    setWebsiteUrl(project.websiteUrl);
    setProjectType(project.type);
    setShowcase(project.isShowcased);
    goTo("project-edit");
  }

  function chooseAchievement(type: AchievementType) {
    if (type === "product_launched") {
      startLaunch();
      return;
    }
    setPendingAchievement(type);
    goTo("pick-project");
  }

  const previewKind = PREVIEW_BY_MODE[mode];

  return (
    <Modal
      containment="fixed"
      layout="surface"
      width="min(78rem, 100%)"
      zIndex={32}
      labelledBy="project-card-title"
      busy={isSaving}
      closeLabel="Close project card"
      initialFocus="close"
      onClose={onClose}
    >
      <Modal.Split previewColumn="minmax(0, 2fr)" actionColumn="minmax(24rem, 3fr)">
        <Modal.Preview>
          {/* PreviewStage's zoom is a non-reactive camera prop, so each preview kind gets its own
              Canvas via the key — the plot needs far wider framing than a single model. */}
          <PreviewStage
            key={previewKind}
            className={styles.previewCanvas}
            zoom={36}
            shadows={previewKind !== "plot"}
            cameraPosition={previewKind === "plot" ? PLOT_PREVIEW_CAMERA : undefined}
          >
            {previewKind === "billboard" ? (
              <BillboardPreview card={billboardCard} />
            ) : previewKind === "building" ? (
              <BuildingPreview assetId={development.building.assetId} buildingColor={color} />
            ) : plotEntity ? (
              <PlotPreview
                plotEntity={plotEntity}
                development={{ ...development, building: { ...development.building, color } }}
              />
            ) : (
              <BuildingPreview assetId={development.building.assetId} buildingColor={color} />
            )}
          </PreviewStage>
        </Modal.Preview>

        <Modal.Pane>
          {mode === "view" ? (
            <div className={styles.pane}>
              <div className={styles.identity}>
                <p className={styles.label}>Founder</p>
                <div className={styles.titleRow}>
                  <h2 id="project-card-title">{development.founder.fullName}</h2>
                  <XpFigure xp={development.progression.xp} />
                </div>
                {development.founder.xHandle ? (
                  <p className={styles.founder}>
                    <a
                      href={`https://x.com/${encodeURIComponent(development.founder.xHandle)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      @{development.founder.xHandle}
                    </a>
                  </p>
                ) : null}
              </div>

              <div className={styles.billboardRow}>
                <p className={styles.label}>On the billboard</p>
                <p className={styles.billboardProject}>
                  <a href={development.project.websiteUrl} target="_blank" rel="noopener noreferrer">
                    {development.project.name} <span aria-hidden="true">↗</span>
                  </a>
                  <span className={styles.billboardType}>{PROJECT_TYPE_LABELS[development.project.type]}</span>
                </p>
              </div>

              <dl className={styles.details}>
                <div><dt className={styles.label}>Location</dt><dd>{address}</dd></div>
                <div><dt className={styles.label}>Claimed</dt><dd>{new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(development.claimedAt))}</dd></div>
              </dl>

              {isOwner ? (
                <div className={styles.actions}>
                  <Button size="lg" block onClick={() => goTo("achievements")}>Add achievement</Button>
                  <div className={styles.ownerActions}>
                    <Button variant="tertiary" onClick={() => goTo("projects")}>My projects</Button>
                    <Button variant="tertiary" onClick={() => goTo("customise")}>Customise</Button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : mode === "achievements" ? (
            <div className={styles.pane}>
              <div className={styles.stepIntro}>
                <strong id="project-card-title">Add an achievement</strong>
                <span>Each one can be logged once per project.</span>
              </div>
              <ChoiceList
                legend="Achievements"
                items={ACHIEVEMENTS.map((achievement) => {
                  // product_launched is claimed by adding a project, so it is never exhausted.
                  const exhausted = achievement.type !== "product_launched"
                    && projects.length > 0
                    && projects.every((project) => project.achievements.includes(achievement.type));
                  return {
                    id: achievement.type,
                    title: achievement.label,
                    description: achievement.description,
                    meta: exhausted ? "All logged" : `+${achievement.xp} XP`,
                    disabled: exhausted,
                  };
                })}
                onSelect={(id) => chooseAchievement(id as AchievementType)}
              />
              {error ? <Alert>{error}</Alert> : null}
              <div className={styles.formActions}>
                <Button variant="tertiary" onClick={() => goTo("view")}>← Back</Button>
                <span />
              </div>
            </div>
          ) : mode === "launch-form" ? (
            <form className={styles.pane} onSubmit={launchProduct} aria-busy={isSaving}>
              <div className={styles.stepIntro}>
                <strong id="project-card-title">Launched a new product</strong>
                <span>It joins your portfolio and earns 50 XP.</span>
              </div>
              <Field label="Product name" htmlFor="launch-name">
                {(field) => <input {...field} ref={firstFieldRef} className={fieldControlClass} value={projectName} maxLength={40} required onChange={(event) => setProjectName(event.target.value)} />}
              </Field>
              <Field label="Product URL" htmlFor="launch-url">
                {(field) => <input {...field} className={fieldControlClass} type="url" value={websiteUrl} maxLength={2048} required inputMode="url" autoCapitalize="none" spellCheck={false} onChange={(event) => setWebsiteUrl(event.target.value)} />}
              </Field>
              <Field label="Type" htmlFor="launch-type">
                {(field) => (
                  <select {...field} className={fieldControlClass} value={projectType} onChange={(event) => setProjectType(event.target.value as ProjectType)}>
                    {Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                )}
              </Field>
              <Checkbox
                checked={showcase}
                onChange={setShowcase}
                label="Put this on my billboard"
                hint="Replaces whatever is on it now."
              />
              {error ? <Alert>{error}</Alert> : null}
              <div className={styles.formActions}>
                <Button variant="tertiary" disabled={isSaving} onClick={() => goTo("achievements")}>← Back</Button>
                <Button size="lg" type="submit" disabled={isSaving}>{isSaving ? "Adding…" : "Add product"}</Button>
              </div>
            </form>
          ) : mode === "pick-project" ? (
            <div className={styles.pane}>
              <div className={styles.stepIntro}>
                <strong id="project-card-title">Which project?</strong>
                <span>{ACHIEVEMENTS.find((item) => item.type === pendingAchievement)?.label}</span>
              </div>
              <ChoiceList
                legend="Your projects"
                items={projects.map((project) => {
                  const already = pendingAchievement !== null && project.achievements.includes(pendingAchievement);
                  return {
                    id: project.id,
                    title: project.name,
                    description: PROJECT_TYPE_LABELS[project.type],
                    meta: already ? "Already logged" : undefined,
                    disabled: already || isSaving,
                  };
                })}
                onSelect={(id) => void logAchievement(id)}
              />
              {error ? <Alert>{error}</Alert> : null}
              <div className={styles.formActions}>
                <Button variant="tertiary" disabled={isSaving} onClick={() => goTo("achievements")}>← Back</Button>
                <span />
              </div>
            </div>
          ) : mode === "projects" ? (
            <div className={styles.pane}>
              <div className={styles.stepIntro}>
                <strong id="project-card-title">My projects</strong>
                <span>{projects.length === 1 ? "1 project" : `${projects.length} projects`}</span>
              </div>
              <ul className={styles.projectList}>
                {projects.map((project) => (
                  <li key={project.id} className={styles.projectRow}>
                    <div className={styles.projectBody}>
                      <strong>{project.name}</strong>
                      <span className={styles.projectMeta}>{PROJECT_TYPE_LABELS[project.type]}</span>
                      {project.isShowcased ? <span className={styles.projectBadge}>On your billboard</span> : null}
                    </div>
                    <Button variant="tertiary" size="sm" onClick={() => startEdit(project)}>Edit</Button>
                  </li>
                ))}
              </ul>
              {error ? <Alert>{error}</Alert> : null}
              <div className={styles.formActions}>
                <Button variant="tertiary" onClick={() => goTo("view")}>← Back</Button>
                <Button onClick={startLaunch}>Add a product</Button>
              </div>
            </div>
          ) : mode === "project-edit" ? (
            <form className={styles.pane} onSubmit={saveProject} aria-busy={isSaving}>
              <div className={styles.stepIntro}>
                <strong id="project-card-title">Edit project</strong>
                <span>{editingProject?.name}</span>
              </div>
              <Field label="Project name" htmlFor="edit-name">
                {(field) => <input {...field} ref={firstFieldRef} className={fieldControlClass} value={projectName} maxLength={40} required onChange={(event) => setProjectName(event.target.value)} />}
              </Field>
              <Field label="Project URL" htmlFor="edit-url">
                {(field) => <input {...field} className={fieldControlClass} type="url" value={websiteUrl} maxLength={2048} required inputMode="url" autoCapitalize="none" spellCheck={false} onChange={(event) => setWebsiteUrl(event.target.value)} />}
              </Field>
              <Field label="Type" htmlFor="edit-type">
                {(field) => (
                  <select {...field} className={fieldControlClass} value={projectType} onChange={(event) => setProjectType(event.target.value as ProjectType)}>
                    {Object.entries(PROJECT_TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                )}
              </Field>
              {/* The billboard is never empty, so the project already on it cannot be taken off —
                  only replaced by putting another one up. */}
              <Checkbox
                checked={showcase}
                onChange={setShowcase}
                disabled={editingProject?.isShowcased}
                label="Show this on my billboard"
                hint={editingProject?.isShowcased
                  ? "On your billboard — put another project up to replace it."
                  : "Replaces whatever is on it now."}
              />
              {error ? <Alert>{error}</Alert> : null}
              <div className={styles.formActions}>
                <Button variant="tertiary" disabled={isSaving} onClick={() => goTo("projects")}>← Back</Button>
                <Button size="lg" type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save changes"}</Button>
              </div>
            </form>
          ) : mode === "customise" ? (
            <div className={styles.pane}>
              <div className={styles.stepIntro}>
                <strong id="project-card-title">Customise</strong>
                <span>How your plot and your name appear in the city.</span>
              </div>
              <ChoiceList
                legend="Customise"
                items={[
                  { id: "founder", title: "Founder details", description: "Your name and X handle." },
                  { id: "building", title: "Building colour", description: "The paint on your building." },
                  { id: "billboard", title: "Billboard design", description: "The colours on your board." },
                ]}
                onSelect={(id) => goTo(id as CardMode)}
              />
              <div className={styles.formActions}>
                <Button variant="tertiary" onClick={() => goTo("view")}>← Back</Button>
                <span />
              </div>
            </div>
          ) : mode === "founder" ? (
            <form className={styles.pane} onSubmit={saveFounder} aria-busy={isSaving}>
              <div className={styles.stepIntro}>
                <strong id="project-card-title">Founder details</strong>
                <span>{address}</span>
              </div>
              <Field label="Full name" htmlFor="founder-name">
                {(field) => <input {...field} ref={firstFieldRef} className={fieldControlClass} value={fullName} maxLength={60} required onChange={(event) => setFullName(event.target.value)} />}
              </Field>
              <Field label="X handle" htmlFor="founder-handle">
                {(field) => <input {...field} className={fieldControlClass} value={xHandle} maxLength={16} required autoCapitalize="none" spellCheck={false} onChange={(event) => setXHandle(event.target.value)} />}
              </Field>
              {error ? <Alert>{error}</Alert> : null}
              <div className={styles.formActions}>
                <Button variant="tertiary" disabled={isSaving} onClick={() => goTo("customise")}>← Back</Button>
                <Button size="lg" type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save details"}</Button>
              </div>
            </form>
          ) : mode === "building" ? (
            <form className={styles.pane} onSubmit={(event) => void saveAppearance(event, "customise")} aria-busy={isSaving}>
              <div className={styles.stepIntro}>
                <strong id="project-card-title">Building colour</strong>
                <span>Your building shape was set when you claimed the plot.</span>
              </div>
              <div className={styles.field}>
                <label className={styles.swatchLabel} id="edit-color-label">Building colour</label>
                <SwatchGroup options={BUILDING_COLOR_OPTIONS} value={color} onChange={setColor} labelledBy="edit-color-label" />
              </div>
              {error ? <Alert>{error}</Alert> : null}
              <div className={styles.formActions}>
                <Button variant="tertiary" disabled={isSaving} onClick={() => goTo("customise")}>← Back</Button>
                <Button size="lg" type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save colour"}</Button>
              </div>
            </form>
          ) : (
            <form className={styles.pane} onSubmit={(event) => void saveAppearance(event, "customise")} aria-busy={isSaving}>
              <div className={styles.stepIntro}>
                <strong id="project-card-title">Billboard design</strong>
                <span>It stands on your lawn at {address}.</span>
              </div>
              <Field label="Billboard background" htmlFor="billboard-bg">
                {(field) => <input {...field} ref={firstFieldRef} className={fieldColorControlClass} type="color" value={billboardBackgroundColor} onChange={(event) => setBillboardBackgroundColor(event.target.value.toLowerCase())} />}
              </Field>
              <Field label="Product name colour" htmlFor="billboard-text" warning={billboardContrastWarning}>
                {(field) => <input {...field} className={fieldColorControlClass} type="color" value={billboardTextColor} onChange={(event) => setBillboardTextColor(event.target.value.toLowerCase())} />}
              </Field>
              {error ? <Alert>{error}</Alert> : null}
              <div className={styles.formActions}>
                <Button variant="tertiary" disabled={isSaving} onClick={() => goTo("customise")}>← Back</Button>
                <Button size="lg" type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save billboard"}</Button>
              </div>
            </form>
          )}
        </Modal.Pane>
      </Modal.Split>
    </Modal>
  );
}
