import "server-only";

import type { z } from "zod";

import {
  ApiProblemError,
  fieldErrorsFromZod,
  internalError,
  malformedBody,
  problemResponse,
  unsupportedMediaType,
  validationFailed,
} from "./problem";

/** What Next calls. */
type RouteHandler<Ctx> = (request: Request, context: Ctx) => Promise<Response>;

/** What a feature writes. */
type FeatureHandler<Ctx> = (request: Request, context: Ctx) => Promise<Response> | Response;

/**
 * Wraps a REST route handler so every failure leaves as a problem document:
 * expected failures are thrown as `ApiProblemError`, anything else is logged
 * server-side and answered with a bare 500 that leaks nothing.
 *
 * Route handlers are the *only* enforcement point for the API, so each handler
 * must call a guard from ./guards itself as its first statement.
 *
 * Generic over Next's second route argument so dynamic segments reach the
 * handler (`apiHandler<{ params: Promise<{ noteId: string }> }>`); collection
 * handlers ignore it.
 */
export function apiHandler<Ctx = unknown>(handler: FeatureHandler<Ctx>): RouteHandler<Ctx> {
  return async (request: Request, context: Ctx) => {
    try {
      return await handler(request, context);
    } catch (error) {
      if (error instanceof ApiProblemError) {
        return problemResponse(error.problem);
      }
      console.error(`[api] ${request.method} ${new URL(request.url).pathname}`, error);
      return problemResponse(internalError().problem);
    }
  };
}

/** The bare media type of the request body, lowercased, parameters stripped. */
export function mediaTypeOf(request: Request): string | undefined {
  return request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
}

/**
 * Reads a JSON request body. Called after the guard, so an unauthorized caller
 * never learns whether the endpoint exists from a media-type error.
 *
 * A JSON-only API refuses form content types, which is what a cross-site form
 * submission would have to use to reach this endpoint.
 */
export async function readJsonBody(request: Request): Promise<unknown> {
  if (mediaTypeOf(request) !== "application/json") {
    throw unsupportedMediaType();
  }

  try {
    return await request.json();
  } catch {
    throw malformedBody();
  }
}

/** Query string parsed by a contract; a bad parameter is a 422, not a default. */
export function readQuery<T extends z.ZodType>(request: Request, schema: T): z.infer<T> {
  const parsed = schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    throw validationFailed(fieldErrorsFromZod(parsed.error));
  }
  return parsed.data;
}

/**
 * The page counterpart of `readQuery`: a hand-edited URL must not blank a page,
 * so offending members are dropped and the contract's defaults apply instead.
 */
export function readSearchParams<T extends z.ZodType>(
  searchParams: unknown,
  schema: T,
): z.infer<T> {
  const parsed = schema.safeParse(searchParams);
  if (parsed.success) {
    return parsed.data;
  }

  const cleaned = { ...(searchParams as Record<string, unknown>) };
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string") {
      delete cleaned[key];
    }
  }

  const retried = schema.safeParse(cleaned);
  return retried.success ? retried.data : schema.parse({});
}

/** 204 for mutations with no representation to return (e.g. a soft delete). */
export function noContent(): Response {
  return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

/** Successful JSON response. Never cached: every resource is caller-scoped. */
export function jsonResponse(
  body: unknown,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      ...init.headers,
    },
  });
}
