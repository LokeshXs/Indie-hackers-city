export const SITE_TITLE = "Indie Hackers City | Build in Public, Grow Your Plot";
export const SITE_DESCRIPTION = "Join a city of indie hackers building in public. Claim a plot, showcase your projects, and turn approved product, user, and revenue milestones into a growing home.";

export function siteOrigin(): string {
  return new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://indiehackers.city").origin;
}

export const isPreviewDeployment = process.env.VERCEL_ENV === "preview";
