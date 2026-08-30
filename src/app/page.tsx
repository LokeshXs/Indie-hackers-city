import { CityMap3D } from "@/components/city-map/CityMap3D";
import { starterDistrict } from "@/components/city-map/map-data";
import { cityDevelopmentRecord } from "@/lib/city/developments";
import type { CityDevelopmentRecord } from "@/lib/city/types";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSupabaseServerClient } from "@/lib/supabase/server";

interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const requestedPlotId = firstValue(params.claimPlot);
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

  const requestedPlot = starterDistrict.plots.find(
    (plot) => plot.id === requestedPlotId && activePlotIds.has(plot.id),
  );
  const initialAuthError = requestedPlot && firstValue(params.authError) === "oauth" ? "oauth" as const : undefined;

  return (
    <CityMap3D
      district={starterDistrict}
      initialDevelopments={initialDevelopments}
      initialDevelopmentLoadError={initialDevelopmentLoadError}
      initialClaimPlotId={requestedPlot?.id}
      initialAuthError={initialAuthError}
    />
  );
}
