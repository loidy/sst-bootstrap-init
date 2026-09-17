import { z } from "zod";

export const MAX_PAGE_SIZE = 50;
export const DEFAULT_PAGE_SIZE = 25;

export const pageQuery = z.object({
  page: z.coerce
    .number()
    .int()
    .min(1)
    .default(1)
    .meta({
      description: "Page number, counted from 1.",
      examples: [1],
    }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_SIZE)
    .default(DEFAULT_PAGE_SIZE)
    .meta({
      description: `Records per page, at most ${MAX_PAGE_SIZE}.`,
      examples: [DEFAULT_PAGE_SIZE],
    }),
});
export type PageQuery = z.infer<typeof pageQuery>;

export const pageMeta = z.object({
  page: z.int().meta({ description: "The page the response actually carries." }),
  limit: z.int(),
  total: z.int().meta({ description: "Records matching the filter." }),
  totalPages: z.int(),
});
export type PageMeta = z.infer<typeof pageMeta>;

export function pagedResponse<T extends z.ZodType>(resource: T) {
  return z.object({ data: z.array(resource), page: pageMeta });
}

function totalPagesOf(total: number, limit: number): number {
  return Math.max(1, Math.ceil(total / limit));
}

/** A page past the end serves the last one instead of an empty response. */
function clampPage(query: PageQuery, total: number): number {
  return Math.min(query.page, totalPagesOf(total, query.limit));
}

export function pageRange(query: PageQuery, total: number): { skip: number; take: number } {
  return { skip: (clampPage(query, total) - 1) * query.limit, take: query.limit };
}

export function pageMetaOf(query: PageQuery, total: number): PageMeta {
  return {
    page: clampPage(query, total),
    limit: query.limit,
    total,
    totalPages: totalPagesOf(total, query.limit),
  };
}
