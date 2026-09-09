"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getUserAvatarUrl, getUserDisplayName } from "@/lib/auth/user-metadata";
import { cafeMembers, readMember, type CafeMember } from "@/lib/cafes/presence";

const NOTICE_SETTING = "city:cafe-notifications:v1";

async function publishSeat(channel: RealtimeChannel, seat: CafeMember | null) {
  try { return seat ? await channel.track(seat) : await channel.untrack(); }
  catch { return "error"; }
}

export function useCafePresence(cafeId: string, user: User | null) {
  const [members, setMembers] = useState<CafeMember[]>([]);
  const [connection, setConnection] = useState<"connecting" | "connected" | "offline">("connecting");
  const [seat, setSeat] = useState<CafeMember | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<CafeMember[]>([]);
  const [notifications, setNotifications] = useState(true);
  const runtime = useRef<{ channel: RealtimeChannel; ready: boolean; active: boolean; pending: boolean; seat: CafeMember | null; key: string } | null>(null);
  const notificationsRef = useRef(true);
  const userId = user?.id;

  useEffect(() => {
    const key = `city:cafe-seat:v1:${cafeId}:${userId ?? "guest"}`;
    const readSeat = () => {
      try {
        const value = readMember(JSON.parse(localStorage.getItem(key) || "null"));
        // A saved choice resumes refreshes; it never contributes to the count without a socket.
        return value && value.userId === userId && Date.now() - value.updatedAt < 12 * 60 * 60 * 1000 ? value : null;
      } catch { return null; }
    };
    try { notificationsRef.current = localStorage.getItem(NOTICE_SETTING) !== "off"; } catch { /* Defaults on. */ }
    setNotifications(notificationsRef.current);
    setSeat(null);
    setMembers([]);
    setNotice([]);
    setBusy(false);
    setError(null);
    if (!isSupabaseConfigured()) { setConnection("offline"); return; }
    setConnection("connecting");
    const supabase = getSupabaseBrowserClient();
    const channel = supabase.channel(`cafe:${cafeId}`, { config: { presence: { key: crypto.randomUUID() } } });
    const state = { channel, ready: false, active: true, pending: false, seat: userId ? readSeat() : null, key };
    runtime.current = state;
    const seen = new Set<string>();
    let previousUsers = new Set<string>();
    let baseline = false;
    let queued = new Map<string, CafeMember>();
    let groupTimer: ReturnType<typeof setTimeout> | undefined;
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      if (!state.active) return;
      const next = cafeMembers(channel.presenceState());
      setMembers(next);
      for (const member of next) {
        if (baseline && !seen.has(member.seatId) && !previousUsers.has(member.userId) && member.userId !== userId
          && Date.now() - member.joinedAt >= 0 && Date.now() - member.joinedAt < 15_000
          && notificationsRef.current) queued.set(member.userId, member);
        seen.add(member.seatId);
      }
      previousUsers = new Set(next.map((member) => member.userId));
      baseline = true;
      if (queued.size && !groupTimer) groupTimer = setTimeout(() => {
        groupTimer = undefined;
        if (notificationsRef.current) setNotice([...queued.values()]);
        queued = new Map();
        clearTimeout(dismissTimer);
        dismissTimer = setTimeout(() => setNotice([]), 8000);
      }, 1500);
    };
    channel.on("presence", { event: "sync" }, sync).subscribe(async (status) => {
      if (!state.active) return;
      state.ready = status === "SUBSCRIBED";
      setConnection(state.ready ? "connected" : "offline");
      if (!state.ready) { baseline = false; setMembers([]); return; }
      if (state.seat) {
        const result = await publishSeat(channel, state.seat);
        if (!state.active) return;
        if (result === "ok") setSeat(state.seat);
        else setError("Your seat couldn’t reconnect. Please try again.");
      }
    });
    const storageChanged = async (event: StorageEvent) => {
      if (event.key === NOTICE_SETTING) {
        notificationsRef.current = event.newValue !== "off";
        setNotifications(notificationsRef.current);
        if (!notificationsRef.current) setNotice([]);
      }
      if (event.key !== key && event.key !== null) return;
      state.seat = readSeat();
      setSeat(state.seat);
      if (state.ready) {
        const result = await publishSeat(channel, state.seat);
        if (state.active && result !== "ok") setError("Couldn’t sync your seat across tabs. Please try again.");
      }
    };
    window.addEventListener("storage", storageChanged);
    return () => {
      state.active = false;
      runtime.current = null;
      clearTimeout(groupTimer);
      clearTimeout(dismissTimer);
      window.removeEventListener("storage", storageChanged);
      void supabase.removeChannel(channel);
    };
  }, [cafeId, userId]);

  const changeSeat = useCallback(async (intention: string | null) => {
    const state = runtime.current;
    if (!user || !state?.ready || state.pending) return;
    state.pending = true;
    setBusy(true);
    setError(null);
    const previous = state.seat;
    let saved: CafeMember | null = null;
    try { saved = readMember(JSON.parse(localStorage.getItem(state.key) || "null")); } catch { /* Memory fallback. */ }
    const existing = previous ?? (saved && saved.userId === user.id && Date.now() - saved.updatedAt < 12 * 60 * 60 * 1000 ? saved : null);
    const next: CafeMember | null = intention === null ? null : {
      userId: user.id, name: getUserDisplayName(user) || "Founder", avatarUrl: getUserAvatarUrl(user),
      intention: intention.trim().slice(0, 100), seatId: existing?.seatId ?? crypto.randomUUID(),
      joinedAt: existing?.joinedAt ?? Date.now(), updatedAt: Date.now(),
    };
    try {
      const result = await publishSeat(state.channel, next);
      if (!state.active) return;
      if (result !== "ok") throw new Error("Your seat couldn’t be updated. Please try again.");
      state.seat = next;
      setSeat(next);
      try {
        if (next) localStorage.setItem(state.key, JSON.stringify(next));
        else localStorage.removeItem(state.key);
      } catch { setError("Your seat is live, but this browser couldn’t save it across tabs or refreshes."); }
    } catch {
      if (state.active) setError("Your seat couldn’t be updated. Please try again.");
    } finally {
      state.pending = false;
      if (state.active) setBusy(false);
    }
  }, [user]);

  function toggleNotifications() {
    const next = !notificationsRef.current;
    notificationsRef.current = next;
    setNotifications(next);
    if (!next) setNotice([]);
    try { localStorage.setItem(NOTICE_SETTING, next ? "on" : "off"); } catch { /* Applies this visit. */ }
  }

  return { members, connection, seat: seat?.userId === userId ? seat : null, busy, error,
    changeSeat, notice, dismissNotice: () => setNotice([]), notifications, toggleNotifications };
}
