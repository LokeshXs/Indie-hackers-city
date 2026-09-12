"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getUserDisplayName } from "@/lib/auth/user-metadata";

type Member = { userId: string; name: string };

export function useCityPresence(user: User | null) {
  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<Member[]>([]);
  const userId = user?.id;
  const name = user ? getUserDisplayName(user) || "A founder" : "";

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseBrowserClient();
    const channel = supabase.channel("city:online", { config: { presence: { key: crypto.randomUUID() } } });
    let active = true;
    let baseline = false;
    let previous = new Set<string>();
    const lastSeen = new Map<string, number>();
    const queued = new Map<string, Member>();
    let batch: ReturnType<typeof setTimeout> | undefined;
    let dismiss: ReturnType<typeof setTimeout> | undefined;
    const resetNotices = () => {
      clearTimeout(batch); clearTimeout(dismiss); batch = undefined;
      queued.clear(); setNotice([]);
    };
    channel.on("presence", { event: "sync" }, () => {
      if (!active) return;
      const members = new Map<string, Member>();
      for (const entries of Object.values(channel.presenceState())) {
        for (const entry of entries) {
          const value = entry as unknown as Record<string, unknown>;
          if (typeof value.userId === "string" && value.userId && typeof value.name === "string") {
            members.set(value.userId, { userId: value.userId, name: value.name.slice(0, 100) || "A founder" });
          }
        }
      }
      const now = Date.now();
      for (const member of members.values()) {
        if (baseline && member.userId !== userId && !previous.has(member.userId)
          && now - (lastSeen.get(member.userId) ?? -Infinity) > 30_000) queued.set(member.userId, member);
        lastSeen.set(member.userId, now);
      }
      for (const id of previous) if (!members.has(id)) lastSeen.set(id, now);
      for (const id of queued.keys()) if (!members.has(id)) queued.delete(id);
      previous = new Set(members.keys());
      setOnlineIds(previous);
      baseline = true;
      if (queued.size && !batch) batch = setTimeout(() => {
        batch = undefined;
        setNotice([...queued.values()]); queued.clear();
        clearTimeout(dismiss);
        dismiss = setTimeout(() => setNotice([]), 6000);
      }, 700);
    }).subscribe(async (status) => {
      if (!active) return;
      if (status !== "SUBSCRIBED") {
        baseline = false; setOnlineIds(new Set()); resetNotices(); return;
      }
      if (!baseline) { setOnlineIds(new Set()); resetNotices(); }
      if (userId) {
        try { await channel.track({ userId, name }); }
        catch { /* The channel retries subscription when connectivity returns. */ }
      }
    });
    return () => {
      active = false;
      clearTimeout(batch); clearTimeout(dismiss);
      void supabase.removeChannel(channel);
    };
  }, [userId, name]);

  return { onlineIds, notice, dismissNotice: () => setNotice([]) };
}
