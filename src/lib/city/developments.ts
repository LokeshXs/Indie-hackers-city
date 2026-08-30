import type { Database } from "@/lib/supabase/database.types";
import type { CityDevelopment, CityDevelopmentRecord, ProjectType, StartupBuildingAssetId, StartupBuildingLevel } from "./types";

export type CityDevelopmentRow = Database["public"]["Views"]["city_developments"]["Row"];

function startupBuildingLevel(value: number | null): StartupBuildingLevel {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) return value;
  return 1;
}

export function serializeCityDevelopment(row: CityDevelopmentRow): CityDevelopment {
  const buildingLevel = startupBuildingLevel(row.building_level);
  return {
    plotId: row.plot_id!,
    ownerId: row.owner_id!,
    project: {
      id: row.project_id!,
      name: row.project_name!,
      websiteUrl: row.website_url!,
      type: row.project_type as ProjectType,
    },
    founder: {
      fullName: row.founder_name!,
      xHandle: row.x_handle,
      avatarUrl: row.avatar_url,
    },
    building: {
      level: buildingLevel,
      assetId: row.building_asset_id as StartupBuildingAssetId,
      color: row.building_color!,
    },
    progression: {
      xp: row.xp_total ?? 0,
      buildingLevel,
      currentLevelXp: row.current_level_xp ?? 0,
      nextLevelXp: row.next_level_xp,
    },
    claimedAt: row.claimed_at!,
    updatedAt: row.updated_at!,
  };
}

export function cityDevelopmentRecord(rows: CityDevelopmentRow[]): CityDevelopmentRecord {
  return Object.fromEntries(rows.map((row) => {
    const development = serializeCityDevelopment(row);
    return [development.plotId, development];
  }));
}
