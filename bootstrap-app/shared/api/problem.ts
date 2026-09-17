// RFC 9457 "Problem Details for HTTP APIs" — the single error format of the
// REST API. Isomorphic on purpose: route handlers build problems, the browser
// client parses them, and the OpenAPI document describes them from the same
// schema.
import { z } from "zod";

export const PROBLEM_CONTENT_TYPE = "application/problem+json";

/**
 * Problem type URIs. Relative references (RFC 9457 §3.1.1) resolved against
 * the API host; each one is documented in docs/rest-api.md.
 */
export const PROBLEM_TYPES = {
  unauthenticated: "/problems/unauthenticated",
  forbidden: "/problems/forbidden",
  notFound: "/problems/not-found",
  validation: "/problems/validation",
  conflict: "/problems/conflict",
  unsupportedMediaType: "/problems/unsupported-media-type",
  malformedBody: "/problems/malformed-body",
  internal: "/problems/internal-error",
} as const;

/** Which input a problem is about. `field` is a request-body member name. */
export const problemFieldError = z.object({
  field: z.string(),
  message: z.string(),
});
export type ProblemFieldError = z.infer<typeof problemFieldError>;

/**
 * A problem document. `errors` is a registered extension member carrying
 * per-field messages so forms can highlight the offending inputs.
 */
export const problemDetails = z.object({
  type: z.string(),
  title: z.string(),
  status: z.int().min(400).max(599),
  detail: z.string().optional(),
  errors: z.array(problemFieldError).optional(),
});
export type ProblemDetails = z.infer<typeof problemDetails>;

/**
 * Thrown anywhere inside a route handler; `apiHandler` turns it into the
 * problem response. Handlers never build responses for failures themselves.
 */
export class ApiProblemError extends Error {
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(`${problem.status} ${problem.title}`);
    this.name = "ApiProblemError";
    this.problem = problem;
  }
}

export function problemResponse(problem: ProblemDetails): Response {
  return new Response(JSON.stringify(problem), {
    status: problem.status,
    headers: {
      "content-type": PROBLEM_CONTENT_TYPE,
      // Error bodies are per-caller and must never be stored by a proxy.
      "cache-control": "no-store",
    },
  });
}

export function isProblemDetails(value: unknown): value is ProblemDetails {
  return problemDetails.safeParse(value).success;
}

/**
 * Authentication is missing or unusable. Deliberately vague: the API never
 * reveals whether an account, session or resource exists.
 */
export function unauthenticated(): ApiProblemError {
  return new ApiProblemError({
    type: PROBLEM_TYPES.unauthenticated,
    title: "Unauthenticated",
    status: 401,
    detail: "Sign in and try again.",
  });
}

/** Authenticated, but the caller may not perform this operation. */
export function forbidden(
  detail = "You are not allowed to perform this operation.",
): ApiProblemError {
  return new ApiProblemError({
    type: PROBLEM_TYPES.forbidden,
    title: "Forbidden",
    status: 403,
    detail,
  });
}

export function notFound(detail = "The resource does not exist."): ApiProblemError {
  return new ApiProblemError({
    type: PROBLEM_TYPES.notFound,
    title: "Not Found",
    status: 404,
    detail,
  });
}

/** Request body failed contract validation. */
export function validationFailed(errors: ProblemFieldError[]): ApiProblemError {
  return new ApiProblemError({
    type: PROBLEM_TYPES.validation,
    title: "Unprocessable Entity",
    status: 422,
    detail: "Some of the submitted values are not valid.",
    errors,
  });
}

/** Request is valid but collides with existing state (a unique title, say). */
export function conflict(
  errors: ProblemFieldError[],
  detail = "The request collides with an existing record.",
): ApiProblemError {
  return new ApiProblemError({
    type: PROBLEM_TYPES.conflict,
    title: "Conflict",
    status: 409,
    detail,
    errors,
  });
}

export function unsupportedMediaType(): ApiProblemError {
  return new ApiProblemError({
    type: PROBLEM_TYPES.unsupportedMediaType,
    title: "Unsupported Media Type",
    status: 415,
    detail: "Use Content-Type: application/json.",
  });
}

export function malformedBody(): ApiProblemError {
  return new ApiProblemError({
    type: PROBLEM_TYPES.malformedBody,
    title: "Bad Request",
    status: 400,
    detail: "The request body is not valid JSON.",
  });
}

/** Fallback for unexpected failures — never carries internal details. */
export function internalError(): ApiProblemError {
  return new ApiProblemError({
    type: PROBLEM_TYPES.internal,
    title: "Internal Server Error",
    status: 500,
    detail: "The request could not be processed.",
  });
}

/** zod issues → problem field errors (first message per field wins). */
export function fieldErrorsFromZod(error: z.ZodError): ProblemFieldError[] {
  const seen = new Set<string>();
  const errors: ProblemFieldError[] = [];

  for (const issue of error.issues) {
    const field = issue.path.map(String).join(".");
    if (seen.has(field)) {
      continue;
    }
    seen.add(field);
    errors.push({ field, message: issue.message });
  }

  return errors;
}
