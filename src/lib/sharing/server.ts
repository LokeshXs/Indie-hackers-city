import { cache } from "react";
import type { Database } from "@/lib/supabase/database.types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { shareCaption, UUID_PATTERN, type PlotShareResult } from "./shared";

export type PlotShare = Database["public"]["Tables"]["plot_shares"]["Row"];

export function sharePublicOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured && process.env.NODE_ENV === "production") throw new Error("Set NEXT_PUBLIC_SITE_URL before enabling plot sharing.");
  const url = new URL(configured || "http://localhost:3000");
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
    || (process.env.NODE_ENV === "production" && url.protocol !== "https:")) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be a public HTTPS origin.");
  }
  return url.origin;
}

export function shareResult(snapshot: PlotShare): PlotShareResult {
  const shareUrl = `${sharePublicOrigin()}/share/${snapshot.id}`;
  return { shareId: snapshot.id, shareUrl, imageUrl: `${shareUrl}/image`, caption: shareCaption(snapshot.xp) };
}

export const getPublicShare = cache(async (id: string): Promise<PlotShare | null> => {
  if (!UUID_PATTERN.test(id)) return null;
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.from("plot_shares").select("*").eq("id", id).not("ready_at", "is", null).maybeSingle();
  if (error) throw new Error("The shared plot could not be loaded.");
  return data;
});
