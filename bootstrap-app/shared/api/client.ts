// Browser-side access to the REST API. Keeps every caller on the same
// contract: a discriminated result, with failures already parsed into RFC 9457
// problem documents so forms can map `errors` onto their fields.
import {
  PROBLEM_CONTENT_TYPE,
  internalError,
  isProblemDetails,
  type ProblemDetails,
  type ProblemFieldError,
} from "./problem";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; problem: ProblemDetails };

type ApiRequestInit = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Serialized as a JSON body. */
  body?: unknown;
  signal?: AbortSignal;
};

export async function apiRequest<T>(
  path: string,
  init: ApiRequestInit = {},
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? "GET",
      headers: {
        accept: `application/json, ${PROBLEM_CONTENT_TYPE}`,
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      // Same-origin only: any future session cookie is host-only by design.
      credentials: "same-origin",
      ...(init.signal ? { signal: init.signal } : {}),
    });
  } catch {
    return { ok: false, problem: NETWORK_PROBLEM };
  }

  const payload = await readJson(response);

  if (!response.ok) {
    return {
      ok: false,
      problem: isProblemDetails(payload) ? payload : unexpectedStatusProblem(response.status),
    };
  }

  return { ok: true, data: payload as T };
}

/** First message for a field, for forms that render errors inline. */
export function fieldErrorsOf(problem: ProblemDetails): Record<string, string> {
  const result: Record<string, string> = {};
  for (const error of problem.errors ?? []) {
    result[error.field] ??= error.message;
  }
  return result;
}

export type { ProblemDetails, ProblemFieldError };

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** The one problem document the client mints itself — the server never answered. */
const NETWORK_PROBLEM: ProblemDetails = {
  type: "/problems/network",
  title: "Service Unavailable",
  status: 503,
  detail: "The server could not be reached. Check your connection and try again.",
};

function unexpectedStatusProblem(status: number): ProblemDetails {
  return { ...internalError().problem, status: status >= 400 ? status : 500 };
}
