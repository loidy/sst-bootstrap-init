import type * as React from "react";
import Link from "next/link";

import { AppNav, type NavItem } from "./app-nav";

export type { NavItem };

/**
 * Top bar plus a centred main column. The shell knows the navigation but not the
 * caller: `app/(app)/layout.tsx` decides which items to pass.
 */
export function AppShell({
  brand,
  nav,
  children,
}: {
  brand: string;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="ui-shell">
      <header className="ui-shell__bar">
        <Link className="ui-shell__brand" href="/">
          {brand}
        </Link>
        <AppNav items={nav} />
      </header>
      <main className="ui-page">{children}</main>
    </div>
  );
}
