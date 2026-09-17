import type { CreateNoteInput, NoteConflictField, NoteResource } from "../contracts";
import { createNoteRow } from "../data/notes";

import { toNoteResource } from "./list-notes";

export type CreateNoteResult =
  { ok: true; note: NoteResource } | { ok: false; conflicts: NoteConflictField[] };

/**
 * Creates a note. A taken title is an expected outcome, not an exception, so it
 * comes back as a typed conflict the handler turns into a 409 with the offending
 * field named — the form can then highlight that input.
 */
export async function createNote(input: CreateNoteInput): Promise<CreateNoteResult> {
  const row = await createNoteRow({
    title: input.title,
    body: input.body,
    status: input.status,
  });

  if (!row) {
    return { ok: false, conflicts: ["title"] };
  }

  return { ok: true, note: toNoteResource(row) };
}
