import { formatDate } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { EmptyState } from "@/shared/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/shared/ui/table";

import type { NoteResource } from "../contracts";

import { ArchiveNoteButton } from "./archive-note-button";

/**
 * Server component: it renders what the page already read through the use case
 * and delegates the one interactive bit to a client component per row.
 */
export function NotesTable({ notes }: { notes: NoteResource[] }) {
  if (notes.length === 0) {
    return (
      <div className="ui-card">
        <EmptyState title="No notes yet" description="Create the first one with the form above." />
      </div>
    );
  }

  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableCell as="th">Title</TableCell>
          <TableCell as="th">Status</TableCell>
          <TableCell as="th">Created</TableCell>
          <TableCell as="th" actions>
            <span className="ui-muted">Actions</span>
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {notes.map((note) => (
          <TableRow key={note.id}>
            <TableCell>
              <div>{note.title}</div>
              <div className="ui-muted">{note.excerpt}</div>
            </TableCell>
            <TableCell>
              <Badge tone={note.status === "PUBLISHED" ? "success" : "neutral"}>
                {note.status === "PUBLISHED" ? "Published" : "Draft"}
              </Badge>
            </TableCell>
            <TableCell>{formatDate(note.createdAt)}</TableCell>
            <TableCell actions>
              <ArchiveNoteButton noteId={note.id} noteTitle={note.title} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
