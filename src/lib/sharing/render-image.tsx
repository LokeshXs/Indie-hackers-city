import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";
import type { PlotShare } from "./server";
import { SCENE_HEIGHT, SCENE_WIDTH, SHARE_HEIGHT, SHARE_WIDTH, MAX_SCENE_BYTES } from "./shared";

let font: Promise<Buffer> | undefined;
function shareFont() {
  return font ??= readFile(join(process.cwd(), "src/lib/sharing/fonts/Overpass.ttf"));
}

export function validateScenePng(bytes: Uint8Array): boolean {
  if (bytes.length < 33 || bytes.length > MAX_SCENE_BYTES) return false;
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && buffer.toString("ascii", 12, 16) === "IHDR"
    && buffer.readUInt32BE(16) === SCENE_WIDTH && buffer.readUInt32BE(20) === SCENE_HEIGHT;
}

export async function avatarData(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "lh3.googleusercontent.com") return null;
    const response = await fetch(parsed, { redirect: "error", signal: AbortSignal.timeout(5000) });
    const type = response.headers.get("content-type")?.split(";")[0];
    if (!response.ok || !type || !["image/png", "image/jpeg", "image/webp", "image/avif"].includes(type)) return null;
    const blob = await response.arrayBuffer();
    if (blob.byteLength > 1024 * 1024) return null;
    const portrait = await sharp(Buffer.from(blob), { limitInputPixels: 16777216 }).rotate().resize(144, 144, { fit: "cover" }).png().toBuffer();
    return `data:image/png;base64,${portrait.toString("base64")}`;
  } catch { return null; }
}

export async function renderShareImage(snapshot: Pick<PlotShare, "founder_name" | "avatar_url" | "xp">, scene: Uint8Array): Promise<Buffer> {
  const [fontData, avatar] = await Promise.all([shareFont(), avatarData(snapshot.avatar_url)]);
  const name = snapshot.founder_name.trim() || "Founder";
  const displayName = Array.from(name).length > 28 ? `${Array.from(name).slice(0, 27).join("")}…` : name;
  const initials = name.split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join("").toUpperCase();
  const image = `data:image/png;base64,${Buffer.from(scene).toString("base64")}`;
  const cream = "#fffdf6", ink = "#163b3c", teal = "#176d6c", gold = "#e8bc70";
  const render = (portrait: string | null) => new ImageResponse(
    <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", background: ink, color: cream, fontFamily: "Overpass", fontWeight: 700, overflow: "hidden" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} width={SHARE_WIDTH} height={SHARE_HEIGHT} alt="" style={{ position: "absolute", inset: 0, width: SHARE_WIDTH, height: SHARE_HEIGHT, objectFit: "cover" }} />
      <div style={{ display: "flex", position: "absolute", top: 28, right: 28, alignItems: "center", gap: 16, padding: "16px 22px", borderRadius: 20, background: "rgba(22,59,60,0.92)", boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", width: 64, height: 64, borderRadius: 32, overflow: "hidden", background: teal, alignItems: "center", justifyContent: "center", fontSize: 23, flexShrink: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {portrait ? <img src={portrait} width={64} height={64} alt="" /> : initials}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontSize: name.length > 20 ? 24 : 28, whiteSpace: "nowrap" }}>{displayName}</span>
          <span style={{ fontSize: 28, color: gold }}>{new Intl.NumberFormat("en-US").format(snapshot.xp)} XP</span>
        </div>
      </div>
      <div style={{ display: "flex", position: "absolute", bottom: 0, left: 0, width: "100%", height: 190, alignItems: "flex-end", justifyContent: "center", paddingBottom: 30, background: "linear-gradient(180deg, rgba(22,59,60,0) 0%, rgba(22,59,60,0.88) 65%, #163b3c 100%)" }}>
        <span style={{ fontSize: 56, letterSpacing: -1.5, textShadow: "0 2px 8px rgba(0,0,0,0.35)" }}>Indie Hackers City</span>
      </div>
    </div>,
    { width: SHARE_WIDTH, height: SHARE_HEIGHT, fonts: [{ name: "Overpass", data: fontData, weight: 700, style: "normal" }] },
  );
  try { return Buffer.from(await render(avatar).arrayBuffer()); }
  catch (error) {
    if (!avatar) throw error;
    return Buffer.from(await render(null).arrayBuffer());
  }
}
