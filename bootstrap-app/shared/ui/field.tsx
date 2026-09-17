import type * as React from "react";

/**
 * Label + control + message for one form input. `error` is the message from a
 * problem document's `errors` array, so a server-side validation failure lands
 * in the same place as a client-side one.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="ui-field__error">{error}</p>
      ) : hint ? (
        <p className="ui-field__hint">{hint}</p>
      ) : null}
    </div>
  );
}
