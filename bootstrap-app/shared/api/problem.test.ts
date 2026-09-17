import { z } from "zod";

import {
  PROBLEM_CONTENT_TYPE,
  conflict,
  fieldErrorsFromZod,
  isProblemDetails,
  notFound,
  problemResponse,
  validationFailed,
} from "./problem";

describe("problemResponse", () => {
  it("answers with the problem media type and the problem's own status", async () => {
    const response = problemResponse(notFound().problem);

    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toBe(PROBLEM_CONTENT_TYPE);
    await expect(response.json()).resolves.toMatchObject({
      type: "/problems/not-found",
      status: 404,
    });
  });

  it("forbids caching, since a problem body is caller-specific", () => {
    expect(problemResponse(notFound().problem).headers.get("cache-control")).toBe("no-store");
  });
});

describe("isProblemDetails", () => {
  it("accepts a document the API produced", () => {
    expect(isProblemDetails(conflict([{ field: "title", message: "Taken." }]).problem)).toBe(true);
  });

  it("rejects an unrelated JSON payload, so the client can fall back", () => {
    expect(isProblemDetails({ error: "nope" })).toBe(false);
  });

  it("rejects a status outside the error range", () => {
    expect(isProblemDetails({ type: "/x", title: "x", status: 200 })).toBe(false);
  });
});

describe("fieldErrorsFromZod", () => {
  const schema = z.object({
    title: z.string().min(3, "too short").max(5, "too long"),
    body: z.string().min(1, "required"),
  });

  it("names each offending field", () => {
    const result = schema.safeParse({ title: "a", body: "" });

    expect(fieldErrorsFromZod(result.error!)).toEqual([
      { field: "title", message: "too short" },
      { field: "body", message: "required" },
    ]);
  });

  it("keeps only the first message per field, so a form shows one at a time", () => {
    const multi = z.object({
      title: z.string().min(3, "too short").regex(/^x/, "must start with x"),
    });
    const result = multi.safeParse({ title: "a" });

    expect(fieldErrorsFromZod(result.error!)).toEqual([{ field: "title", message: "too short" }]);
  });

  it("joins a nested path into a dotted field name", () => {
    const nested = z.object({ author: z.object({ email: z.string().min(1, "required") }) });
    const result = nested.safeParse({ author: { email: "" } });

    expect(fieldErrorsFromZod(result.error!)[0]?.field).toBe("author.email");
  });
});

describe("validationFailed", () => {
  it("is a 422 that carries the field errors for the form to render", () => {
    const problem = validationFailed([{ field: "title", message: "too short" }]).problem;

    expect(problem.status).toBe(422);
    expect(problem.errors).toEqual([{ field: "title", message: "too short" }]);
  });
});
