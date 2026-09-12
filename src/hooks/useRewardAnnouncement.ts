"use client";

import { useCallback, useEffect, useState } from "react";
import { acknowledgeRewards, loadRewardAnnouncement } from "@/lib/city/rewards";
import type { RewardAnnouncement } from "@/lib/city/rewards";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

type AnnouncementState = {
  /** Who the announcement belongs to, so a sign-out cannot leave the previous founder's news up. */
  userId: string | undefined;
  announcement: RewardAnnouncement | null;
};

/** Asks the database, once per sign-in, whether anything landed while the founder was away.
 *
 * Keyed on the user rather than run on every render: the answer changes only when an admin decides
 * something, which cannot happen between two renders of this page. */
export function useRewardAnnouncement(userId: string | undefined) {
  const [state, setState] = useState<AnnouncementState>({ userId, announcement: null });

  // Clearing on a user change happens during render, not in an effect, so there is no frame where
  // one account's rewards are on screen under another account's session.
  if (state.userId !== userId) setState({ userId, announcement: null });

  useEffect(() => {
    if (!userId || !isSupabaseConfigured()) return;
    let cancelled = false;

    // Every state update sits after an await, so the effect body itself sets none.
    void (async () => {
      const next = await loadRewardAnnouncement(getSupabaseBrowserClient());
      if (!cancelled) setState({ userId, announcement: next });
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  /** Clears the overlay immediately and tells the server afterwards. If the write fails the
   * founder simply sees the same good news once more, which is the harmless direction to fail. */
  const dismiss = useCallback(() => {
    setState((current) => ({ ...current, announcement: null }));
    if (isSupabaseConfigured()) void acknowledgeRewards(getSupabaseBrowserClient());
  }, []);

  return { announcement: state.announcement, dismiss };
}
