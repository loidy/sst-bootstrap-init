import { archiveNoteRow } from "../data/notes";

/**
 * Archives (soft-deletes) a note. An unknown id and an already archived note
 * are the same answer: the row is not there to archive, which the handler
 * reports as 404.
 */
export async function archiveNote(id: string): Promise<{ ok: boolean }> {
  return { ok: await archiveNoteRow(id) };
}
