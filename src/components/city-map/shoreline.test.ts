import { describe, expect, it } from "vitest";
import { shorelineDistance, shorelineRadius } from "./shoreline";

describe("shoreline", () => {
  it("keeps the entire paved city inside the beach and the coast inside camera bounds", () => {
    for (let i = 0; i < 1024; i++) {
      const angle = i / 1024 * Math.PI * 2;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const paved = Math.min(69.2 / Math.abs(cos), 68.55 / Math.abs(sin));
      const coast = shorelineRadius(angle, 69.2, 68.55);
      expect(coast - paved).toBeGreaterThan(2);
      expect(Math.abs(cos * coast)).toBeLessThan(69.2 * 1.19 + 19);
      expect(Math.abs(sin * coast)).toBeLessThan(68.55 * 1.19 + 19);
    }
  });

  it("closes seamlessly and measures water depth from the irregular coast", () => {
    expect(shorelineRadius(0, 69.2, 68.55)).toBeCloseTo(shorelineRadius(2 * Math.PI, 69.2, 68.55), 10);
    expect(shorelineDistance(0, 0, 69.2, 68.55)).toBe(0);
    for (const angle of [0.3, 1.8, 3.5, 5.2]) {
      const radius = shorelineRadius(angle, 69.2, 68.55);
      expect(shorelineDistance(Math.cos(angle) * (radius + 10), Math.sin(angle) * (radius + 10), 69.2, 68.55)).toBeCloseTo(10);
    }
  });
});
