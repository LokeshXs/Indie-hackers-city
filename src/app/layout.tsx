import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Indie Hackers City",
  description: "A city shaped by the progress of independent builders.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
