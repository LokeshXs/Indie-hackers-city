import type { User } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getUserAvatarUrl, getUserDisplayName, getUserInitials } from "./user-metadata";

function user(metadata: Record<string, unknown>, email = "founder@example.com"): User {
  return { id: "user-1", email, user_metadata: metadata } as User;
}

describe("auth user metadata", () => {
  it("uses defensive display-name and avatar priorities", () => {
    const value = user({ full_name: " Ada Lovelace ", name: "Ignored", avatar_url: " https://lh3.googleusercontent.com/a.png " });
    expect(getUserDisplayName(value)).toBe("Ada Lovelace");
    expect(getUserAvatarUrl(value)).toBe("https://lh3.googleusercontent.com/a.png");
    expect(getUserInitials(value)).toBe("AL");
  });

  it("falls back to the email initial when profile metadata is absent", () => {
    expect(getUserDisplayName(user({}))).toBe("");
    expect(getUserInitials(user({}))).toBe("F");
  });

  it("rejects non-Google and malformed avatar URLs", () => {
    expect(getUserAvatarUrl(user({ avatar_url: "https://attacker.example/a.png" }))).toBe("");
    expect(getUserAvatarUrl(user({ avatar_url: "not a url" }))).toBe("");
  });
});
