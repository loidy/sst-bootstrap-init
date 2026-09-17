import type * as React from "react";

import { cx } from "@/shared/lib/utils";

export function Input({ className, ...props }: React.ComponentPropsWithoutRef<"input">) {
  return <input className={cx("ui-input", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentPropsWithoutRef<"textarea">) {
  return <textarea className={cx("ui-textarea", className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentPropsWithoutRef<"select">) {
  return <select className={cx("ui-select", className)} {...props} />;
}
