import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Fortified Doorworks | Production workspace",
  description:
    "Projects, openings, hardware and production for Fortified Doorworks.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
