import { describe, expect, it } from "vitest";
import { buildPublicTimeline, condenseTimeline } from "./timeline";
const date = "2026-09-14T00:00:00Z";
const definitions = [
  { achievement_type: "users_10", label: "10+ users", group_key: "users", tier: 1 },
  { achievement_type: "users_100", label: "100+ users", group_key: "users", tier: 3 },
  { achievement_type: "revenue_10", label: "$10 revenue", group_key: "revenue", tier: 1 },
];
const claim = { id: 1, project_id: "p", achievement_type: "users_10", status: "approved", reviewed_at: date, created_at: "2026-09-01T00:00:00Z" };
describe("public timeline", () => {
  it("groups simultaneous tiers and omits unapproved achievements", () => {
    const result = buildPublicTimeline([claim, { ...claim, id: 2, achievement_type: "users_100" }, { ...claim, id: 3, status: "pending" }, { ...claim, id: 4, status: "rejected" }], [{ id: "p", name: "BeatClub" }], definitions, date);
    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ label: "100+ users", projectName: "BeatClub", date });
  });
  it("includes other projects and founder revenue, ordered by approval with legacy fallback", () => {
    const result = buildPublicTimeline([claim, { ...claim, id: 2, project_id: "other", reviewed_at: null }, { ...claim, id: 3, project_id: null, achievement_type: "revenue_10" }], [{ id: "p", name: "One" }, { id: "other", name: "Two" }], definitions, date);
    expect(result.map((entry) => entry.projectName)).toEqual([null, "Two", "One", null]);
    expect(result[1].date).toBe(claim.created_at);
  });
  it("keeps six events visible and expands a longer history without losing any entries", () => {
    const milestones = Array.from({ length: 12 }, (_, index) => ({ id: String(index), category: "claim" as const, label: "Milestone", projectName: null, date }));
    expect(condenseTimeline(milestones.slice(0, 6), false)).toHaveLength(6);
    expect(condenseTimeline(milestones, false).map((item) => item.id)).toEqual(["0", "1", "gap", "9", "10", "11"]);
    expect(condenseTimeline(milestones, false)[2]).toEqual({ id: "gap", hidden: 7 });
    expect(condenseTimeline(milestones, true)).toEqual(milestones);
  });
});
