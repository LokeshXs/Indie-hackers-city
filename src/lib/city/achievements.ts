import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { ACHIEVEMENT_TYPES } from "./constants";
import type {
  AchievementDefinition,
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

/** Reads the founder's portfolio. Both tables are publicly readable, so this works from a server
 * route or the browser with the same code. */
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
