"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cityDevelopmentRecord } from "@/lib/city/developments";
import type { CityDevelopment, CityDevelopmentRecord } from "@/lib/city/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function useCityDevelopments(
  initialDevelopments: CityDevelopmentRecord,
  initialLoadError = false,
) {
  const [developments, setDevelopments] = useState(initialDevelopments);
  const [hasRefreshError, setHasRefreshError] = useState(initialLoadError);
  const [hasPendingUpdates, setHasPendingUpdates] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const requestSequence = useRef(0);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured()) return null;
    const requestId = ++requestSequence.current;
    setIsRefreshing(true);
    try {
      const { data, error } = await getSupabaseBrowserClient()
        .from("city_developments")
        .select("*");
      if (requestId !== requestSequence.current) return null;
      if (error) {
        setHasRefreshError(true);
        return null;
      }
      const nextDevelopments = cityDevelopmentRecord(data);
      setDevelopments(nextDevelopments);
      setHasRefreshError(false);
      setHasPendingUpdates(false);
      return nextDevelopments;
    } finally {
      if (requestId === requestSequence.current) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = getSupabaseBrowserClient();
    let channel = supabase.channel("city-developments");
    for (const table of ["plot_claims", "projects", "profiles"] as const) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => setHasPendingUpdates(true),
      );
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  const applyDevelopment = useCallback((development: CityDevelopment) => {
    setDevelopments((current) => ({ ...current, [development.plotId]: development }));
    setHasRefreshError(false);
  }, []);

  return {
    developments,
    applyDevelopment,
    refresh,
    hasRefreshError,
    hasPendingUpdates,
    isRefreshing,
  };
}
