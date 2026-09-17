/**
 * The status vocabulary, mirroring the Prisma `NoteStatus` enum. Restated here
 * rather than imported because domain code stays free of generated types; the
 * `data/` layer passes these strings straight into Prisma, so a schema change
 * that drops a member fails the type-check there.
 */
export const NOTE_STATUSES = ["DRAFT", "PUBLISHED"] as const;
export type NoteStatus = (typeof NOTE_STATUSES)[number];
