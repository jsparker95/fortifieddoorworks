"use client";

import { usePathname } from "next/navigation";

export default function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/production" || pathname.startsWith("/production/")) return null;
  return children;
}
