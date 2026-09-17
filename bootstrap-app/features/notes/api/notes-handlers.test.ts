jest.mock("server-only", () => ({}));

jest.mock("../use-cases/list-notes", () => ({ listNotes: (query: unknown) => listNotes(query) }));
jest.mock("../use-cases/create-note", () => ({
  createNote: (input: unknown) => createNote(input),
}));
jest.mock("../use-cases/archive-note", () => ({ archiveNote: (id: unknown) => archiveNote(id) }));

const listNotes = jest.fn();
const createNote = jest.fn();
const archiveNote = jest.fn();

import { DEFAULT_PAGE_SIZE } from "@/shared/pagination";

import { DELETE, GET, POST } from "./notes-handlers";

const note = {
  id: "note_1",
  title: "Release checklist",
  excerpt: "Tag the release, then publish the notes.",
  status: "DRAFT" as const,
  createdAt: "2026-02-03T09:30:00.000Z",
};

const HOST = "localhost:3000";

function getRequest(query = ""): Request {
  return new Request(`http://${HOST}/api/v1/notes${query}`, { headers: { host: HOST } });
}

function postRequest(body: unknown, origin = `http://${HOST}`): Request {
  return new Request(`http://${HOST}/api/v1/notes`, {
    method: "POST",
    headers: { host: HOST, origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  listNotes.mockReset().mockResolvedValue({
    items: [note],
    page: { page: 2, limit: 10, total: 24, totalPages: 3 },
  });
  createNote.mockReset().mockResolvedValue({ ok: true, note });
  archiveNote.mockReset().mockResolvedValue({ ok: true });
});

describe("GET /notes", () => {
  it("passes the parsed query through and answers with the page metadata", async () => {
    const response = await GET(getRequest("?page=2&sort=title&dir=asc"), undefined);

    expect(response.status).toBe(200);
    expect(listNotes).toHaveBeenCalledWith({
      page: 2,
      limit: DEFAULT_PAGE_SIZE,
      sort: "title",
      dir: "asc",
    });
    await expect(response.json()).resolves.toEqual({
      data: [note],
      page: { page: 2, limit: 10, total: 24, totalPages: 3 },
    });
  });

  it("applies the contract defaults when no query is given", async () => {
    await GET(getRequest(), undefined);

    expect(listNotes).toHaveBeenCalledWith({
      page: 1,
      limit: DEFAULT_PAGE_SIZE,
      sort: "createdAt",
      dir: "desc",
    });
  });

  it("answers 422 for a page that is not a number, without reading anything", async () => {
    const response = await GET(getRequest("?page=abc"), undefined);

    expect(response.status).toBe(422);
    expect(listNotes).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      type: "/problems/validation",
      errors: [{ field: "page" }],
    });
  });

  it("answers 422 for a limit above the cap rather than serving the whole table", async () => {
    const response = await GET(getRequest("?limit=100000"), undefined);

    expect(response.status).toBe(422);
    expect(listNotes).not.toHaveBeenCalled();
  });
});

describe("POST /notes", () => {
  it("creates the note and answers 201 with a Location header", async () => {
    const response = await POST(
      postRequest({ title: "Release checklist", body: "Tag it." }),
      undefined,
    );

    expect(response.status).toBe(201);
    expect(response.headers.get("location")).toBe("/api/v1/notes/note_1");
    await expect(response.json()).resolves.toEqual({ data: note });
  });

  it("guards the origin before it writes anything", async () => {
    const response = await POST(
      postRequest({ title: "Release checklist", body: "Tag it." }, "http://evil.example"),
      undefined,
    );

    expect(response.status).toBe(403);
    expect(createNote).not.toHaveBeenCalled();
  });

  it("applies the status default from the contract", async () => {
    await POST(postRequest({ title: "Release checklist", body: "Tag it." }), undefined);

    expect(createNote).toHaveBeenCalledWith({
      title: "Release checklist",
      body: "Tag it.",
      status: "DRAFT",
    });
  });

  it("answers 422 and names the field for an invalid body", async () => {
    const response = await POST(postRequest({ title: "no", body: "Tag it." }), undefined);

    expect(response.status).toBe(422);
    expect(createNote).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ errors: [{ field: "title" }] });
  });

  it("turns a use-case conflict into a 409 naming the offending field", async () => {
    createNote.mockResolvedValue({ ok: false, conflicts: ["title"] });

    const response = await POST(
      postRequest({ title: "Release checklist", body: "Tag it." }),
      undefined,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      type: "/problems/conflict",
      errors: [{ field: "title", message: "A note with this title already exists." }],
    });
  });

  it("answers 415 when the body is not JSON", async () => {
    const response = await POST(
      new Request(`http://${HOST}/api/v1/notes`, {
        method: "POST",
        headers: { host: HOST, origin: `http://${HOST}`, "content-type": "text/plain" },
        body: "title=x",
      }),
      undefined,
    );

    expect(response.status).toBe(415);
    expect(createNote).not.toHaveBeenCalled();
  });

  it("answers 500 without leaking the cause when the use case throws", async () => {
    createNote.mockRejectedValue(new Error("connection reset"));
    jest.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(
      postRequest({ title: "Release checklist", body: "Tag it." }),
      undefined,
    );
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(body)).toMatchObject({ type: "/problems/internal-error" });
    expect(body).not.toContain("connection reset");
  });
});

describe("DELETE /notes/{noteId}", () => {
  function deleteRequest(id: string): Request {
    return new Request(`http://${HOST}/api/v1/notes/${id}`, {
      method: "DELETE",
      headers: { host: HOST, origin: `http://${HOST}` },
    });
  }

  it("archives the note and answers 204", async () => {
    const response = await DELETE(deleteRequest("note_1"), {
      params: Promise.resolve({ noteId: "note_1" }),
    });

    expect(response.status).toBe(204);
    expect(archiveNote).toHaveBeenCalledWith("note_1");
  });

  it("answers 404 for a note that is missing or already archived", async () => {
    archiveNote.mockResolvedValue({ ok: false });

    const response = await DELETE(deleteRequest("note_gone"), {
      params: Promise.resolve({ noteId: "note_gone" }),
    });

    expect(response.status).toBe(404);
  });
});
