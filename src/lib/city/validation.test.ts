import { describe, expect, it } from "vitest";
import {
  formBoolean,
  normalizeWebsite,
  validateAppearance,
  validateClaimFormData,
  validateFounderFields,
  validateProjectDetails,
} from "./validation";

function validFormData() {
  const formData = new FormData();
  formData.set("fullName", "Ada Founder");
  formData.set("xHandle", "@Ada_Builds");
  formData.set("projectName", "Analytical Engine");
  formData.set("websiteUrl", "https://example.com/project");
  formData.set("projectType", "website");
  formData.set("buildingAssetId", "startup-building-level-1");
  formData.set("buildingColor", "#d1ad6e");
  formData.set("billboardTextColor", "#f7e0a6");
  formData.set("billboardBackgroundColor", "#1b3a4b");
  return formData;
}

describe("city project validation", () => {
  it("requires both billboard colors to be six-digit hex", () => {
    const formData = validFormData();
    formData.set("billboardTextColor", "wheat");
    expect(validateClaimFormData(formData).error).toBe("Choose a valid billboard text color.");

    const uppercase = validFormData();
    uppercase.set("billboardBackgroundColor", "#1B3A4B");
    expect(validateClaimFormData(uppercase).data?.billboardBackgroundColor).toBe("#1b3a4b");
  });

  it("normalizes valid HTTP URLs and rejects other protocols or credentials", () => {
    expect(normalizeWebsite("https://example.com/project")).toBe("https://example.com/project");
    expect(normalizeWebsite("ftp://example.com/project")).toBeNull();
    expect(normalizeWebsite("https://user:secret@example.com")).toBeNull();
  });

  it("normalizes the X handle and accepts a valid claim", () => {
    const result = validateClaimFormData(validFormData());
    expect(result.error).toBeUndefined();
    expect(result.data?.xHandle).toBe("ada_builds");
  });

  it("accepts the Indie Garage building", () => {
    const formData = validFormData();
    formData.set("buildingAssetId", "indie-garage-level-1");
    const result = validateClaimFormData(formData);
    expect(result.error).toBeUndefined();
    expect(result.data?.buildingAssetId).toBe("indie-garage-level-1");
  });
});

// The narrow validators exist so the edit routes stop demanding all nine claim fields. Each must
// ignore the fields it does not own.
describe("narrow field validators", () => {
  it("validates project details without any founder or building fields", () => {
    const formData = new FormData();
    formData.set("projectName", "Xenith");
    formData.set("websiteUrl", "https://xenith.dev");
    formData.set("projectType", "website");

    const result = validateProjectDetails(formData);
    expect(result.error).toBeUndefined();
    expect(result.data?.projectName).toBe("Xenith");
  });

  it("validates founder fields without any project fields", () => {
    const formData = new FormData();
    formData.set("fullName", "Ada Builds");
    formData.set("xHandle", "@Ada_Builds");

    const result = validateFounderFields(formData);
    expect(result.error).toBeUndefined();
    expect(result.data?.xHandle).toBe("ada_builds");
  });

  it("validates appearance without a building asset", () => {
    const formData = new FormData();
    formData.set("buildingColor", "#5FA8D3");
    formData.set("billboardTextColor", "#F7E0A6");
    formData.set("billboardBackgroundColor", "#1B3A4B");

    const result = validateAppearance(formData);
    expect(result.error).toBeUndefined();
    expect(result.data?.buildingColor).toBe("#5fa8d3");
  });

  it("reads only an explicit \"true\" as a checked box", () => {
    const formData = new FormData();
    formData.set("showcase", "true");
    expect(formBoolean(formData, "showcase")).toBe(true);
    formData.set("showcase", "false");
    expect(formBoolean(formData, "showcase")).toBe(false);
    expect(formBoolean(formData, "missing")).toBe(false);
  });
});
