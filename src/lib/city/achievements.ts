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
  };
}

export function serializeAchievementDefinitions(rows: AchievementDefinitionRow[]): AchievementDefinition[] {
  return rows
    .map(serializeAchievementDefinition)
    .filter((definition): definition is AchievementDefinition => definition !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Joined in JS rather than through a PostgREST embed: project_achievements reaches projects only
 * via the composite (project_id, owner_id) foreign key, and embedding over composite keys is
 * fragile. Two indexed selects are cheaper than the alternative. */
export function serializeFounderProjects(
  projectRows: ProjectRow[],
  achievementRows: Pick<ProjectAchievementRow, "project_id" | "achievement_type">[],
  showcasedProjectId: string,
): FounderProject[] {
  const byProject = new Map<string, AchievementType[]>();
  for (const row of achievementRows) {
    if (!isAchievementType(row.achievement_type)) continue;
    // A null project_id marks a founder-scoped award; those belong to the portfolio, not a project.
    if (row.project_id === null) continue;
    const existing = byProject.get(row.project_id);
    if (existing) existing.push(row.achievement_type);
    else byProject.set(row.project_id, [row.achievement_type]);
  }

  return projectRows.map((row) => ({
    id: row.id,
    name: row.name,
    websiteUrl: row.website_url,
    type: row.project_type as ProjectType,
    isShowcased: row.id === showcasedProjectId,
    achievements: byProject.get(row.id) ?? [],
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
    .select("achievement_type, label, description, xp_reward, sort_order, group_key, tier, scope, requires_new_project");
  if (error || !data) return [];
  return serializeAchievementDefinitions(data as AchievementDefinitionRow[]);
}

/** Reads the founder's portfolio. Both tables are publicly readable, so this works from a server
 * route or the browser with the same code. */
/** Founder-scoped awards: the rows that carry no project. */
export function serializeFounderAchievements(
  achievementRows: Pick<ProjectAchievementRow, "project_id" | "achievement_type">[],
): AchievementType[] {
  return achievementRows
    .filter((row) => row.project_id === null && isAchievementType(row.achievement_type))
    .map((row) => row.achievement_type as AchievementType);
}

export async function loadFounderProjects(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  showcasedProjectId: string,
): Promise<FounderProject[]> {
  const [projects, achievements] = await Promise.all([
    supabase
      .from("projects")
      .select("id, owner_id, name, website_url, project_type, created_at, updated_at")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true }),
    supabase
      .from("project_achievements")
      .select("project_id, achievement_type")
      .eq("owner_id", ownerId),
  ]);

  if (projects.error || !projects.data) return [];
  return serializeFounderProjects(projects.data, achievements.data ?? [], showcasedProjectId);
}

/** The portfolio in one read: per-project awards and the founder-scoped ones, which live in the
 * same table separated only by whether project_id is set. */
export async function loadFounderPortfolio(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  showcasedProjectId: string,
): Promise<{ projects: FounderProject[]; founderAchievements: AchievementType[] }> {
  const [projects, achievements] = await Promise.all([
    supabase
      .from("projects")
      .select("id, owner_id, name, website_url, project_type, created_at, updated_at")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: true }),
    supabase
      .from("project_achievements")
      .select("project_id, achievement_type")
      .eq("owner_id", ownerId),
  ]);

  const rows = achievements.data ?? [];
  return {
    projects: projects.error || !projects.data
      ? []
      : serializeFounderProjects(projects.data, rows, showcasedProjectId),
    founderAchievements: serializeFounderAchievements(rows),
  };
}
