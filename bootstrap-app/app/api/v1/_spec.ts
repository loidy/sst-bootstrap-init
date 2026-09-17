// Every feature that exposes REST endpoints registers its OpenAPI fragment
// here. This is the one list to extend when adding an endpoint; the document is
// then assembled identically by the /api/v1/openapi.json route and by
// `npm run openapi:generate`.
import { notesApiSpec } from "@/features/notes/api/notes-spec";
import { buildOpenApiDocument, type ApiSpecFragment } from "@/shared/api/openapi";

export const apiSpecFragments: ApiSpecFragment[] = [notesApiSpec];

export function buildApiDocument(serverUrl: string): Record<string, unknown> {
  return buildOpenApiDocument({ serverUrl, fragments: apiSpecFragments });
}
