import type { Metadata } from "next";
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
      <body><AuthProvider initialUser={user}>{children}</AuthProvider></body>
    </html>
  );
}
