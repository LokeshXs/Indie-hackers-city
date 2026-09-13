import { getPublicShare } from "@/lib/sharing/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { SHARE_BUCKET } from "@/lib/sharing/shared";

export async function GET(request: Request, { params }: { params: Promise<{ shareId: string }> }) {
  try {
    const snapshot = await getPublicShare((await params).shareId);
    if (!snapshot) return new Response("Share not found", { status: 404 });
    const supabase = await getSupabaseServerClient();
    const { data } = supabase.storage.from(SHARE_BUCKET).getPublicUrl(snapshot.image_path);
    const image = await fetch(data.publicUrl, { signal: AbortSignal.timeout(10000) });
    if (!image.ok) return new Response("Image temporarily unavailable", { status: 503 });
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new Response(image.body, { headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="indie-hackers-city-${snapshot.id}.png"`,
      "X-Content-Type-Options": "nosniff",
    } });
  } catch { return new Response("Image temporarily unavailable", { status: 503 }); }
}
