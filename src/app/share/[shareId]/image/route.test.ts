// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/sharing/server", () => ({ getPublicShare: async () => ({ id: "id", image_path: "owner/id.png" }) }));
vi.mock("@/lib/supabase/server", () => ({ getSupabaseServerClient: async () => ({ storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "https://storage.example/image.png" } }) }) } }) }));
import { GET } from "./route";
afterEach(() => vi.unstubAllGlobals());
describe("shared image delivery", () => {
  it("serves identical bytes to crawlers and downloads", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1, 2, 3, 4]))));
    const context = { params: Promise.resolve({ shareId: "id" }) };
    const preview = await GET(new Request("https://city.example/share/id/image"), context);
    const download = await GET(new Request("https://city.example/share/id/image?download=1"), context);
    expect(await preview.arrayBuffer()).toEqual(await download.arrayBuffer());
    expect(preview.headers.get("content-type")).toBe("image/png");
    expect(preview.headers.get("cache-control")).toContain("immutable");
    expect(download.headers.get("content-disposition")).toBe('attachment; filename="indie-hackers-city-id.png"');
  });
  it("does not cache an unavailable image as a successful response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 500 })));
    const response = await GET(new Request("https://city.example/share/id/image"), { params: Promise.resolve({ shareId: "id" }) });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBeNull();
  });
});
