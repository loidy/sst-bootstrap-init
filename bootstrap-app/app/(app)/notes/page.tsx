import type { Metadata } from "next";

import { CreateNoteForm, NotesTable, listNotes, noteListQuery } from "@/features/notes";
import { readSearchParams } from "@/shared/api/handler";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "Notes" };

/**
 * Reads through the same use case the REST endpoint exposes, called directly: a
 * server component fetching its own HTTP API would add a round trip without
 * changing what is enforced.
 */
export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = readSearchParams(await searchParams, noteListQuery);
  const { items, page } = await listNotes(query);

  return (
    <div className="ui-stack">
      <PageHeader
        eyebrow={`${page.total} ${page.total === 1 ? "note" : "notes"}`}
        title="Notes"
        description="The example vertical slice: domain rules, a repository, use cases, a REST contract, and the UI that renders it."
      />

      <CreateNoteForm />
      <NotesTable notes={items} />
    </div>
  );
}
