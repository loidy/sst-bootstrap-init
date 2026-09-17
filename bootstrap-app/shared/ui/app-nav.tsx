"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string };

/**
 * The one client component in the shell: marking the current link needs the
 * active path, so this stays a leaf and `AppShell` remains a server component.
 */
export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="ui-shell__nav">
      {items.map((item) => (
        <Link
          key={item.href}
          className="ui-shell__link"
          href={item.href}
          aria-current={pathname === item.href ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
