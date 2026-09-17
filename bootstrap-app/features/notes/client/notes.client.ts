// Typed browser fetchers. Client components mutate through these and never call
// `fetch` themselves, so every request carries the same headers and every
// failure arrives as a parsed problem document.
import { apiRequest, type ApiResult } from "@/shared/api/client";

import type { CreateNoteInput, NoteResponse } from "../contracts";

/** POST /api/v1/notes — create a note. */
export function createNoteRequest(input: CreateNoteInput): Promise<ApiResult<NoteResponse>> {
  return apiRequest<NoteResponse>("/api/v1/notes", { method: "POST", body: input });
}

/** DELETE /api/v1/notes/{noteId} — archives (soft-deletes) a note. */
export function archiveNoteRequest(id: string): Promise<ApiResult<null>> {
  return apiRequest<null>(`/api/v1/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
}
