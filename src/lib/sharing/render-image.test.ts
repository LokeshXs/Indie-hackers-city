// @vitest-environment node
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { avatarData, renderShareImage, validateScenePng } from "./render-image";
import { shareCaption, xShareUrl } from "./shared";

afterEach(() => vi.unstubAllGlobals());
describe("share image", () => {
  it("converts a Google WebP avatar to a renderable PNG and includes it in the card", async () => {
    const webp = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#ff0080" } }).webp().toBuffer();
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn((input: Parameters<typeof fetch>[0], init?: RequestInit) => String(input).startsWith("https://lh3.googleusercontent.com/") ? Promise.resolve(new Response(new Uint8Array(webp), { headers: { "content-type": "image/webp" } })) : originalFetch(input, init)));
    const url = "https://lh3.googleusercontent.com/a/avatar";
    expect(await avatarData(url)).toMatch(/^data:image\/png;base64,/);
    const scene = await readFile("src/lib/sharing/fixtures/map.png");
    const image = await renderShareImage({ founder_name: "Ada Lovelace", avatar_url: url, xp: 390 }, scene);
    const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
    let portraitPixels = 0;
    for (let i = 0; i < data.length; i += info.channels) if (data[i] > 240 && data[i + 1] < 20 && data[i + 2] > 110 && data[i + 2] < 150) portraitPixels++;
    expect(portraitPixels).toBeGreaterThan(1500);
  });
  it("renders a real PNG with the requested dimensions and fallback avatar", async () => {
    const scene = await readFile("src/lib/sharing/fixtures/map.png");
    expect(validateScenePng(scene)).toBe(true);
    const image = await renderShareImage({ founder_name: "Ada Lovelace", avatar_url: null, xp: 390 }, scene);
    expect(image.readUInt32BE(16)).toBe(1200);
    expect(image.readUInt32BE(20)).toBe(630);
    expect(image.length).toBeLessThan(5 * 1024 * 1024);
    await writeFile("/tmp/plot-share-layout-preview.png", image);
  });
  it("rejects wrong dimensions, non-PNG files, and oversized input", async () => {
    expect(validateScenePng(Buffer.from("not a png"))).toBe(false);
    const scene = await readFile("src/lib/sharing/fixtures/map.png");
    scene.writeUInt32BE(50000, 16);
    expect(validateScenePng(scene)).toBe(false);
    expect(validateScenePng(new Uint8Array(4 * 1024 * 1024))).toBe(false);
  });
  it("encodes captions and shared URLs without losing punctuation", () => {
    const caption = shareCaption(12345);
    const url = new URL(xShareUrl({ caption, shareUrl: "https://city.example/share/id" }));
    expect(url.searchParams.get("text")).toBe(caption);
    expect(caption).toContain("12,345 XP");
    expect(url.searchParams.get("url")).toBe("https://city.example/share/id");
  });
});
