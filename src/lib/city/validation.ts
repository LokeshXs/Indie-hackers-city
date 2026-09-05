import {
  BUILDING_COLORS,
  HEX_COLOR_PATTERN,
  PROJECT_TYPES,
  STARTUP_BUILDING_ASSET_IDS,
  X_HANDLE_PATTERN,
} from "./constants";
import type { ProjectType, StartupBuildingAssetId } from "./types";

export interface ValidatedProjectFields {
  fullName: string;
  xHandle: string;
  projectName: string;
  websiteUrl: string;
  projectType: ProjectType;
  buildingAssetId: StartupBuildingAssetId;
  buildingColor: string;
  billboardTextColor: string;
  billboardBackgroundColor: string;
}

export interface ValidationResult<T> {
  data?: T;
  error?: string;
}

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    return (url.protocol === "http:" || url.protocol === "https:")
      && Boolean(url.hostname)
      && !url.username
      && !url.password
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export interface ValidatedFounderFields {
  fullName: string;
  xHandle: string;
}

export interface ValidatedProjectDetails {
  projectName: string;
  websiteUrl: string;
  projectType: ProjectType;
}

export interface ValidatedBuildingChoice {
  buildingAssetId: StartupBuildingAssetId;
}

export interface ValidatedAppearance {
  buildingColor: string;
  billboardTextColor: string;
  billboardBackgroundColor: string;
}

export function validateFounderFields(formData: FormData): ValidationResult<ValidatedFounderFields> {
  const fullName = formString(formData, "fullName");
  const xHandle = formString(formData, "xHandle").replace(/^@/, "").toLowerCase();

  if (!fullName || fullName.length > 60) return { error: "Enter a founder name of 60 characters or fewer." };
  if (!X_HANDLE_PATTERN.test(xHandle)) return { error: "Enter a valid X handle." };

  return { data: { fullName, xHandle } };
}

export function validateProjectDetails(formData: FormData): ValidationResult<ValidatedProjectDetails> {
  const projectName = formString(formData, "projectName");
  const websiteUrl = normalizeWebsite(formString(formData, "websiteUrl"));
  const projectType = formString(formData, "projectType");

  if (!projectName || projectName.length > 40) return { error: "Enter a project name of 40 characters or fewer." };
  if (!websiteUrl || websiteUrl.length > 2048) return { error: "Enter a valid HTTP or HTTPS project URL." };
  if (!(PROJECT_TYPES as readonly string[]).includes(projectType)) return { error: "Choose a valid project type." };

  return { data: { projectName, websiteUrl, projectType: projectType as ProjectType } };
}

export function validateBuildingChoice(formData: FormData): ValidationResult<ValidatedBuildingChoice> {
  const buildingAssetId = formString(formData, "buildingAssetId");

  if (!(STARTUP_BUILDING_ASSET_IDS as readonly string[]).includes(buildingAssetId)) {
    return { error: "Choose a valid building." };
  }

  return { data: { buildingAssetId: buildingAssetId as StartupBuildingAssetId } };
}

export function validateAppearance(formData: FormData): ValidationResult<ValidatedAppearance> {
  const buildingColor = formString(formData, "buildingColor").toLowerCase();
  const billboardTextColor = formString(formData, "billboardTextColor").toLowerCase();
  const billboardBackgroundColor = formString(formData, "billboardBackgroundColor").toLowerCase();

  if (!(BUILDING_COLORS as readonly string[]).includes(buildingColor)) return { error: "Choose a valid building color." };
  if (!HEX_COLOR_PATTERN.test(billboardTextColor)) return { error: "Choose a valid billboard text color." };
  if (!HEX_COLOR_PATTERN.test(billboardBackgroundColor)) return { error: "Choose a valid billboard background color." };

  return { data: { buildingColor, billboardTextColor, billboardBackgroundColor } };
}

/** Only the claim needs all nine fields. Composed in the original order so every error message and
 * its precedence are preserved exactly. */
export function validateClaimFormData(formData: FormData): ValidationResult<ValidatedProjectFields> {
  const founder = validateFounderFields(formData);
  if (!founder.data) return { error: founder.error };

  const project = validateProjectDetails(formData);
  if (!project.data) return { error: project.error };

  const building = validateBuildingChoice(formData);
  if (!building.data) return { error: building.error };

  const appearance = validateAppearance(formData);
  if (!appearance.data) return { error: appearance.error };

  return { data: { ...founder.data, ...project.data, ...building.data, ...appearance.data } };
}

export function formBoolean(formData: FormData, key: string): boolean {
  return formString(formData, key) === "true";
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

