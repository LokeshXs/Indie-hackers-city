import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { ACHIEVEMENT_TYPES } from "./constants";
import type {
  AchievementDefinition,
  AchievementGroup,
  AchievementScope,
  AchievementType,
  FounderProject,
  ProjectType,
} from "./types";

type AchievementDefinitionRow = Database["public"]["Tables"]["achievement_definitions"]["Row"];
type ProjectAchievementRow = Database["public"]["Tables"]["project_achievements"]["Row"];
type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];

/** Exactly the columns the portfolio reads. Pinned to a Pick rather than the whole Row so that a
 * column added to `projects` does not silently make the select and this signature disagree. */
type FounderProjectRow = Pick<
  ProjectRow, "id" | "name" | "website_url" | "project_type" | "created_at"
>;

export function isAchievementType(value: unknown): value is AchievementType {
  return typeof value === "string" && (ACHIEVEMENT_TYPES as readonly string[]).includes(value);
}

export function serializeAchievementDefinition(row: AchievementDefinitionRow): AchievementDefinition | null {
  // The catalog is a table, so a type added in SQL ahead of the client is possible. Drop rather
  // than widen: the UI can only render achievements it has a flow for.
  if (!isAchievementType(row.achievement_type)) return null;
  return {
    type: row.achievement_type,
    label: row.label,
    description: row.description,
    xpReward: row.xp_reward,
    sortOrder: row.sort_order,
    group: row.group_key as AchievementGroup,
    scope: row.scope as AchievementScope,
    tier: row.tier,
    requiresNewProject: row.requires_new_project,
    evidencePrompt: row.evidence_prompt,
    evidenceHint: row.evidence_hint,
  };
}

export function serializeAchievementDefinitions(rows: AchievementDefinitionRow[]): AchievementDefinition[] {
  return rows
    .map(serializeAchievementDefinition)
    .filter((definition): definition is AchievementDefinition => definition !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

type AchievementClaimRow = Pick<ProjectAchievementRow, "project_id" | "achievement_type" | "status">;

/** Joined in JS rather than through a PostgREST embed: project_achievements reaches projects only
 * via the composite (project_id, owner_id) foreign key, and embedding over composite keys is
 * fragile. Two indexed selects are cheaper than the alternative.
 *
 * Rejected rows are dropped on purpose. A rung turned down is claimable again, so treating it as
 * held would strand the founder on a milestone they have genuinely since reached. */
export function serializeFounderProjects(
  projectRows: FounderProjectRow[],
  achievementRows: AchievementClaimRow[],
  showcasedProjectId: string,
): FounderProject[] {
  const approvedByProject = new Map<string, AchievementType[]>();
  const pendingByProject = new Map<string, AchievementType[]>();

  for (const row of achievementRows) {
    if (!isAchievementType(row.achievement_type)) continue;
    // A null project_id marks a founder-scoped claim; those belong to the portfolio, not a project.
    if (row.project_id === null) continue;
    const bucket = row.status === "approved" ? approvedByProject
      : row.status === "pending" ? pendingByProject
      : null;
    if (!bucket) continue;
    const existing = bucket.get(row.project_id);
    if (existing) existing.push(row.achievement_type);
    else bucket.set(row.project_id, [row.achievement_type]);
  }

  return projectRows.map((row) => ({
    id: row.id,
    name: row.name,
    websiteUrl: row.website_url,
    type: row.project_type as ProjectType,
    isShowcased: row.id === showcasedProjectId,
    achievements: approvedByProject.get(row.id) ?? [],
    pendingAchievements: pendingByProject.get(row.id) ?? [],
    createdAt: row.created_at,
  }));
}

/** The achievement catalog, straight from the table that awards read. The UI used to mirror this by
 * hand; now that a rung's reward feeds an on-screen "+80 XP" preview, a drifted copy would misstate
 * amounts rather than just labels. */
export async function loadAchievementCatalog(
  supabase: SupabaseClient<Database>,
): Promise<AchievementDefinition[]> {
  const { data, error } = await supabase
    .from("achievement_definitions")
    .select("achievement_type, label, description, xp_reward, sort_order, group_key, tier, scope, requires_new_project, evidence_prompt, evidence_hint");
  if (error || !data) return [];
  return serializeAchievementDefinitions(data as AchievementDefinitionRow[]);
}

/** Reads the founder's portfolio. Both tables are publicly readable, so this works from a server
 * route or the browser with the same code. */
/** Founder-scoped claims: the rows that carry no project, split the same way. */
export function serializeFounderAchievements(
  achievementRows: AchievementClaimRow[],
): { approved: AchievementType[]; pending: AchievementType[] } {
  const founderScoped = achievementRows.filter(
    (row) => row.project_id === null && isAchievementType(row.achievement_type),
  );
  return {
    approved: founderScoped
      .filter((row) => row.status === "approved")
      .map((row) => row.achievement_type as AchievementType),
    pending: founderScoped
      .filter((row) => row.status === "pending")
      .map((row) => row.achievement_type as AchievementType),
  };
}

export async function loadFounderProjects(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  showcasedProjectId: string,
): Promise<FounderProject[]> {
  const [projects, achievements] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, website_url, project_type, created_at")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true }),
    supabase
      .from("project_achievements")
      .select("project_id, achievement_type, status")
      .eq("owner_id", ownerId),
  ]);

  if (projects.error || !projects.data) return [];
  return serializeFounderProjects(projects.data, achievements.data ?? [], showcasedProjectId);
}

/** The portfolio in one read: per-project claims and the founder-scoped ones, which live in the
 * same table separated only by whether project_id is set. */
export async function loadFounderPortfolio(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  showcasedProjectId: string,
): Promise<{
  projects: FounderProject[];
  founderAchievements: AchievementType[];
  pendingFounderAchievements: AchievementType[];
}> {
  const [projects, achievements] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, website_url, project_type, created_at")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true }),
    supabase
      .from("project_achievements")
      .select("project_id, achievement_type, status")
      .eq("owner_id", ownerId),
  ]);

  const rows = achievements.data ?? [];
  const founderScoped = serializeFounderAchievements(rows);
  return {
    projects: projects.error || !projects.data
      ? []
      : serializeFounderProjects(projects.data, rows, showcasedProjectId),
    founderAchievements: founderScoped.approved,
    pendingFounderAchievements: founderScoped.pending,
  };
}

export interface PendingClaim {
  type: AchievementType;
  label: string;
  /** Null for founder-scoped rungs, which belong to the portfolio rather than a product. */
  projectName: string | null;
}

export interface PendingClaimSummary {
  count: number;
  /** XP the founder gains if every waiting claim is approved. */
  xp: number;
  claims: PendingClaim[];
}

/** What a founder is currently waiting on, for the banner that has to survive closing the card.
 *
 * The XP is not a naive sum of the waiting rungs. Approval cascades, so a project with both
 * `users_10` and `users_100` in the queue gains 80 in total, not 85 — approving the top rung grants
 * the bottom one on the way past. Counting the highest waiting tier per group, against the rungs
 * already approved, is what the database would actually award. */
export function summarisePendingClaims(
  catalog: readonly AchievementDefinition[],
  projects: readonly FounderProject[],
  founderAchievements: readonly AchievementType[],
  pendingFounderAchievements: readonly AchievementType[],
): PendingClaimSummary {
  const definitionByType = new Map(catalog.map((entry) => [entry.type, entry]));

  const targets = [
    ...projects.map((project) => ({
      name: project.name,
      approved: project.achievements,
      pending: project.pendingAchievements,
    })),
    { name: null, approved: founderAchievements, pending: pendingFounderAchievements },
  ];

  const claims: PendingClaim[] = [];
  let xp = 0;

  for (const target of targets) {
    const highestTierByGroup = new Map<AchievementGroup, number>();

    for (const type of target.pending) {
      const definition = definitionByType.get(type);
      if (!definition) continue;
      claims.push({ type, label: definition.label, projectName: target.name });
      highestTierByGroup.set(
        definition.group,
        Math.max(highestTierByGroup.get(definition.group) ?? 0, definition.tier),
      );
    }

    for (const [group, tier] of highestTierByGroup) {
      xp += catalog
        .filter((entry) => entry.group === group
          && entry.tier <= tier
          && !target.approved.includes(entry.type))
        .reduce((total, entry) => total + entry.xpReward, 0);
    }
  }

  return { count: claims.length, xp, claims };
}
