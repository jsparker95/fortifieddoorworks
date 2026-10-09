import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Production | Fortified Doorworks",
  manifest: "/production-manifest.webmanifest",
  appleWebApp: { capable: true, title: "Production", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f3f5f8" };

export default function ProductionLayout({ children }: { children: React.ReactNode }) {
  return children;
}
