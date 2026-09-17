"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { fieldErrorsOf } from "@/shared/api/client";
import { Alert } from "@/shared/ui/alert";
import { Button } from "@/shared/ui/button";
import { Field } from "@/shared/ui/field";
import { Input, Select, Textarea } from "@/shared/ui/input";

import { createNoteRequest } from "../client/notes.client";
import { createNoteInput, type NoteStatusValue } from "../contracts";

const EMPTY_DRAFT = { title: "", body: "", status: "DRAFT" as NoteStatusValue };

/**
 * Validates with the same contract the route handler does, so an obvious
 * mistake never leaves the browser — and maps the problem document's `errors`
 * back onto the fields when the server rejects anyway.
 */
export function CreateNoteForm() {
  const router = useRouter();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const parsed = createNoteInput.safeParse(draft);
    if (!parsed.success) {
      setFieldErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path.map(String).join("."), issue.message]),
        ),
      );
      return;
    }

    setFieldErrors({});
    setSubmitting(true);
    const result = await createNoteRequest(parsed.data);
    setSubmitting(false);

    if (!result.ok) {
      setFieldErrors(fieldErrorsOf(result.problem));
      setFormError(result.problem.detail ?? result.problem.title);
      return;
    }

    setDraft(EMPTY_DRAFT);
    router.refresh();
  }

  return (
    <form className="ui-card" onSubmit={handleSubmit} noValidate>
      <header className="ui-card__header">
        <h2 className="ui-card__title">New note</h2>
      </header>
      <div className="ui-card__body ui-stack">
        {formError ? (
          <Alert tone="danger" title="Could not save the note">
            {formError}
          </Alert>
        ) : null}

        <Field label="Title" htmlFor="note-title" error={fieldErrors["title"]}>
          <Input
            id="note-title"
            value={draft.title}
            aria-invalid={Boolean(fieldErrors["title"])}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </Field>

        <Field label="Body" htmlFor="note-body" error={fieldErrors["body"]}>
          <Textarea
            id="note-body"
            value={draft.body}
            aria-invalid={Boolean(fieldErrors["body"])}
            onChange={(event) => setDraft({ ...draft, body: event.target.value })}
          />
        </Field>

        <Field label="Status" htmlFor="note-status" error={fieldErrors["status"]}>
          <Select
            id="note-status"
            value={draft.status}
            onChange={(event) =>
              setDraft({ ...draft, status: event.target.value as NoteStatusValue })
            }
          >
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
          </Select>
        </Field>

        <div className="ui-row">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Saving…" : "Create note"}
          </Button>
        </div>
      </div>
    </form>
  );
}
