import type { Metadata } from "next";
import "./globals.css";
import Workspace from "@/components/workspace";
import WorkspaceShell from "@/components/workspace-shell";
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
      <body>
        <WorkspaceShell><Workspace /></WorkspaceShell>
        {children}
      </body>
    </html>
  );
}
