jest.mock("../data/notes", () => ({
  createNoteRow: (data: unknown) => createNoteRow(data),
}));

const createNoteRow = jest.fn();

import { createNote } from "./create-note";

const row = {
  id: "note_1",
  title: "Release checklist",
  body: "  Tag the release,\n\nthen publish the notes.  ",
  status: "DRAFT" as const,
  createdAt: new Date("2026-02-03T09:30:00.000Z"),
};

beforeEach(() => {
  createNoteRow.mockReset();
});

describe("createNote", () => {
  it("stores the note and maps the row onto the resource", async () => {
    createNoteRow.mockResolvedValue(row);

    await expect(
      createNote({ title: "Release checklist", body: row.body, status: "DRAFT" }),
    ).resolves.toEqual({
      ok: true,
      note: {
        id: "note_1",
        title: "Release checklist",
        // Derived by the domain, not stored: flattened and trimmed.
        excerpt: "Tag the release, then publish the notes.",
        status: "DRAFT",
        createdAt: "2026-02-03T09:30:00.000Z",
      },
    });
  });

  it("passes only the contract fields through to the repository", async () => {
    createNoteRow.mockResolvedValue(row);

    await createNote({ title: "Release checklist", body: "Body.", status: "PUBLISHED" });

    expect(createNoteRow).toHaveBeenCalledWith({
      title: "Release checklist",
      body: "Body.",
      status: "PUBLISHED",
    });
  });

  it("reports a taken title as a conflict on that field rather than throwing", async () => {
    createNoteRow.mockResolvedValue(null);

    await expect(
      createNote({ title: "Release checklist", body: "Body.", status: "DRAFT" }),
    ).resolves.toEqual({ ok: false, conflicts: ["title"] });
  });

  it("lets an unexpected repository failure escape, so the handler answers 500", async () => {
    createNoteRow.mockRejectedValue(new Error("connection reset"));

    await expect(
      createNote({ title: "Release checklist", body: "Body.", status: "DRAFT" }),
    ).rejects.toThrow("connection reset");
  });
});
