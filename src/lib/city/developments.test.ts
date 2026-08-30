import { describe, expect, it } from "vitest";
import type { CityDevelopmentRow } from "./developments";
import { cityDevelopmentRecord, serializeCityDevelopment } from "./developments";

function developmentRow(overrides: Partial<CityDevelopmentRow> = {}): CityDevelopmentRow {
  return {
    avatar_url: null,
    building_asset_id: "startup-building-level-1",
    building_color: "#d1ad6e",
    building_level: 1,
    claimed_at: "2026-08-30T00:00:00.000Z",
    current_level_xp: 0,
    founder_name: "Ada Founder",
    owner_id: "00000000-0000-4000-8000-000000000001",
    plot_id: "pioneer:jobs:north:01",
    project_id: "10000000-0000-4000-8000-000000000001",
    project_name: "First Project",
    project_type: "website",
    next_level_xp: 100,
    updated_at: "2026-08-30T00:00:00.000Z",
    website_url: "https://example.test/",
    x_handle: "ada_founder",
    xp_total: 0,
    ...overrides,
  };
}

describe("city development serialization", () => {
  it("maps public XP and a higher logical building level without changing the asset", () => {
    const development = serializeCityDevelopment(developmentRow({
      building_asset_id: "corner-studio-level-1",
      building_level: 4,
      current_level_xp: 700,
      next_level_xp: 1500,
      xp_total: 725,
    }));

    expect(development.progression).toEqual({ xp: 725, buildingLevel: 4, currentLevelXp: 700, nextLevelXp: 1500 });
    expect(development.building).toEqual({
      level: 4,
      assetId: "corner-studio-level-1",
      color: "#d1ad6e",
    });
  });

  it("falls back safely when a malformed level reaches the serializer", () => {
    const development = serializeCityDevelopment(developmentRow({ building_level: 99, xp_total: null }));

    expect(development.progression).toEqual({ xp: 0, buildingLevel: 1, currentLevelXp: 0, nextLevelXp: 100 });
    expect(development.building.level).toBe(1);
  });

  it("indexes serialized developments by plot ID", () => {
    const rows = [
      developmentRow(),
      developmentRow({ plot_id: "pioneer:jobs:north:02", xp_total: 300, building_level: 3, current_level_xp: 300, next_level_xp: 700 }),
    ];

    const record = cityDevelopmentRecord(rows);
    expect(Object.keys(record)).toEqual(["pioneer:jobs:north:01", "pioneer:jobs:north:02"]);
    expect(record["pioneer:jobs:north:02"].progression).toEqual({ xp: 300, buildingLevel: 3, currentLevelXp: 300, nextLevelXp: 700 });
  });
});
