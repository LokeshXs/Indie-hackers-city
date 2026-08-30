import type { Database } from "@/lib/supabase/database.types";
import type { CityDevelopment, CityDevelopmentRecord, ProjectType, StartupBuildingAssetId } from "./types";

export type CityDevelopmentRow = Database["public"]["Views"]["city_developments"]["Row"];

export function serializeCityDevelopment(row: CityDevelopmentRow): CityDevelopment {
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
      level: row.building_level as 1,
      assetId: row.building_asset_id as StartupBuildingAssetId,
      color: row.building_color!,
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
