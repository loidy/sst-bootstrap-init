import { pageMetaOf, type PageMeta } from "@/shared/pagination";

import type { NoteListQuery, NoteResource } from "../contracts";
import { listNoteRows, type NoteRow } from "../data/notes";
import { excerptOf } from "../domain/excerpt";

/**
 * One page of live notes. Called directly by the notes page and by
 * `GET /api/v1/notes` — one function, two entry points, so a page and its API
 * can never disagree about what a note looks like.
 */
export async function listNotes(
  query: NoteListQuery,
): Promise<{ items: NoteResource[]; page: PageMeta }> {
  const { rows, total } = await listNoteRows(query);

  return { items: rows.map(toNoteResource), page: pageMetaOf(query, total) };
}

export function toNoteResource(row: NoteRow): NoteResource {
  return {
    id: row.id,
    title: row.title,
    excerpt: excerptOf(row.body),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}
