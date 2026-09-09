import { describe, expect, it } from "vitest";
import { cafeMembers, readMember } from "./presence";

const member = { userId: "founder", seatId: "seat", name: "A Founder", intention: "Working", avatarUrl: "", joinedAt: 100, updatedAt: 100 };

describe("cafe payloads", () => {
  it("discards malformed data and restricts remote avatars", () => {
    expect(readMember(null)).toBeNull();
    expect(readMember({ ...member, updatedAt: Infinity })).toBeNull();
    expect(readMember({ ...member, avatarUrl: "https://untrusted.example/track" })?.avatarUrl).toBe("");
    expect(readMember({ ...member, intention: "x".repeat(200) })?.intention).toHaveLength(100);
    expect(readMember({ ...member, name: " " })?.name).toBe("Founder");
  });
  it("uses one row per account even when device presence keys differ", () => {
    expect(cafeMembers({ a: [member], b: [{ ...member, updatedAt: 101, intention: "Latest" }], bad: [{}] }))
      .toEqual([{ ...member, updatedAt: 101, intention: "Latest" }]);
  });
});
