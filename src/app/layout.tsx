import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import { Overpass, Overpass_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
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
  title: "Indie Hackers City",
  description: "A city shaped by the progress of independent builders.",
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
