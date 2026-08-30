import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./safe-redirect";

describe("safeInternalPath", () => {
  it.each([
    ["/", "/"],
    ["/?claimPlot=pioneer%3Ajobs%3Anorth%3A01", "/?claimPlot=pioneer%3Ajobs%3Anorth%3A01"],
    ["/city#plot", "/city#plot"],
  ])("accepts safe app path %s", (value, expected) => {
    expect(safeInternalPath(value)).toBe(expected);
  });

  it.each([
    "https://attacker.example",
    "//attacker.example",
    "/\\attacker.example",
    "/%5c%5cattacker.example",
    "/%252f%252fattacker.example",
    "%E0%A4%A",
    "",
  ])("rejects unsafe path %s", (value) => {
    expect(safeInternalPath(value)).toBe("/");
  });
});
