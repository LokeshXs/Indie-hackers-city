import type { CityPhase } from "@/lib/city/time-of-day";

export const SHARE_WIDTH = 1200;
export const SHARE_HEIGHT = 630;
export const SCENE_WIDTH = SHARE_WIDTH;
export const SCENE_HEIGHT = SHARE_HEIGHT;
export const MAX_SCENE_BYTES = 3 * 1024 * 1024;
export const SHARE_BUCKET = "plot-shares";
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PlotShareResult {
  shareId: string;
  shareUrl: string;
  imageUrl: string;
  caption: string;
}
export interface PlotShareInput {
  requestId: string;
  phase: CityPhase;
  revision: string;
}
export function shareCaption(xp: number): string {
  return `I’m building my corner of Indie Hackers City — ${new Intl.NumberFormat("en-US").format(xp)} XP and counting. Come visit my plot!`;
}
export function xShareUrl(share: Pick<PlotShareResult, "shareUrl" | "caption">): string {
  return `https://x.com/intent/tweet?${new URLSearchParams({ text: share.caption, url: share.shareUrl })}`;
}
export function shareImageAlt(name: string, xp: number): string {
  return `${name}’s plot in Indie Hackers City, ${new Intl.NumberFormat("en-US").format(xp)} XP`;
}
