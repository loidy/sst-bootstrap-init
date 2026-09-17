import type * as React from "react";

import { cx } from "@/shared/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md"): string {
  return cx("ui-button", `ui-button--${variant}`, `ui-button--${size}`);
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: React.ComponentPropsWithoutRef<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  return <button type={type} className={cx(buttonClass(variant, size), className)} {...props} />;
}
