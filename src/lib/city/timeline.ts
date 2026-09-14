import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import type { AchievementGroup } from "./types";

export interface PublicMilestone {
  id: string;
  category: AchievementGroup | "claim";
  label: string;
  projectName: string | null;
  date: string;
}
type Claim = Pick<Database["public"]["Tables"]["project_achievements"]["Row"], "id" | "project_id" | "achievement_type" | "status" | "reviewed_at" | "created_at">;
type Definition = Pick<Database["public"]["Tables"]["achievement_definitions"]["Row"], "achievement_type" | "label" | "group_key" | "tier">;

export function buildPublicTimeline(claims: Claim[], projects: { id: string; name: string }[], definitions: Definition[], claimedAt: string): PublicMilestone[] {
  const catalog = new Map(definitions.map((definition) => [definition.achievement_type, definition]));
  const names = new Map(projects.map((project) => [project.id, project.name]));
  const grouped = new Map<string, { milestone: PublicMilestone; tier: number }>();
  for (const claim of claims) {
    if (claim.status !== "approved") continue;
    const definition = catalog.get(claim.achievement_type);
    if (!definition) continue;
    const date = claim.reviewed_at ?? claim.created_at;
    const key = `${claim.project_id ?? "founder"}:${definition.group_key}:${date}`;
    if ((grouped.get(key)?.tier ?? -1) >= definition.tier) continue;
    grouped.set(key, { tier: definition.tier, milestone: {
      id: String(claim.id), category: definition.group_key as AchievementGroup,
      label: definition.label, projectName: claim.project_id ? names.get(claim.project_id) ?? "Project" : null, date,
    } });
  }
  return [
    { id: "claim", category: "claim", label: "Claimed a plot", projectName: null, date: claimedAt },
    ...Array.from(grouped.values(), ({ milestone }) => milestone).sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.id.localeCompare(b.id, undefined, { numeric: true })),
  ];
}

export async function loadPublicTimeline(client: SupabaseClient<Database>, ownerId: string, claimedAt: string): Promise<PublicMilestone[]> {
  const [projects, claims, definitions] = await Promise.all([
    client.from("projects").select("id, name").eq("owner_id", ownerId),
    client.from("project_achievements").select("id, project_id, achievement_type, status, reviewed_at, created_at").eq("owner_id", ownerId).eq("status", "approved"),
    client.from("achievement_definitions").select("achievement_type, label, group_key, tier"),
  ]);
  if (projects.error || claims.error || definitions.error) throw new Error("Timeline unavailable");
  return buildPublicTimeline(claims.data ?? [], projects.data ?? [], definitions.data ?? [], claimedAt);
}

export function condenseTimeline(milestones: PublicMilestone[], expanded: boolean): (PublicMilestone | { id: "gap"; hidden: number })[] {
  return expanded || milestones.length <= 6 ? milestones : [...milestones.slice(0, 2), { id: "gap", hidden: milestones.length - 5 }, ...milestones.slice(-3)];
}
