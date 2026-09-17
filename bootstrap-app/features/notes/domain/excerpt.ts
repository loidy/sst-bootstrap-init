export const EXCERPT_MAX_LENGTH = 140;

/**
 * A one-line preview of a note body for list responses. Cuts on a word boundary
 * when there is one, so the excerpt does not end mid-word.
 */
export function excerptOf(body: string, maxLength = EXCERPT_MAX_LENGTH): string {
  const flattened = body.trim().replace(/\s+/g, " ");
  if (flattened.length <= maxLength) {
    return flattened;
  }

  const clipped = flattened.slice(0, maxLength);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped}…`;
}
