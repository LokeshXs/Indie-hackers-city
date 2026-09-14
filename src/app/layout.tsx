import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import { Overpass, Overpass_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SITE_TITLE, SITE_DESCRIPTION, siteOrigin, isPreviewDeployment } from "@/lib/seo";
import "./globals.css";

// Overpass descends from Highway Gothic, the US road-sign face — the city's
// signage voice. Overpass Mono carries its records: XP, levels, plot addresses.
const overpass = Overpass({
  subsets: ["latin"],
  variable: "--font-overpass",
  display: "swap",
});

const overpassMono = Overpass_Mono({
  subsets: ["latin"],
  variable: "--font-overpass-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  robots: isPreviewDeployment ? { index: false, follow: false } : { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "Indie Hackers City",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{
      url: "/generated/indie-hackers-city-og-boardwalk.png",
      width: 1734,
      height: 907,
      alt: "Indie Hackers City — independent builders in a sunny coastal town",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [{
      url: "/generated/indie-hackers-city-og-boardwalk.png",
      alt: "Indie Hackers City — independent builders in a sunny coastal town",
    }],
  },
  icons: {
    icon: "/assets/logo/favicon.png",
    apple: "/assets/logo/favicon.png",
  },
};

async function getInitialUser() {
  if (!isSupabaseConfigured()) return null;
  const supabase = await getSupabaseServerClient();
  return (await supabase.auth.getUser()).data.user;
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getInitialUser();

  return (
    <html lang="en" className={`${overpass.variable} ${overpassMono.variable}`}>
      <head>
        <script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="5f82c276-e637-4262-b876-c4c132e1e3b2"
        />
      </head>
      <body>
        <AuthProvider initialUser={user}>{children}</AuthProvider>
        <Analytics />
      </body>
      <GoogleAnalytics gaId="G-75Y9YKFL5Z" />
    </html>
  );
}
