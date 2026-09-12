import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { isAchievementType } from "./achievements";
import type { AchievementType, StartupBuildingLevel } from "./types";

export interface RewardAchievement {
  type: AchievementType;
  label: string;
  xp: number;
}

/** What landed while the founder was away. Produced only when there is something worth showing:
 * the RPC returns no rows for a net loss or an empty window. */
export interface RewardAnnouncement {
  xpGained: number;
  previousXpTotal: number;
  xpTotal: number;
  previousBuildingLevel: StartupBuildingLevel;
  buildingLevel: StartupBuildingLevel;
  levelChanged: boolean;
  achievements: RewardAchievement[];
}

type AnnouncementRow = Database["public"]["Functions"]["reward_announcement"]["Returns"][number];

/** `achievements` crosses as jsonb, so it arrives as `Json` and has to be narrowed by hand rather
 * than trusted. An entry that does not parse is dropped: the XP figures are the important part and
 * a missing label should not cost the founder their celebration. */
function parseAchievements(value: AnnouncementRow["achievements"]): RewardAchievement[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return [];
    const { type, label, xp } = entry as Record<string, unknown>;
    if (!isAchievementType(type) || typeof label !== "string" || typeof xp !== "number") return [];
    return [{ type, label, xp }];
  });
}

export function serializeRewardAnnouncement(row: AnnouncementRow): RewardAnnouncement {
  return {
    xpGained: row.xp_gained,
    previousXpTotal: row.previous_xp_total,
    xpTotal: row.xp_total,
    previousBuildingLevel: row.previous_building_level as StartupBuildingLevel,
    buildingLevel: row.building_level as StartupBuildingLevel,
    levelChanged: row.level_changed,
    achievements: parseAchievements(row.achievements),
  };
}

/** Reading does not mark anything as seen, so a refresh part-way through the animation shows the
 * same announcement again rather than losing it. */
export async function loadRewardAnnouncement(
  supabase: SupabaseClient<Database>,
): Promise<RewardAnnouncement | null> {
  const { data, error } = await supabase.rpc("reward_announcement");
  if (error || !data?.[0]) return null;
  return serializeRewardAnnouncement(data[0]);
}

export async function acknowledgeRewards(supabase: SupabaseClient<Database>): Promise<void> {
  await supabase.rpc("acknowledge_rewards");
}
