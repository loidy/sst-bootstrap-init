// The only surface other features and `app/` may import. Reaching into
// `features/notes/data` or `features/notes/domain` from outside is an ESLint
// error, so this list is the feature's whole public API.
export { CreateNoteForm } from "./ui/create-note-form";
export { NotesTable } from "./ui/notes-table";
export { listNotes } from "./use-cases/list-notes";
export { noteListQuery } from "./contracts";
export type { NoteListQuery, NoteResource } from "./contracts";
