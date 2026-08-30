import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import "./globals.css";

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
    <html lang="en">
      <body><AuthProvider initialUser={user}>{children}</AuthProvider></body>
    </html>
  );
}
