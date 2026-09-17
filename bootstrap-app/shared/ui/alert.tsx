import type * as React from "react";

import { cx } from "@/shared/lib/utils";

export type AlertTone = "danger" | "success";

/**
 * Form-level feedback. Failures render a problem document's `title` and
 * `detail`; per-field messages belong on the `Field` instead.
 */
export function Alert({
  tone,
  title,
  children,
}: {
  tone: AlertTone;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cx("ui-alert", `ui-alert--${tone}`)} role="alert">
      <p className="ui-alert__title">{title}</p>
      {children ? <p>{children}</p> : null}
    </div>
  );
}
