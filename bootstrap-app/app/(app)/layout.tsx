import { AppShell, type NavItem } from "@/shared/ui/app-shell";

const NAV: NavItem[] = [{ href: "/notes", label: "Notes" }];

/**
 * The app-shell route group. It wraps pages in the chrome without adding an
 * `/app` path segment, so `/notes` stays `/notes`. Page-level auth belongs here
 * once there is some (redirecting, unlike the API guards, which throw
 * problem documents).
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell brand="Bootstrap App" nav={NAV}>
      {children}
    </AppShell>
  );
}
