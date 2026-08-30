import { describe, expect, it } from "vitest";
import { normalizeWebsite, validateProjectFormData } from "./validation";

function validFormData() {
  const formData = new FormData();
  formData.set("fullName", "Ada Founder");
  formData.set("xHandle", "@Ada_Builds");
  formData.set("projectName", "Analytical Engine");
  formData.set("websiteUrl", "https://example.com/project");
  formData.set("projectType", "website");
  formData.set("buildingAssetId", "startup-building-level-1");
  formData.set("buildingColor", "#d1ad6e");
  return formData;
}

describe("city project validation", () => {
  it("normalizes valid HTTP URLs and rejects other protocols or credentials", () => {
    expect(normalizeWebsite("https://example.com/project")).toBe("https://example.com/project");
    expect(normalizeWebsite("ftp://example.com/project")).toBeNull();
    expect(normalizeWebsite("https://user:secret@example.com")).toBeNull();
  });

  it("normalizes the X handle and accepts a valid claim", () => {
    const result = validateProjectFormData(validFormData());
    expect(result.error).toBeUndefined();
    expect(result.data?.xHandle).toBe("ada_builds");
  });

  it("accepts the Indie Garage building", () => {
    const formData = validFormData();
    formData.set("buildingAssetId", "indie-garage-level-1");
    const result = validateProjectFormData(formData);
    expect(result.error).toBeUndefined();
    expect(result.data?.buildingAssetId).toBe("indie-garage-level-1");
  });
});
