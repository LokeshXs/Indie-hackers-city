"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadAchievementCatalog, loadFounderPortfolio } from "@/lib/city/achievements";
import type { AchievementDefinition, AchievementType, FounderProject } from "@/lib/city/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** The founder's portfolio. Read straight from `projects` and `project_achievements`, which are both
 * publicly readable — writes still go through the API routes, and those hand back a refreshed list
 * so the common path needs no second round trip. */
export function useFounderProjects(ownerId: string | undefined, showcasedProjectId: string) {
  const [projects, setProjects] = useState<FounderProject[]>([]);
  const [catalog, setCatalog] = useState<AchievementDefinition[]>([]);
  const [founderAchievements, setFounderAchievements] = useState<AchievementType[]>([]);
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
        const supabase = getSupabaseBrowserClient();
        // The catalog is tiny, publicly readable and changes only by migration, so it rides along
        // with the portfolio rather than needing its own load.
        const [portfolio, definitions] = await Promise.all([
          loadFounderPortfolio(supabase, ownerId, showcasedProjectId),
          loadAchievementCatalog(supabase),
        ]);
        if (cancelled || requestId !== requestSequence.current) return;
        setProjects(portfolio.projects);
        setFounderAchievements(portfolio.founderAchievements);
        setCatalog(definitions);
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
  const applyProjects = useCallback((next: FounderProject[], nextFounderAchievements?: AchievementType[]) => {
    requestSequence.current += 1;
    setProjects(next);
    if (nextFounderAchievements) setFounderAchievements(nextFounderAchievements);
    setHasError(false);
    setIsLoading(false);
  }, []);

  return { projects, catalog, founderAchievements, isLoading, hasError, applyProjects };
}
