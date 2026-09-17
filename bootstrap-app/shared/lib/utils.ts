/** Joins class names, dropping falsy ones so callers can inline conditions. */
export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}

/** Date for display in the app's own format, independent of the server locale. */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(iso));
}
