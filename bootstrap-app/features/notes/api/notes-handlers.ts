import "server-only";

import { requireSameOrigin } from "@/shared/api/guards";
import { apiHandler, jsonResponse, noContent, readJsonBody, readQuery } from "@/shared/api/handler";
import { conflict, fieldErrorsFromZod, notFound, validationFailed } from "@/shared/api/problem";

import { createNoteInput, noteConflictMessages, noteListQuery } from "../contracts";
import { archiveNote } from "../use-cases/archive-note";
import { createNote } from "../use-cases/create-note";
import { listNotes } from "../use-cases/list-notes";

import { NOTES_PATH } from "./notes-spec";

/** GET /api/v1/notes — one page of live notes. */
export const GET = apiHandler(async (request) => {
  requireSameOrigin(request);

  const { items, page } = await listNotes(readQuery(request, noteListQuery));
  return jsonResponse({ data: items, page });
});

/** POST /api/v1/notes — create a note; a taken title is a 409 naming `title`. */
export const POST = apiHandler(async (request) => {
  requireSameOrigin(request);

  const parsed = createNoteInput.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    throw validationFailed(fieldErrorsFromZod(parsed.error));
  }

  const result = await createNote(parsed.data);
  if (!result.ok) {
    throw conflict(
      result.conflicts.map((field) => ({ field, message: noteConflictMessages[field] })),
    );
  }

  return jsonResponse(
    { data: result.note },
    { status: 201, headers: { location: `${NOTES_PATH}/${result.note.id}` } },
  );
});

/**
 * DELETE /api/v1/notes/{noteId} — archives (soft-deletes) a note. An already
 * archived note is invisible, so it answers 404 rather than a second 204.
 */
export const DELETE = apiHandler<{ params: Promise<{ noteId: string }> }>(
  async (request, { params }) => {
    requireSameOrigin(request);

    const result = await archiveNote((await params).noteId);
    if (!result.ok) {
      throw notFound("The note does not exist.");
    }

    return noContent();
  },
);
