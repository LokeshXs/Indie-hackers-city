import { loadCity } from "@/lib/city/load-city";
import { CityMap3D } from "@/components/city-map/CityMap3D";
import { starterDistrict } from "@/components/city-map/map-data";

interface HomeProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const requestedPlotId = firstValue(params.claimPlot);
  const { initialDevelopments, initialDevelopmentLoadError, activePlotIds } = await loadCity();

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
      activePlotIds={activePlotIds}
    />
  );
}
