import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export const EVIDENCE_BUCKET = "achievement-evidence";
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type EvidenceUpload =
  | { path: string; error?: undefined }
  | { path?: undefined; error: string };

function extensionFor(type: string): string {
  return type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
}

/** Puts a screenshot in the founder's own folder and hands back the path to record against the
 * claim.
 *
 * The first path segment is the owner's uuid, which is what the storage policy checks and what
 * `apply_project_achievement` re-checks before recording it -- so a claim can never cite a file in
 * somebody else's folder, whichever of the two is bypassed.
 *
 * The name is random rather than the file's own: two screenshots called `Screenshot.png` would
 * otherwise collide, and an original filename is a small privacy leak of its own. */
export async function uploadEvidence(
  supabase: SupabaseClient<Database>,
  ownerId: string,
  file: File,
): Promise<EvidenceUpload> {
  if (!(EVIDENCE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return { error: "Screenshots need to be a PNG, JPG or WebP." };
  }
  if (file.size > MAX_EVIDENCE_BYTES) {
    return { error: "That image is over 5MB. Try a smaller screenshot." };
  }

  const path = `${ownerId}/${crypto.randomUUID()}.${extensionFor(file.type)}`;
  const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) return { error: "The screenshot could not be uploaded. Try again." };
  return { path };
}
