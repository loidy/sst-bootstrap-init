"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/shared/ui/button";

import { archiveNoteRequest } from "../client/notes.client";

/**
 * Interactive mutation: call the typed client, then `router.refresh()` so the
 * server component re-reads through the use case instead of this component
 * keeping a second copy of the list in state.
 */
export function ArchiveNoteButton({ noteId, noteTitle }: { noteId: string; noteTitle: string }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleArchive() {
    setSubmitting(true);
    setError(null);

    const result = await archiveNoteRequest(noteId);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.problem.detail ?? result.problem.title);
      return;
    }

    router.refresh();
  }

  return (
    <>
      <Button
        variant="danger"
        size="sm"
        onClick={handleArchive}
        disabled={submitting}
        aria-label={`Archive ${noteTitle}`}
      >
        {submitting ? "Archiving…" : "Archive"}
      </Button>
      {error ? <p className="ui-field__error">{error}</p> : null}
    </>
  );
}
