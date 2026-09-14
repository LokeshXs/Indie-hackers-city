import { loadCity } from "@/lib/city/load-city";
import { CityMap3D } from "@/components/city-map/CityMap3D";
import { starterDistrict } from "@/components/city-map/map-data";
import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = { alternates: { canonical: "/" } };

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
    <>
    <CityMap3D
      district={starterDistrict}
      initialDevelopments={initialDevelopments}
      initialDevelopmentLoadError={initialDevelopmentLoadError}
      initialClaimPlotId={requestedPlot?.id}
      initialAuthError={initialAuthError}
      activePlotIds={activePlotIds}
    />
    <section className={styles.introduction} aria-labelledby="about-city">
      <div className={styles.content}>
        <p className={styles.eyebrow}>Build in public</p>
        <h1 id="about-city">Indie Hackers City: a home for what you’re building</h1>
        <p className={styles.lead}>Explore a city of independent builders, discover their projects, and follow the milestones behind their progress. Claim your own plot and watch it grow as you build.</p>
        <div className={styles.steps}>
          <section>
            <h2>Claim your place in the city</h2>
            <p>Sign in with Google and choose an available plot on the map. Add your bio and X handle so visitors can learn who you are and follow your work.</p>
          </section>
          <section>
            <h2>Showcase your projects</h2>
            <p>Add the products you’re building and choose a project for your billboard. Visitors can open your plot to see your founder timeline and visit your project.</p>
          </section>
          <section>
            <h2>Turn milestones into growth</h2>
            <p>Submit evidence of product launches, user growth, and revenue milestones. Approved achievements earn XP and unlock rewards for your plot, from a status bubble to decorations and building upgrades.</p>
          </section>
        </div>
        <h2>A city you can explore before you join</h2>
        <p>You don’t need an account to explore the map or view public founder profiles. Open a claimed plot to discover a builder’s projects and achievements, or sign in when you’re ready to claim an available spot.</p>
        <a className={styles.backLink} href="#city-map">Explore the city map ↑</a>
      </div>
    </section>
    </>
  );
}
