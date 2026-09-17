// OpenAPI description of the note endpoints, generated from the same contracts
// the handlers validate with. Kept free of server-only imports so the
// `openapi:generate` script can build the document without a Next.js runtime.
import { z } from "zod";

import { queryParameters, schemaRef, type ApiSpecFragment } from "@/shared/api/openapi";

import {
  createNoteInput,
  noteIdParam,
  noteListQuery,
  noteListResponse,
  noteResource,
  noteResponse,
} from "../contracts";

export const NOTES_PATH = "/api/v1/notes";

// $schema/$id bookkeeping is stripped by the OpenAPI builder.
const noteIdSchema = z.toJSONSchema(noteIdParam, { target: "draft-2020-12" }) as Record<
  string,
  unknown
>;

export const notesApiSpec: ApiSpecFragment = {
  tag: {
    name: "Notes",
    description: "The example resource. Mirrors the layout every feature follows.",
  },
  schemas: {
    Note: noteResource,
    NoteListResponse: noteListResponse,
    NoteResponse: noteResponse,
    CreateNoteInput: createNoteInput,
  },
  paths: {
    [NOTES_PATH]: {
      get: {
        operationId: "listNotes",
        summary: "List notes",
        description: [
          "One page of notes that are not archived. Paging, search, filtering and",
          "ordering all happen on the server; the response carries a `page` object",
          "with the total. The body is not part of a row — `excerpt` is.",
        ].join(" "),
        tags: ["Notes"],
        parameters: queryParameters(noteListQuery),
        responses: {
          200: { description: "One page of notes.", schema: schemaRef("NoteListResponse") },
          422: { description: "The query parameters are not valid.", schema: schemaRef("Problem") },
        },
      },
      post: {
        operationId: "createNote",
        summary: "Create a note",
        description:
          "Creates a note. Titles are unique after whitespace collapsing, so a duplicate is a 409 naming `title`.",
        tags: ["Notes"],
        requestBody: { schema: schemaRef("CreateNoteInput") },
        responses: {
          201: {
            description: "The note was created.",
            schema: schemaRef("NoteResponse"),
          },
          409: {
            description: "A note with this title already exists.",
            schema: schemaRef("Problem"),
          },
          415: {
            description: "Content-Type is not application/json.",
            schema: schemaRef("Problem"),
          },
          422: { description: "The body is not valid.", schema: schemaRef("Problem") },
        },
      },
    },
    [`${NOTES_PATH}/{noteId}`]: {
      delete: {
        operationId: "archiveNote",
        summary: "Archive a note",
        description:
          "Soft-deletes a note: it disappears from the list but the row, and therefore the id, stays resolvable.",
        tags: ["Notes"],
        parameters: [
          { name: "noteId", description: "Identifier of the note.", schema: noteIdSchema },
        ],
        responses: {
          204: { description: "The note was archived." },
          404: {
            description: "The note does not exist or is already archived.",
            schema: schemaRef("Problem"),
          },
        },
      },
    },
  },
};
