// Isomorphic contract module — may import zod and pure domain code only.
// These schemas are the single source of truth three times over: the form
// validates with them, the route handler validates with them, and the OpenAPI
// document is generated from them.
import { z } from "zod";

import { pageQuery, pagedResponse } from "@/shared/pagination";

import { NOTE_STATUSES } from "./domain/note-status";
import {
  NOTE_TITLE_MAX_LENGTH,
  NOTE_TITLE_MIN_LENGTH,
  normalizeTitle,
  validateTitle,
  type TitleViolation,
} from "./domain/note-title";

export const titleViolationMessages: Record<TitleViolation, string> = {
  "too-short": `Enter a title of at least ${NOTE_TITLE_MIN_LENGTH} characters.`,
  "too-long": `The title may be at most ${NOTE_TITLE_MAX_LENGTH} characters.`,
};

export const NOTE_BODY_MAX_LENGTH = 10_000;

const noteTitle = z
  .string()
  .transform(normalizeTitle)
  .superRefine((value, ctx) => {
    const violation = validateTitle(value);
    if (violation) {
      ctx.addIssue({ code: "custom", message: titleViolationMessages[violation] });
    }
  })
  .meta({
    description: "Title of the note. Whitespace is collapsed before it is stored.",
    examples: ["Release checklist"],
    // superRefine cannot be derived into JSON Schema — restate the bounds the
    // domain enforces so the generated spec documents them.
    minLength: NOTE_TITLE_MIN_LENGTH,
    maxLength: NOTE_TITLE_MAX_LENGTH,
  });

const noteBody = z
  .string()
  .trim()
  .min(1, "Enter the note body.")
  .max(NOTE_BODY_MAX_LENGTH, `The body may be at most ${NOTE_BODY_MAX_LENGTH} characters.`)
  .meta({ description: "Body of the note, free text." });

export const noteStatus = z.enum(NOTE_STATUSES).meta({
  description: "Whether the note is a draft or published.",
});
export type NoteStatusValue = z.infer<typeof noteStatus>;

export const createNoteInput = z.object({
  title: noteTitle,
  body: noteBody,
  status: noteStatus.default("DRAFT"),
});
export type CreateNoteInput = z.infer<typeof createNoteInput>;

/**
 * One note as a list response carries it. The body is deliberately absent: it
 * is unbounded free text, so shipping it per row would put every note's full
 * contents into one response. `excerpt` is the preview the table renders.
 */
export const noteResource = z.object({
  id: z.string(),
  title: z.string(),
  excerpt: z.string().meta({ description: "One-line preview derived from the body." }),
  status: noteStatus,
  createdAt: z.iso.datetime(),
});
export type NoteResource = z.infer<typeof noteResource>;

export const NOTE_SORT_COLUMNS = ["title", "status", "createdAt"] as const;
export type NoteSort = (typeof NOTE_SORT_COLUMNS)[number];

export const noteListQuery = pageQuery.extend({
  q: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional()
    .meta({ description: "Search across title and body." }),
  status: noteStatus.optional().meta({ description: "Keep only notes with this status." }),
  sort: z.enum(NOTE_SORT_COLUMNS).default("createdAt").meta({ description: "Column to order by." }),
  dir: z.enum(["asc", "desc"]).default("desc").meta({ description: "Order direction." }),
});
export type NoteListQuery = z.infer<typeof noteListQuery>;

export const noteListResponse = pagedResponse(noteResource);
export type NoteListResponse = z.infer<typeof noteListResponse>;

export const noteResponse = z.object({ data: noteResource });
export type NoteResponse = z.infer<typeof noteResponse>;

/** Path parameter identifying a single note (e.g. DELETE …/{noteId}). */
export const noteIdParam = z
  .string()
  .min(1)
  .meta({ description: "Identifier of the note.", examples: ["c8h2k1p0q9z4x7y3"] });

/**
 * Inputs that can collide with an existing record. Returned by the create use
 * case and mapped onto problem field errors by the route handler.
 */
export const NOTE_CONFLICT_FIELDS = ["title"] as const;
export type NoteConflictField = (typeof NOTE_CONFLICT_FIELDS)[number];

export const noteConflictMessages: Record<NoteConflictField, string> = {
  title: "A note with this title already exists.",
};
