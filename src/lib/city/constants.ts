import type { ProjectType, StartupBuildingAssetId } from "./types";

export const PROJECT_TYPES = ["website", "app", "chrome-extension"] as const satisfies readonly ProjectType[];
export const STARTUP_BUILDING_ASSET_IDS = [
  "startup-building-level-1",
  "corner-studio-level-1",
] as const satisfies readonly StartupBuildingAssetId[];

export const BUILDING_COLORS = [
  "#d1ad6e",
  "#e2775c",
  "#5fa8d3",
  "#7fa87a",
  "#f0c94b",
  "#9b8ac4",
  "#e8a0b4",
  "#5b6670",
] as const;

export const BUILDING_COLOR_OPTIONS: ReadonlyArray<{ id: string; label: string; hex: string }> = [
  { id: "cream", label: "Classic Cream", hex: BUILDING_COLORS[0] },
  { id: "coral", label: "Coral", hex: BUILDING_COLORS[1] },
  { id: "sky", label: "Sky Blue", hex: BUILDING_COLORS[2] },
  { id: "sage", label: "Sage Green", hex: BUILDING_COLORS[3] },
  { id: "sun", label: "Sunny Yellow", hex: BUILDING_COLORS[4] },
  { id: "lavender", label: "Lavender", hex: BUILDING_COLORS[5] },
  { id: "blush", label: "Blush Pink", hex: BUILDING_COLORS[6] },
  { id: "charcoal", label: "Charcoal", hex: BUILDING_COLORS[7] },
];

export const X_HANDLE_PATTERN = /^@?[A-Za-z0-9_]{1,15}$/;

