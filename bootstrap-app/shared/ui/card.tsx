import type * as React from "react";

import { cx } from "@/shared/lib/utils";

export function Card({ className, ...props }: React.ComponentPropsWithoutRef<"section">) {
  return <section className={cx("ui-card", className)} {...props} />;
}

export function CardHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="ui-card__header">
      <h2 className="ui-card__title">{title}</h2>
      {description ? <p className="ui-card__description">{description}</p> : null}
    </header>
  );
}

export function CardBody({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return <div className={cx("ui-card__body", className)} {...props} />;
}
