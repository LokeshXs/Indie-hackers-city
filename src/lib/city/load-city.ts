import { starterDistrict } from "@/components/city-map/map-data";
import { cityDevelopmentRecord } from "@/lib/city/developments";
import type { CityDevelopmentRecord } from "@/lib/city/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function loadCity() {
  let initialDevelopments: CityDevelopmentRecord = {};
  let initialDevelopmentLoadError = false;
  let activePlotIds = new Set(starterDistrict.plots.map((plot) => plot.id));

  if (isSupabaseConfigured()) {
    const supabase = await getSupabaseServerClient();
    const [developmentsResult, plotsResult] = await Promise.all([
      supabase.from("city_developments").select("*"),
      supabase.from("plots").select("id").eq("is_active", true),
    ]);
    if (developmentsResult.error || plotsResult.error) {
      initialDevelopmentLoadError = true;
    } else {
      initialDevelopments = cityDevelopmentRecord(developmentsResult.data);
      activePlotIds = new Set(plotsResult.data.map((plot) => plot.id));
    }
  }

  return { initialDevelopments, initialDevelopmentLoadError, activePlotIds };
}
