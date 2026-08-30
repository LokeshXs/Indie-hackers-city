import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession } }),
}));
vi.mock("@/lib/supabase/config", () => ({ isSupabaseConfigured: () => true }));

import { GET } from "./route";

describe("Supabase OAuth callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    exchangeCodeForSession.mockResolvedValue({ error: null });
  });

  it("exchanges a code and returns to the selected plot", async () => {
    const request = new NextRequest("https://city.example/auth/callback?code=abc&next=%2F%3FclaimPlot%3Dpioneer%253Ajobs%253Anorth%253A01");
    const response = await GET(request);
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(response.headers.get("location")).toBe("https://city.example/?claimPlot=pioneer%3Ajobs%3Anorth%3A01");
  });

  it("falls back to the app root for an unsafe next URL", async () => {
    const request = new NextRequest("https://city.example/auth/callback?code=abc&next=https%3A%2F%2Fattacker.example");
    const response = await GET(request);
    expect(response.headers.get("location")).toBe("https://city.example/");
  });

  it("returns an OAuth error to the pending plot when exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: new Error("bad code") });
    const request = new NextRequest("https://city.example/auth/callback?code=bad&next=%2F%3FclaimPlot%3Dpioneer%253Ajobs%253Anorth%253A01");
    const response = await GET(request);
    expect(response.headers.get("location")).toBe("https://city.example/?claimPlot=pioneer%3Ajobs%3Anorth%3A01&authError=oauth");
  });
});
