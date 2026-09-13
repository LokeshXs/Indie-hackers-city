import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CityMap3D } from "@/components/city-map/CityMap3D";
import { starterDistrict } from "@/components/city-map/map-data";
import { loadCity } from "@/lib/city/load-city";
import { getPublicShare, shareResult } from "@/lib/sharing/server";
import { shareImageAlt, SHARE_HEIGHT, SHARE_WIDTH } from "@/lib/sharing/shared";

type Props = { params: Promise<{ shareId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const snapshot = await getPublicShare((await params).shareId);
  if (!snapshot) return { title: "Shared plot not found" };
  const result = shareResult(snapshot);
  const title = `${snapshot.founder_name}’s plot · Indie Hackers City`;
  const description = `${new Intl.NumberFormat("en-US").format(snapshot.xp)} XP and counting. Visit ${snapshot.founder_name}’s corner of the city.`;
  const image = { url: result.imageUrl, width: SHARE_WIDTH, height: SHARE_HEIGHT, alt: shareImageAlt(snapshot.founder_name, snapshot.xp) };
  return {
    title, description, alternates: { canonical: result.shareUrl },
    openGraph: { type: "website", title, description, url: result.shareUrl, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function SharedPlotPage({ params }: Props) {
  const snapshot = await getPublicShare((await params).shareId);
  if (!snapshot) notFound();
  const city = await loadCity();
  const current = city.initialDevelopments[snapshot.plot_id];
  const available = current?.ownerId === snapshot.owner_id && starterDistrict.plots.some((plot) => plot.id === snapshot.plot_id);
  return <CityMap3D key={snapshot.id} district={starterDistrict} {...city}
    initialFocusPlotId={available ? snapshot.plot_id : undefined}
    initialShareUnavailable={!available && !city.initialDevelopmentLoadError} />;
}
