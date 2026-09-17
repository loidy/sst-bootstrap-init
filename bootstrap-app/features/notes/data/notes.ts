import { Prisma } from "@bootstrap/database/server";

import { db } from "@/shared/db";
import { pageRange } from "@/shared/pagination";

import type { NoteListQuery, NoteSort } from "../contracts";
import type { NoteStatus } from "../domain/note-status";

/** Columns every read in this repository returns, so callers map one shape. */
const noteSelect = {
  id: true,
  title: true,
  body: true,
  status: true,
  createdAt: true,
} satisfies Prisma.NoteSelect;

export type NoteRow = Awaited<ReturnType<typeof listNoteRows>>["rows"][number];

// A second key breaks ties, or a row can appear on two pages of the same list.
const ORDER_BY: Record<NoteSort, (dir: Prisma.SortOrder) => Prisma.NoteOrderByWithRelationInput[]> =
  {
    title: (dir) => [{ title: dir }, { id: dir }],
    status: (dir) => [{ status: dir }, { id: dir }],
    createdAt: (dir) => [{ createdAt: dir }, { id: dir }],
  };

export async function listNoteRows(query: NoteListQuery) {
  const search = query.q?.trim();
  const where: Prisma.NoteWhereInput = {
    archivedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(search
      ? {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { body: { contains: search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  // Counted first so `pageRange` can clamp a page past the end.
  const total = await db.note.count({ where });
  const rows = await db.note.findMany({
    where,
    orderBy: ORDER_BY[query.sort](query.dir),
    ...pageRange(query, total),
    select: noteSelect,
  });

  return { rows, total };
}

/**
 * Inserts a note, or returns null when the unique title is already taken. The
 * constraint is the arbiter rather than a preceding SELECT, so two concurrent
 * creates cannot both pass the check and one of them 500.
 */
export async function createNoteRow(data: {
  title: string;
  body: string;
  status: NoteStatus;
}): Promise<NoteRow | null> {
  try {
    return await db.note.create({ data, select: noteSelect });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * Soft-deletes a note. False when it does not exist or is already archived —
 * the caller cannot tell the two apart, and neither is something to report as a
 * partial success.
 */
export async function archiveNoteRow(id: string): Promise<boolean> {
  const { count } = await db.note.updateMany({
    where: { id, archivedAt: null },
    data: { archivedAt: new Date() },
  });
  return count > 0;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
