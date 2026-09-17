import type * as React from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="ui-page-header">
      <div>
        {eyebrow ? <p className="ui-page-header__eyebrow">{eyebrow}</p> : null}
        <h1 className="ui-page-header__title">{title}</h1>
        {description ? <p className="ui-page-header__description">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}
