// @vitest-environment node
import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), download: vi.fn(), upload: vi.fn(), remove: vi.fn(), render: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: async () => ({ auth: { getUser: fake.auth }, rpc: fake.rpc, storage: { from: () => ({ download: fake.download, upload: fake.upload, remove: fake.remove }) } }) }));
vi.mock("@/lib/sharing/render-image", async (original) => ({ ...await original<object>(), renderShareImage: fake.render }));
import { POST } from "./route";
const id = "75000000-0000-4000-8000-000000000001";
const snapshot = { id, owner_id: "owner", plot_id: "plot", founder_name: "Ada", avatar_url: null, xp: 390, phase: "morning", image_path: `owner/${id}.png`, development_revision: "2026-09-13T00:00:00Z", created_at: "2026-09-13T00:00:00Z", ready_at: null };
async function request(overrides: Record<string, string> = {}) {
  const form = new FormData();
  form.set("requestId", id); form.set("phase", "morning"); form.set("revision", snapshot.development_revision);
  form.set("scene", new Blob([await readFile("src/lib/sharing/fixtures/map.png")], { type: "image/png" }), "map.png");
  Object.entries(overrides).forEach(([key, value]) => form.set(key, value));
  return new Request("http://localhost:3000/api/plot-shares", { method: "POST", body: form });
}
beforeEach(() => {
  vi.clearAllMocks();
  fake.auth.mockResolvedValue({ data: { user: { id: "owner" } } });
  fake.rpc.mockImplementation(async (name: string) => ({ data: [{ ...snapshot, ready_at: name === "publish_plot_share" ? "2026-09-13T00:00:01Z" : null }], error: null }));
  fake.download.mockResolvedValue({ data: null, error: { message: "not found" } });
  fake.upload.mockResolvedValue({ error: null });
  fake.remove.mockResolvedValue({ error: null });
  fake.render.mockResolvedValue(Buffer.from("png"));
});
describe("create plot share API", () => {
  it("requires sign-in", async () => {
    fake.auth.mockResolvedValue({ data: { user: null } });
    expect((await POST(await request())).status).toBe(401);
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it.each<Record<string, string>>([{ phase: "sunset" }, { requestId: "bad" }, { revision: "bad" }, { scene: "not an image" }])("rejects malformed request %j", async (overrides) => {
    expect((await POST(await request(overrides))).status).toBe(400);
    expect(fake.rpc).not.toHaveBeenCalled();
  });
  it("renders from the database snapshot, saves once, and returns matching URLs", async () => {
    const response = await POST(await request({ xp: "999999", founderName: "Spoofed" }));
    expect(response.status).toBe(201);
    expect(fake.render).toHaveBeenCalledWith(snapshot, expect.any(Uint8Array));
    expect(fake.upload).toHaveBeenCalledWith(snapshot.image_path, expect.any(Buffer), expect.objectContaining({ upsert: false }));
    expect(fake.rpc).toHaveBeenLastCalledWith("publish_plot_share", { request_id: id });
    expect(await response.json()).toMatchObject({ shareId: id, shareUrl: `http://localhost:3000/share/${id}`, imageUrl: `http://localhost:3000/share/${id}/image` });
  });
  it("returns a completed share on retry without rendering or uploading again", async () => {
    fake.rpc.mockResolvedValue({ data: [{ ...snapshot, ready_at: "2026-09-13T00:00:01Z" }], error: null });
    expect((await POST(await request())).status).toBe(200);
    expect(fake.render).not.toHaveBeenCalled(); expect(fake.upload).not.toHaveBeenCalled();
  });
  it("reuses an upload after a lost response", async () => {
    fake.download.mockResolvedValue({ data: new Blob(["png"]), error: null });
    expect((await POST(await request())).status).toBe(201);
    expect(fake.render).not.toHaveBeenCalled();
  });
  it("rejects stale revisions before image generation", async () => {
    fake.rpc.mockResolvedValue({ data: null, error: { message: "stale_share" } });
    expect((await POST(await request())).status).toBe(409);
    expect(fake.render).not.toHaveBeenCalled();
  });
  it("cleans its upload if publication fails", async () => {
    fake.rpc.mockImplementation(async (name: string) => name === "publish_plot_share" ? { data: null, error: { message: "failed" } } : { data: [snapshot], error: null });
    expect((await POST(await request())).status).toBe(500);
    expect(fake.remove).toHaveBeenCalledWith([snapshot.image_path]);
  });
});
