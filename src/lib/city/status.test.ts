import { describe, expect, it } from "vitest";
import { plotStatusLabel, validateStatusText } from "./status";

describe("plot status text", () => {
  it("trims messages and resets whitespace or null to the default", () => {
    expect(validateStatusText("  Shipping today  ")).toEqual({ data: { statusText: "Shipping today" } });
    expect(validateStatusText(" \n\t ")).toEqual({ data: { statusText: null } });
    expect(validateStatusText(null)).toEqual({ data: { statusText: null } });
  });

  it("accepts 40 Unicode code points, including emoji, and rejects 41", () => {
    expect(validateStatusText("🚀".repeat(40)).data?.statusText).toHaveLength(80);
    expect(validateStatusText("🚀".repeat(41)).error).toBeTruthy();
  });

  it.each([undefined, 42, {}, ["Hi"], "two\nlines", "two\rlines", "two\u2028lines", "two\u2029lines"])("rejects invalid input %j", (input) => {
    expect(validateStatusText(input).error).toBeTruthy();
  });

  it("shows custom text only while the status reward is unlocked", () => {
    expect(plotStatusLabel("Shipping", 109)).toBe("Online");
    expect(plotStatusLabel("Shipping", 110)).toBe("Shipping");
    expect(plotStatusLabel(null, 110)).toBe("Online");
    expect(plotStatusLabel("", 110)).toBe("Online");
  });
});
