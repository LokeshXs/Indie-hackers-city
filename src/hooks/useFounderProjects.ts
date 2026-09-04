"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadFounderProjects } from "@/lib/city/achievements";
import type { FounderProject } from "@/lib/city/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** The founder's portfolio. Read straight from `projects` and `project_achievements`, which are both
 * publicly readable — writes still go through the API routes, and those hand back a refreshed list
 * so the common path needs no second round trip. */
export function useFounderProjects(ownerId: string | undefined, showcasedProjectId: string) {
  const [projects, setProjects] = useState<FounderProject[]>([]);
  const [isLoading, setIsLoading] = useState(() => Boolean(ownerId));
  const [hasError, setHasError] = useState(false);
  // Guards against a slow load overwriting a newer list handed back by a mutation.
  const requestSequence = useRef(0);

  useEffect(() => {
    if (!ownerId || !isSupabaseConfigured()) return;
    const requestId = ++requestSequence.current;
    let cancelled = false;

    // Every state update below sits after an await, so the effect body itself sets no state.
    void (async () => {
      try {
        const loaded = await loadFounderProjects(getSupabaseBrowserClient(), ownerId, showcasedProjectId);
        if (cancelled || requestId !== requestSequence.current) return;
        setProjects(loaded);
        setHasError(false);
      } catch {
        if (!cancelled && requestId === requestSequence.current) setHasError(true);
      } finally {
        if (!cancelled && requestId === requestSequence.current) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ownerId, showcasedProjectId]);

  /** Accepts the list a mutation route returned. Bumping the sequence makes it win over any load
   * still in flight. */
  const applyProjects = useCallback((next: FounderProject[]) => {
    requestSequence.current += 1;
    setProjects(next);
    setHasError(false);
    setIsLoading(false);
  }, []);

  return { projects, isLoading, hasError, applyProjects };
}
