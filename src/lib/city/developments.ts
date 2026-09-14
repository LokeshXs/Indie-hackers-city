import type { Database } from "@/lib/supabase/database.types";
import {
  DEFAULT_BILLBOARD_BACKGROUND_COLOR,
  DEFAULT_BILLBOARD_TEXT_COLOR,
  LEVEL_TWO_BUILDING_ASSET_IDS,
  STARTUP_BUILDING_ASSET_IDS,
} from "./constants";
import type { CityDevelopment, CityDevelopmentRecord, PlotBuildingAssetId, ProjectType, StartupBuildingLevel } from "./types";

export type CityDevelopmentRow = Database["public"]["Views"]["city_developments"]["Row"];

function startupBuildingLevel(value: number | null): StartupBuildingLevel {
  if (value === 1 || value === 2 || value === 3 || value === 4 || value === 5) return value;
  return 1;
}

const KNOWN_BUILDING_ASSET_IDS: readonly PlotBuildingAssetId[] = [
  ...STARTUP_BUILDING_ASSET_IDS,
  ...LEVEL_TWO_BUILDING_ASSET_IDS,
];

/** The column is `text`, so the database can hand us anything. This used to be a bare `as` cast,
 * which meant an unrecognised value type-checked cleanly and then threw further downstream, where
 * CITY_ASSET_PATHS[assetId] resolves to undefined and useGLTF is handed it. Narrow here instead
 * and fall back to the starter shell, the same shape as startupBuildingLevel above. */
function plotBuildingAssetId(value: string | null): PlotBuildingAssetId {
  return KNOWN_BUILDING_ASSET_IDS.find((id) => id === value) ?? "startup-building-level-1";
}

export function serializeCityDevelopment(row: CityDevelopmentRow): CityDevelopment {
  const buildingLevel = startupBuildingLevel(row.building_level);
  return {
    plotId: row.plot_id!,
    ownerId: row.owner_id!,
    statusText: row.status_text ?? null,
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
      bio: row.bio ?? null,
    },
    building: {
      level: buildingLevel,
      assetId: plotBuildingAssetId(row.building_asset_id),
    },
    billboard: {
      textColor: row.billboard_text_color ?? DEFAULT_BILLBOARD_TEXT_COLOR,
      backgroundColor: row.billboard_background_color ?? DEFAULT_BILLBOARD_BACKGROUND_COLOR,
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
