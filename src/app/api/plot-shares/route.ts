import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { sharePublicOrigin, shareResult } from "@/lib/sharing/server";
import { renderShareImage, validateScenePng } from "@/lib/sharing/render-image";
import { MAX_SCENE_BYTES, SHARE_BUCKET, UUID_PATTERN } from "@/lib/sharing/shared";

export const runtime = "nodejs";
const fail = (code: string, message: string, status = 400) => NextResponse.json({ error: { code, message } }, { status });

export async function POST(request: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return fail("not_authenticated", "Sign in to share your plot.", 401);
  try { sharePublicOrigin(); }
  catch { return fail("sharing_unavailable", "Sharing is not configured yet. Please try again later.", 503); }
  if (Number(request.headers.get("content-length")) > MAX_SCENE_BYTES + 65536) return fail("invalid_image", "The map image is too large.", 413);
  let form: FormData;
  try { form = await request.formData(); } catch { return fail("invalid_request", "The share image could not be read."); }
  const id = form.get("requestId"), phase = form.get("phase"), revision = form.get("revision"), scene = form.get("scene");
  if (typeof id !== "string" || !UUID_PATTERN.test(id) || !['morning', 'night'].includes(String(phase))
    || typeof revision !== "string" || !Number.isFinite(Date.parse(revision)) || !(scene instanceof Blob) || scene.size > MAX_SCENE_BYTES) {
    return fail("invalid_request", "Prepare a new share image and try again.");
  }
  const png = new Uint8Array(await scene.arrayBuffer());
  if (!validateScenePng(png)) return fail("invalid_image", "The map image must be a 1080 × 400 PNG.");
  const prepared = await supabase.rpc("prepare_plot_share", { request_id: id, requested_phase: String(phase), expected_revision: revision });
  if (prepared.error || !prepared.data?.[0]) {
    const message = prepared.error?.message ?? "";
    if (message.includes("stale_share")) return fail("stale_share", "Your plot changed. Refreshing it will prepare an up-to-date image.", 409);
    if (message.includes("share_conflict")) return fail("share_conflict", "This share request is no longer available. Prepare a new image.", 409);
    if (message.includes("claim_not_found")) return fail("claim_not_found", "Claim a plot before sharing.", 403);
    return fail("share_failed", "Your share could not be prepared. Please retry.", 500);
  }
  const snapshot = prepared.data[0];
  if (snapshot.ready_at) return NextResponse.json(shareResult(snapshot));
  let uploaded = false;
  try {
    // A previous response may have failed after upload. Reuse that exact PNG on retry.
    const existing = await supabase.storage.from(SHARE_BUCKET).download(snapshot.image_path);
    if (!existing.data) {
      const bytes = await renderShareImage(snapshot, png);
      if (bytes.length > 5 * 1024 * 1024) throw new Error("Image too large");
      const result = await supabase.storage.from(SHARE_BUCKET).upload(snapshot.image_path, bytes, { contentType: "image/png", cacheControl: "31536000", upsert: false });
      if (result.error) {
        // Concurrent identical requests may race to upload; an existing immutable object wins.
        const retry = await supabase.storage.from(SHARE_BUCKET).download(snapshot.image_path);
        if (!retry.data) throw result.error;
      } else uploaded = true;
    }
    const published = await supabase.rpc("publish_plot_share", { request_id: id });
    if (published.error || !published.data?.[0]) throw published.error ?? new Error("Publishing failed");
    return NextResponse.json(shareResult(published.data[0]), { status: 201 });
  } catch {
    // RLS prevents this cleanup from deleting an image a concurrent request already published.
    if (uploaded) await supabase.storage.from(SHARE_BUCKET).remove([snapshot.image_path]);
    return fail("share_failed", "Your image could not be saved. Please retry.", 500);
  }
}
