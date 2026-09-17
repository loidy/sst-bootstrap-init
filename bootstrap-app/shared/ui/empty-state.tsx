import type * as React from "react";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="ui-empty">
      <p className="ui-empty__title">{title}</p>
      {description ? <p className="ui-empty__description">{description}</p> : null}
      {action ? <div style={{ marginTop: "var(--space-4)" }}>{action}</div> : null}
    </div>
  );
}
