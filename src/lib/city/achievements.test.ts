import { describe, expect, it } from "vitest";
import { summarisePendingClaims } from "./achievements";
import type { AchievementDefinition, FounderProject } from "./types";

const CATALOG: AchievementDefinition[] = [
  { type: "product_launched", label: "Launched a new product", description: "", xpReward: 100, sortOrder: 1, group: "launch", scope: "project", tier: 1, requiresNewProject: true, evidencePrompt: "Show us", evidenceHint: "A link or a screenshot." },
  { type: "users_10", label: "10 users", description: "", xpReward: 5, sortOrder: 2, group: "users", scope: "project", tier: 1, requiresNewProject: false, evidencePrompt: "Show us", evidenceHint: "A link or a screenshot." },
  { type: "users_50", label: "50 users", description: "", xpReward: 25, sortOrder: 3, group: "users", scope: "project", tier: 2, requiresNewProject: false, evidencePrompt: "Show us", evidenceHint: "A link or a screenshot." },
  { type: "users_100", label: "100+ users", description: "", xpReward: 50, sortOrder: 4, group: "users", scope: "project", tier: 3, requiresNewProject: false, evidencePrompt: "Show us", evidenceHint: "A link or a screenshot." },
  { type: "revenue_10", label: "$10 earned", description: "", xpReward: 50, sortOrder: 5, group: "revenue", scope: "founder", tier: 1, requiresNewProject: false, evidencePrompt: "Show us", evidenceHint: "A link or a screenshot." },
  { type: "revenue_100", label: "$100+ earned", description: "", xpReward: 150, sortOrder: 6, group: "revenue", scope: "founder", tier: 2, requiresNewProject: false, evidencePrompt: "Show us", evidenceHint: "A link or a screenshot." },
];

function project(overrides: Partial<FounderProject> = {}): FounderProject {
  return {
    id: "project-1",
    name: "Garageware",
    websiteUrl: "https://garageware.example/",
    type: "app",
    isShowcased: true,
    achievements: [],
    pendingAchievements: [],
    createdAt: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("summarisePendingClaims", () => {
  it("reports nothing when the queue is empty", () => {
    expect(summarisePendingClaims(CATALOG, [project()], [], [])).toEqual({
      count: 0,
      xp: 0,
      claims: [],
    });
  });

  it("counts the rungs a waiting claim would drag up with it", () => {
    const summary = summarisePendingClaims(
      CATALOG,
      [project({ pendingAchievements: ["users_100"] })],
      [],
      [],
    );

    expect(summary.count).toBe(1);
    // 50 for the rung itself, plus the 5 and 25 the cascade grants on the way past.
    expect(summary.xp).toBe(80);
    expect(summary.claims[0]).toEqual({
      type: "users_100",
      label: "100+ users",
      projectName: "Garageware",
    });
  });

  it("does not count a rung twice when two tiers of one group are waiting", () => {
    const summary = summarisePendingClaims(
      CATALOG,
      [project({ pendingAchievements: ["users_10", "users_100"] })],
      [],
      [],
    );

    // Two claims in the queue, but approving the top one settles both: 80, not 85.
    expect(summary.count).toBe(2);
    expect(summary.xp).toBe(80);
  });

  it("excludes rungs already approved", () => {
    const summary = summarisePendingClaims(
      CATALOG,
      [project({ achievements: ["users_10"], pendingAchievements: ["users_100"] })],
      [],
      [],
    );

    expect(summary.xp).toBe(75);
  });

  it("attaches founder-scoped claims to no project", () => {
    const summary = summarisePendingClaims(CATALOG, [project()], [], ["revenue_100"]);

    expect(summary.xp).toBe(200);
    expect(summary.claims).toEqual([
      { type: "revenue_100", label: "$100+ earned", projectName: null },
    ]);
  });

  it("adds up claims spread across several projects", () => {
    const summary = summarisePendingClaims(
      CATALOG,
      [
        project({ pendingAchievements: ["users_10"] }),
        project({ id: "project-2", name: "Tideline", pendingAchievements: ["product_launched"] }),
      ],
      [],
      ["revenue_10"],
    );

    expect(summary.count).toBe(3);
    expect(summary.xp).toBe(5 + 100 + 50);
    expect(summary.claims.map((claim) => claim.projectName)).toEqual([
      "Garageware", "Tideline", null,
    ]);
  });
});
