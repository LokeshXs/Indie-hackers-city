import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, rpc } = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  getSupabaseServerClient: async () => ({ auth: { getUser: auth }, rpc }),
}));
import { PATCH } from "./route";

function request(payload: unknown) {
  return new Request("http://localhost/api/plot-claim/status", { method: "PATCH", body: JSON.stringify(payload) });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ data: { user: { id: "owner" } } });
  rpc.mockResolvedValue({ data: [{ owner_id: "owner", status_text: "Shipping", building_level: 1 }], error: null });
});

describe("PATCH plot status", () => {
  it("requires authentication before saving", async () => {
    auth.mockResolvedValue({ data: { user: null } });
    expect((await PATCH(request({ statusText: "Hi" }))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([null, {}, [], { statusText: 4 }, { statusText: "x".repeat(41) }, { statusText: "two\nlines" }])("rejects malformed payload %j", async (payload) => {
    expect((await PATCH(request(payload))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("handles malformed JSON", async () => {
    expect((await PATCH(new Request("http://localhost", { method: "PATCH", body: "{" }))).status).toBe(400);
  });

  it("returns the persisted development and cannot accept another owner's identifier", async () => {
    const response = await PATCH(request({ statusText: "  Shipping  ", ownerId: "someone-else" }));
    expect(rpc).toHaveBeenCalledWith("update_plot_status", { requested_status_text: "Shipping" });
    expect(response.status).toBe(200);
    expect((await response.json()).development).toMatchObject({ ownerId: "owner", statusText: "Shipping" });
  });

  it.each([null, "", "   "])("resets %j using the empty RPC value", async (statusText) => {
    await PATCH(request({ statusText }));
    expect(rpc).toHaveBeenCalledWith("update_plot_status", { requested_status_text: "" });
  });

  it.each([
    ["reward_locked", 403], ["claim_not_found", 400], ["invalid_status", 400], ["database_unavailable", 500],
  ])("maps %s to HTTP %s", async (message, status) => {
    rpc.mockResolvedValue({ data: null, error: { message } });
    expect((await PATCH(request({ statusText: "Shipping" }))).status).toBe(status);
  });
});
