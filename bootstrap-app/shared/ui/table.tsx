import type * as React from "react";

import { cx } from "@/shared/lib/utils";

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="ui-table-wrap">
      <table className="ui-table">{children}</table>
    </div>
  );
}

export function TableHead({ children }: { children: React.ReactNode }) {
  return <thead>{children}</thead>;
}

export function TableBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TableRow({ children }: { children: React.ReactNode }) {
  return <tr>{children}</tr>;
}

/** `actions` narrows the column and right-aligns it, for a row's controls. */
export function TableCell({
  as = "td",
  actions = false,
  className,
  ...props
}: React.ComponentPropsWithoutRef<"td"> & { as?: "td" | "th"; actions?: boolean }) {
  const Cell = as;
  return <Cell className={cx(actions && "ui-table__actions", className)} {...props} />;
}
