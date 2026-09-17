import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, pageMetaOf, pageQuery, pageRange } from "./page-query";

describe("pageQuery", () => {
  it("defaults an absent query to the first page", () => {
    expect(pageQuery.parse({})).toEqual({ page: 1, limit: DEFAULT_PAGE_SIZE });
  });

  it("coerces the string values a URL always carries", () => {
    expect(pageQuery.parse({ page: "3", limit: "10" })).toEqual({ page: 3, limit: 10 });
  });

  it("rejects a limit above the cap instead of clamping it", () => {
    expect(pageQuery.safeParse({ limit: String(MAX_PAGE_SIZE + 1) }).success).toBe(false);
  });

  it("rejects a page below one", () => {
    expect(pageQuery.safeParse({ page: "0" }).success).toBe(false);
  });
});

describe("pageRange", () => {
  it("skips the pages before the requested one", () => {
    expect(pageRange({ page: 3, limit: 10 }, 100)).toEqual({ skip: 20, take: 10 });
  });

  it("serves the last page when the request is past the end", () => {
    expect(pageRange({ page: 9, limit: 10 }, 24)).toEqual({ skip: 20, take: 10 });
  });

  it("stays on the first page when nothing matches", () => {
    expect(pageRange({ page: 4, limit: 10 }, 0)).toEqual({ skip: 0, take: 10 });
  });
});

describe("pageMetaOf", () => {
  it("reports the page it actually served, not the one asked for", () => {
    expect(pageMetaOf({ page: 9, limit: 10 }, 24)).toEqual({
      page: 3,
      limit: 10,
      total: 24,
      totalPages: 3,
    });
  });

  it("counts a partial last page", () => {
    expect(pageMetaOf({ page: 1, limit: 10 }, 21).totalPages).toBe(3);
  });

  it("reports one page when there are no records, so the UI has a page to render", () => {
    expect(pageMetaOf({ page: 1, limit: 10 }, 0)).toEqual({
      page: 1,
      limit: 10,
      total: 0,
      totalPages: 1,
    });
  });
});
