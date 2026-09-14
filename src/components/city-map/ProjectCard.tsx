"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Alert,
  Button,
  Checkbox,
  ChoiceList,
  Field,
  Modal,
  XpFigure,
  fieldColorControlClass,
  fieldControlClass,
} from "@/components/ui";
import { summarisePendingClaims } from "@/lib/city/achievements";
import { EVIDENCE_MIME_TYPES, uploadEvidence } from "@/lib/city/evidence";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useFounderProjects } from "@/hooks/useFounderProjects";
import { X_HANDLE_PATTERN } from "@/lib/city/constants";
import type {
  AchievementDefinition,
  AchievementGroup,
  AchievementType,
  CityDevelopment,
  FounderProject,
  ProjectType,
} from "@/lib/city/types";
import type { CityEntity } from "./map-types";
import { contrastRatio } from "./billboard-texture";
import { BillboardPreview, PreviewStage } from "./ModelPreview";
import styles from "./ProjectCard.module.css";
import { OnlineFounderMarker } from "./OnlineFounderMarker";
import { STATUS_TEXT_LIMIT, statusTextLength, validateStatusText } from "@/lib/city/status";
import { unlocksFor } from "@/lib/city/unlocks";
import { VisitorPlotCard } from "./VisitorPlotCard";
import { PlotSnapshot } from "./PlotSnapshot";

const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  website: "Website",
  app: "App",
  "chrome-extension": "Chrome extension",
};

/** The three things a founder can log. Users and revenue are graded, so their entries open a rung
 * picker; launching opens the new-project form instead. Labels and XP come from the database. */
const ACHIEVEMENT_GROUPS: ReadonlyArray<{
  group: AchievementGroup;
  label: string;
  description: string;
}> = [
  { group: "launch", label: "Launched a new product", description: "Add it to your portfolio." },
  { group: "users", label: "Gained users", description: "Real people are using it." },
  { group: "revenue", label: "Earned revenue", description: "It made money." },
];

const XP_FORMATTER = new Intl.NumberFormat("en-US");

/** Stated on every screen that can file a claim. Nothing verifies a milestone automatically, so a
 * founder needs to know before they pick one that the XP is not instant. */
const APPROVAL_NOTE = "Every achievement goes to an admin for approval. The XP lands on your plot once it is approved.";

/** A rung cannot be filed again while it is approved or already sitting in the review queue. A
 * rejected one appears in neither list, which is what lets a founder come back to it. */
function isFiled(
  type: AchievementType,
  approved: readonly AchievementType[],
  pending: readonly AchievementType[],
): boolean {
  return approved.includes(type) || pending.includes(type);
}

/** The lowest rung still open to file, for preselecting the picker. */
function firstGrantableRung(
  rungs: readonly AchievementDefinition[],
  approved: readonly AchievementType[],
  pending: readonly AchievementType[],
): AchievementType | null {
  return rungs.find((rung) => !isFiled(rung.type, approved, pending))?.type ?? null;
}

/** Whether a group is claimed once per founder rather than once per project. */
function isFounderScoped(catalog: readonly AchievementDefinition[], group: AchievementGroup) {
  return catalog.some((entry) => entry.group === group && entry.scope === "founder");
}

/** Rungs of a group, lowest first. */
function rungsOf(catalog: readonly AchievementDefinition[], group: AchievementGroup) {
  return catalog.filter((entry) => entry.group === group).sort((a, b) => a.tier - b.tier);
}

/** What approving `rung` would award: itself plus every rung below it the project does not already
 * hold *approved*. Counted against approved rungs only, so it matches the xp_pending the database
 * reports and the number the reviewer will see. */
function grantableXp(
  catalog: readonly AchievementDefinition[],
  group: AchievementGroup,
  tier: number,
  approved: readonly AchievementType[],
): number {
  return rungsOf(catalog, group)
    .filter((entry) => entry.tier <= tier && !approved.includes(entry.type))
    .reduce((total, entry) => total + entry.xpReward, 0);
}

/** The screens the card swaps between. All of them share one shell and one preview pane. */
type CardMode =
  | "view"
  | "achievements"
  | "launch-form"
  | "pick-project"
  | "achievement-tier"
  | "achievement-evidence"
  | "projects"
  | "project-edit"
  | "customise"
  | "founder"
  | "billboard"
  | "status";

/** Which model the left pane shows. Everything but the two appearance editors shows the real plot. */
type PreviewKind = "plot" | "billboard";

const PREVIEW_BY_MODE: Record<CardMode, PreviewKind> = {
  view: "plot",
  achievements: "plot",
  "launch-form": "plot",
  "pick-project": "plot",
  "achievement-tier": "plot",
  "achievement-evidence": "plot",
  projects: "plot",
  "project-edit": "plot",
  customise: "plot",
  founder: "plot",
  billboard: "billboard",
  status: "plot",
};

interface ProjectCardProps {
  development: CityDevelopment;
  plotEntity?: CityEntity;
  address: string;
  currentUserId?: string;
  onClose(): void;
  onUpdated(development: CityDevelopment): void;
}

export function ProjectCard(props: ProjectCardProps) {
  return props.currentUserId && props.currentUserId === props.development.ownerId
    ? <OwnerProjectCard key={props.development.plotId} {...props} />
    : <VisitorPlotCard key={props.development.plotId} development={props.development} onClose={props.onClose} />;
}

function OwnerProjectCard({
  development,
  plotEntity,
  address,
  currentUserId,
  onClose,
  onUpdated,
}: ProjectCardProps) {
  const isOwner = currentUserId === development.ownerId;
  const statusUnlocked = unlocksFor(development.progression.xp).status;
  const [statusText, setStatusText] = useState(development.statusText ?? "");
  const [mode, setMode] = useState<CardMode>("view");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Survives the jump back to the view pane, so a founder is told what happened to the claim they
  // just filed rather than being returned to an unchanged card.
  const [notice, setNotice] = useState<string | null>(null);

  const {
    projects, catalog, founderAchievements, pendingFounderAchievements, applyProjects,
  } = useFounderProjects(
    isOwner ? development.ownerId : undefined,
    development.project.id,
  );

  // The group being logged, the project it is being logged against, and the rung selected for it.
  const [pendingGroup, setPendingGroup] = useState<AchievementGroup | null>(null);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const [pendingTier, setPendingTier] = useState<AchievementType | null>(null);
  // The evidence being assembled for the rung above. Cleared whenever the flow restarts, so one
  // claim's screenshot can never be filed against the next.
  const [evidenceLink, setEvidenceLink] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [editingProject, setEditingProject] = useState<FounderProject | null>(null);

  const [bio, setBio] = useState(development.founder.bio ?? "");
  const [fullName, setFullName] = useState(development.founder.fullName);
  const [xHandle, setXHandle] = useState(development.founder.xHandle ?? "");
  const [projectName, setProjectName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [projectType, setProjectType] = useState<ProjectType>("website");
  const [showcase, setShowcase] = useState(false);
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
    if (next === "status") setStatusText(development.statusText ?? "");
    setError(null);
    setNotice(null);
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
        founderAchievements?: AchievementType[];
        pendingFounderAchievements?: AchievementType[];
        error?: { message?: string };
      };
      if (!response.ok || !payload.development) {
        throw new Error(payload.error?.message || "That didn’t work. Try again.");
      }
      onUpdated(payload.development);
      if (payload.projects) {
        applyProjects(payload.projects, payload.founderAchievements, payload.pendingFounderAchievements);
      }
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
    const launchedName = projectName.trim();
    const formData = new FormData();
    formData.set("projectName", launchedName);
    formData.set("websiteUrl", websiteUrl.trim());
    formData.set("projectType", projectType);
    formData.set("showcase", String(showcase));
    if (await send("/api/projects", { method: "POST", body: formData })) {
      const launchReward = rungsOf(catalog, "launch")[0]?.xpReward ?? 0;
      goTo("projects");
      setNotice(
        `“${launchedName}” added, and its launch sent for review. `
        + `It adds ${XP_FORMATTER.format(launchReward)} XP once it is approved.`,
      );
    }
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

  function resetClaimDraft() {
    setPendingGroup(null);
    setPendingProjectId(null);
    setPendingTier(null);
    setEvidenceLink("");
    setEvidenceNote("");
    setEvidenceFile(null);
  }

  async function logAchievement() {
    if (!pendingTier) return;

    // The upload happens first and separately: a screenshot that fails to reach storage must not
    // leave a claim on file pointing at nothing.
    let filePath: string | undefined;
    if (evidenceFile) {
      setIsUploading(true);
      const uploaded = await uploadEvidence(
        getSupabaseBrowserClient(), development.ownerId, evidenceFile,
      );
      setIsUploading(false);
      if (uploaded.error) {
        setError(uploaded.error);
        return;
      }
      filePath = uploaded.path;
    }

    const result = await send("/api/achievements", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Omitted entirely for founder-scoped rungs; the RPC decides which types need one.
      body: JSON.stringify({
        achievementType: pendingTier,
        projectId: pendingProjectId ?? undefined,
        evidenceLink: evidenceLink.trim() || undefined,
        evidenceFilePath: filePath,
        evidenceNote: evidenceNote.trim() || undefined,
      }),
    });
    if (result) {
      const submitted = result.achievement as { xpPending?: number } | undefined;
      const worth = submitted?.xpPending ?? 0;
      const label = catalog.find((entry) => entry.type === pendingTier)?.label ?? "That milestone";
      resetClaimDraft();
      goTo("view");
      setNotice(
        `“${label}” sent for review. It adds ${XP_FORMATTER.format(worth)} XP once it is approved.`,
      );
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
    formData.set("bio", bio);
    if (await send("/api/profile", { method: "PATCH", body: formData })) goTo("customise");
  }

  async function saveStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isOwner || !statusUnlocked) return;
    const validation = validateStatusText(statusText);
    if (!validation.data) { setError(validation.error); return; }
    if (await send("/api/plot-claim/status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validation.data),
    })) {
      goTo("customise");
      setNotice("Status saved. It appears above your plot while you are online.");
    }
  }

  async function saveAppearance(event: FormEvent<HTMLFormElement>, next: CardMode) {
    event.preventDefault();
    const formData = new FormData();
    formData.set("billboardTextColor", billboardTextColor);
    formData.set("billboardBackgroundColor", billboardBackgroundColor);
    if (await send("/api/plot-claim/appearance", { method: "PATCH", body: formData })) goTo(next);
  }

  function startLaunch() {
    setProjectName("");
    setWebsiteUrl("");
    setProjectType("website");
    setShowcase(false);
    setPendingGroup("launch");
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

  function chooseGroup(group: AchievementGroup) {
    if (group === "launch") {
      startLaunch();
      return;
    }
    setPendingGroup(group);
    setPendingProjectId(null);
    setPendingTier(null);

    if (isFounderScoped(catalog, group)) {
      // Nothing to attach it to — revenue belongs to the founder, so skip straight to the rungs.
      setPendingTier(firstGrantableRung(
        rungsOf(catalog, group), founderAchievements, pendingFounderAchievements,
      ));
      goTo("achievement-tier");
      return;
    }

    goTo("pick-project");
  }

  function chooseProject(projectId: string) {
    const rungs = pendingGroup ? rungsOf(catalog, pendingGroup) : [];
    const project = projects.find((entry) => entry.id === projectId);
    const held = project?.achievements ?? [];
    const waiting = project?.pendingAchievements ?? [];
    setPendingProjectId(projectId);
    setPendingTier(firstGrantableRung(rungs, held, waiting));
    goTo("achievement-tier");
  }

  const pending = useMemo(
    () => summarisePendingClaims(catalog, projects, founderAchievements, pendingFounderAchievements),
    [catalog, projects, founderAchievements, pendingFounderAchievements],
  );

  const pendingMessage = pending.count === 0 ? null
    : pending.count === 1
      ? `“${pending.claims[0].label}”${pending.claims[0].projectName ? ` on ${pending.claims[0].projectName}` : ""}`
        + ` is with an admin for approval. It adds ${XP_FORMATTER.format(pending.xp)} XP once approved.`
      : `${pending.count} achievements are with an admin for approval.`
        + ` They add ${XP_FORMATTER.format(pending.xp)} XP once approved.`;

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
          {previewKind === "billboard" ? (
            <PreviewStage className={styles.previewCanvas} zoom={36}>
              <BillboardPreview card={billboardCard} assetId={development.building.assetId} />
            </PreviewStage>
          ) : (
            <PlotSnapshot
              key={JSON.stringify([development, plotEntity])}
              development={development}
              plotEntity={plotEntity}
              address={address}
            />
          )}
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

              {notice || pendingMessage
                ? <Alert tone="notice">{notice ?? pendingMessage}</Alert>
                : null}

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
                <span>Each one can be logged once.</span>
              </div>
              <ChoiceList
                legend="Achievements"
                items={ACHIEVEMENT_GROUPS.map((entry) => {
                  const rungs = rungsOf(catalog, entry.group);
                  const total = rungs.reduce((sum, rung) => sum + rung.xpReward, 0);
                  // Launch is never exhausted — it is claimed by adding a project, not picking one.
                  const exhausted = entry.group === "launch"
                    ? false
                    : isFounderScoped(catalog, entry.group)
                      // Founder-scoped: held once and it is done, whatever the portfolio looks like.
                      ? rungs.every((rung) => isFiled(rung.type, founderAchievements, pendingFounderAchievements))
                      : projects.length > 0
                        && projects.every((project) => rungs.every(
                          (rung) => isFiled(rung.type, project.achievements, project.pendingAchievements),
                        ));
                  return {
                    id: entry.group,
                    title: entry.label,
                    description: entry.description,
                    meta: exhausted
                      ? "Nothing left to log"
                      : rungs.length > 1
                        ? `up to +${XP_FORMATTER.format(total)} XP`
                        : `+${XP_FORMATTER.format(total)} XP`,
                    disabled: exhausted,
                  };
                })}
                onSelect={(id) => chooseGroup(id as AchievementGroup)}
              />
              <Alert tone="notice">{APPROVAL_NOTE}</Alert>
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
                <span>It joins your portfolio and earns {XP_FORMATTER.format(rungsOf(catalog, "launch")[0]?.xpReward ?? 0)} XP once it is approved.</span>
              </div>
              <Alert tone="notice">{APPROVAL_NOTE}</Alert>
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
                <span>{ACHIEVEMENT_GROUPS.find((item) => item.group === pendingGroup)?.label}</span>
              </div>
              <ChoiceList
                legend="Your projects"
                items={projects.map((project) => {
                  // Exhausted means every rung in the group is held, not just one type.
                  const rungs = pendingGroup ? rungsOf(catalog, pendingGroup) : [];
                  const already = rungs.length > 0 && rungs.every(
                    (rung) => isFiled(rung.type, project.achievements, project.pendingAchievements),
                  );
                  const waiting = rungs.some((rung) => project.pendingAchievements.includes(rung.type));
                  return {
                    id: project.id,
                    title: project.name,
                    description: PROJECT_TYPE_LABELS[project.type],
                    meta: already ? (waiting ? "Awaiting review" : "All logged") : undefined,
                    disabled: already || isSaving,
                  };
                })}
                onSelect={chooseProject}
              />
              {error ? <Alert>{error}</Alert> : null}
              <div className={styles.formActions}>
                <Button variant="tertiary" disabled={isSaving} onClick={() => goTo("achievements")}>← Back</Button>
                <span />
              </div>
            </div>
          ) : mode === "achievement-tier" ? (
            <div className={styles.pane}>
              <div className={styles.stepIntro}>
                <strong id="project-card-title">How far has it got?</strong>
                <span>
                  {pendingGroup && isFounderScoped(catalog, pendingGroup)
                    ? "Across everything you have built"
                    : projects.find((project) => project.id === pendingProjectId)?.name}
                </span>
              </div>
              {(() => {
                const rungs = pendingGroup ? rungsOf(catalog, pendingGroup) : [];
                const founderScoped = Boolean(pendingGroup && isFounderScoped(catalog, pendingGroup));
                const project = projects.find((entry) => entry.id === pendingProjectId);
                const held = founderScoped ? founderAchievements : project?.achievements ?? [];
                const waiting = founderScoped
                  ? pendingFounderAchievements
                  : project?.pendingAchievements ?? [];
                const selectable = rungs.filter((rung) => !isFiled(rung.type, held, waiting));
                return (
                  <>
                    <ChoiceList
                      legend="Milestone"
                      selectedId={pendingTier ?? ""}
                      items={rungs.map((rung) => {
                        // What approving this rung would grant: itself plus any rung below it not
                        // already approved. Shrinks as lower rungs are granted, never as they are
                        // merely filed -- a queued rung has been promised nothing yet.
                        const grant = grantableXp(catalog, rung.group, rung.tier, held);
                        const isWaiting = waiting.includes(rung.type);
                        const isHeld = held.includes(rung.type);
                        return {
                          id: rung.type,
                          title: rung.label,
                          description: rung.description,
                          meta: isWaiting
                            ? "Awaiting review"
                            : isHeld
                              ? "Already logged"
                              : `+${XP_FORMATTER.format(grant)} XP on approval`,
                          disabled: isWaiting || isHeld || isSaving,
                        };
                      })}
                      onSelect={(id) => setPendingTier(id as AchievementType)}
                    />
                    <Alert tone="notice">{APPROVAL_NOTE}</Alert>
                    {error ? <Alert>{error}</Alert> : null}
                    <div className={styles.formActions}>
                      <Button
                        variant="tertiary"
                        disabled={isSaving}
                        onClick={() => goTo(pendingGroup && isFounderScoped(catalog, pendingGroup) ? "achievements" : "pick-project")}
                      >
                        ← Back
                      </Button>
                      <Button
                        size="lg"
                        disabled={isSaving || !pendingTier || selectable.length === 0}
                        onClick={() => goTo("achievement-evidence")}
                      >
                        Next
                      </Button>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : mode === "achievement-evidence" ? (
            <div className={styles.pane}>
              {(() => {
                const rung = catalog.find((entry) => entry.type === pendingTier);
                const busy = isSaving || isUploading;
                // At least one of the two. A note explains evidence, it does not replace it --
                // the same rule apply_project_achievement enforces.
                const hasEvidence = evidenceLink.trim().length > 0 || evidenceFile !== null;
                return (
                  <>
                    <div className={styles.stepIntro}>
                      <strong id="project-card-title">{rung?.evidencePrompt ?? "Show us"}</strong>
                      <span>{rung?.label}</span>
                    </div>

                    <p className={styles.evidenceHint}>{rung?.evidenceHint}</p>

                    <Field label="Link" htmlFor="evidence-link" hint="A dashboard, a post, a public page — anything we can open.">
                      {(field) => (
                        <input
                          {...field}
                          ref={firstFieldRef}
                          className={fieldControlClass}
                          type="url"
                          value={evidenceLink}
                          maxLength={2048}
                          inputMode="url"
                          autoCapitalize="none"
                          spellCheck={false}
                          placeholder="https://"
                          onChange={(event) => setEvidenceLink(event.target.value)}
                        />
                      )}
                    </Field>

                    <Field label="Screenshot" htmlFor="evidence-file" hint="PNG, JPG or WebP, up to 5MB.">
                      {(field) => (
                        <input
                          {...field}
                          className={fieldControlClass}
                          type="file"
                          accept={EVIDENCE_MIME_TYPES.join(",")}
                          onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
                        />
                      )}
                    </Field>

                    <Field label="Anything else we should know" htmlFor="evidence-note">
                      {(field) => (
                        <textarea
                          {...field}
                          className={fieldControlClass}
                          rows={2}
                          value={evidenceNote}
                          maxLength={500}
                          onChange={(event) => setEvidenceNote(event.target.value)}
                        />
                      )}
                    </Field>

                    {error ? <Alert>{error}</Alert> : null}

                    <div className={styles.formActions}>
                      <Button variant="tertiary" disabled={busy} onClick={() => goTo("achievement-tier")}>
                        ← Back
                      </Button>
                      <Button
                        size="lg"
                        disabled={busy || !hasEvidence}
                        onClick={() => void logAchievement()}
                      >
                        {isUploading ? "Uploading…" : isSaving ? "Sending…" : "Send for review"}
                      </Button>
                    </div>
                  </>
                );
              })()}
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
              {notice ? <Alert tone="notice">{notice}</Alert> : null}
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
              {notice ? <p role="status">{notice}</p> : null}
              <ChoiceList
                legend="Customise"
                items={[
                  { id: "founder", title: "Founder details", description: "Your name and X handle." },
                  { id: "billboard", title: "Billboard design", description: "The colours on your board." },
                  { id: "status", title: "Status bubble", description: "What you are working on, above your avatar.", meta: statusUnlocked ? undefined : "Unlocks at 390 XP" },
                ]}
                onSelect={(id) => goTo(id as CardMode)}
              />
              <div className={styles.formActions}>
                <Button variant="tertiary" onClick={() => goTo("view")}>← Back</Button>
                <span />
              </div>
            </div>
          ) : mode === "status" ? (
            <form className={styles.pane} onSubmit={saveStatus} aria-busy={isSaving}>
              <div className={styles.stepIntro}>
                <strong id="project-card-title">Status bubble</strong>
                <span>Your message appears above your plot while you are online.</span>
              </div>
              <div className={styles.statusPreview}>
                <OnlineFounderMarker
                  fullName={development.founder.fullName}
                  avatarUrl={development.founder.avatarUrl}
                  text={statusUnlocked ? statusText.trim() || "Online" : "Online"}
                />
              </div>
              {statusUnlocked ? (
                <>
                  <Field label="Status text" htmlFor="plot-status-text"
                    labelNote={`${statusTextLength(statusText)} / ${STATUS_TEXT_LIMIT}`}
                    hint="Leave empty to show Online. Up to 40 characters."
                    error={error ?? undefined}>
                    {(field) => <input {...field} ref={firstFieldRef} className={fieldControlClass}
                      value={statusText} placeholder="Online" disabled={isSaving}
                      onChange={(event) => { setStatusText(event.target.value); setError(null); }} />}
                  </Field>
                  <Button variant="tertiary" disabled={isSaving} onClick={() => { setStatusText(""); setError(null); }}>Reset to Online</Button>
                </>
              ) : <p>Reach 390 XP to customise your status. Your plot shows Online until then.</p>}
              <div className={styles.formActions}>
                <Button variant="tertiary" disabled={isSaving} onClick={() => goTo("customise")}>← Back</Button>
                {statusUnlocked ? <Button size="lg" type="submit" disabled={isSaving || !isOwner}>
                  {isSaving ? "Saving…" : "Save status"}
                </Button> : null}
              </div>
            </form>
          ) : mode === "founder" ? (
            <form className={styles.pane} onSubmit={saveFounder} aria-busy={isSaving}>
              <div className={styles.stepIntro}>
                <strong id="project-card-title">Founder details</strong>
                <span>{address}</span>
              </div>
              <Field label="Full name" htmlFor="founder-name">
                {(field) => <input {...field} ref={firstFieldRef} className={fieldControlClass} value={fullName} maxLength={60} required onChange={(event) => setFullName(event.target.value)} />}
              </Field>
              <Field label="Public bio (optional)" htmlFor="founder-bio">
                {(field) => <textarea {...field} className={fieldControlClass} value={bio} rows={3} aria-describedby="founder-bio-count" onChange={(event) => setBio(Array.from(event.target.value).slice(0, 160).join(""))} />}
              </Field>
              <small id="founder-bio-count">{Array.from(bio).length}/160 · Visible to everyone visiting your plot.</small>
              <Field label="X handle" htmlFor="founder-handle">
                {(field) => <input {...field} className={fieldControlClass} value={xHandle} maxLength={16} required autoCapitalize="none" spellCheck={false} onChange={(event) => setXHandle(event.target.value)} />}
              </Field>
              {error ? <Alert>{error}</Alert> : null}
              <div className={styles.formActions}>
                <Button variant="tertiary" disabled={isSaving} onClick={() => goTo("customise")}>← Back</Button>
                <Button size="lg" type="submit" disabled={isSaving}>{isSaving ? "Saving…" : "Save details"}</Button>
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
