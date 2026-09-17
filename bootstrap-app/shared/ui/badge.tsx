import type * as React from "react";

import { cx } from "@/shared/lib/utils";

export type BadgeTone = "neutral" | "accent" | "success";

export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
}) {
  return <span className={cx("ui-badge", `ui-badge--${tone}`)}>{children}</span>;
}
