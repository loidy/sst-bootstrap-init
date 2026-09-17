export const NOTE_TITLE_MIN_LENGTH = 3;
export const NOTE_TITLE_MAX_LENGTH = 120;

/**
 * Collapses whitespace so two titles that differ only in spacing cannot both
 * pass the unique constraint. Applied before validation, so the length rules
 * below judge what is actually stored.
 */
export function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export type TitleViolation = "too-short" | "too-long";

/** Why a normalized title cannot be stored, or null when it can. */
export function validateTitle(value: string): TitleViolation | null {
  if (value.length < NOTE_TITLE_MIN_LENGTH) {
    return "too-short";
  }
  if (value.length > NOTE_TITLE_MAX_LENGTH) {
    return "too-long";
  }
  return null;
}
