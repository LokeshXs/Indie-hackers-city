import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ auth: vi.fn(), update: vi.fn(), eq: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: async () => ({ auth: { getUser: fake.auth }, from: fake.from }) }));
import { PATCH } from "./route";
function request(bio?: string) {
  const form = new FormData();
  form.set("fullName", "Ada"); form.set("xHandle", "ada"); form.set("ownerId", "someone-else");
  if (bio !== undefined) form.set("bio", bio);
  return new Request("http://localhost/api/profile", { method: "PATCH", body: form });
}
beforeEach(() => {
  vi.clearAllMocks();
  fake.auth.mockResolvedValue({ data: { user: { id: "owner" } } });
  fake.eq.mockResolvedValue({ error: null });
  fake.update.mockReturnValue({ eq: fake.eq });
  fake.from.mockImplementation((table) => table === "profiles" ? { update: fake.update } : { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { bio: "Building tools", building_level: 1 }, error: null }) }) }) });
});
describe("profile bio", () => {
  it("requires authentication", async () => {
    fake.auth.mockResolvedValue({ data: { user: null } });
    expect((await PATCH(request("Bio"))).status).toBe(401);
    expect(fake.update).not.toHaveBeenCalled();
  });
  it("saves trimmed bio only for the authenticated owner and serializes it", async () => {
    const response = await PATCH(request("  Building tools  "));
    expect(response.status).toBe(200);
    expect(fake.update).toHaveBeenCalledWith({ full_name: "Ada", x_handle: "ada", bio: "Building tools" });
    expect(fake.eq).toHaveBeenCalledWith("id", "owner");
    expect((await response.json()).development.founder.bio).toBe("Building tools");
  });
  it("clears blank bio and preserves it when omitted", async () => {
    await PATCH(request("  "));
    expect(fake.update).toHaveBeenLastCalledWith({ full_name: "Ada", x_handle: "ada", bio: null });
    await PATCH(request());
    expect(fake.update).toHaveBeenLastCalledWith({ full_name: "Ada", x_handle: "ada" });
  });
  it("counts Unicode characters and rejects oversized bio", async () => {
    expect((await PATCH(request("🌱".repeat(160)))).status).toBe(200);
    fake.update.mockClear();
    expect((await PATCH(request("🌱".repeat(161)))).status).toBe(400);
    expect(fake.update).not.toHaveBeenCalled();
  });
});
