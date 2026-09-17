import "server-only";

/**
 * Every REST handler calls a guard from this file as its first statement.
 * Nothing else stands in front of the endpoints — there is no middleware for
 * `/api/*` — so a handler that forgets its guard is unguarded.
 *
 * This starter ships no authentication, so `requireSameOrigin` is the whole
 * file. Authentication belongs here: add `shared/auth/` (session lookup, roles),
 * then export guards that resolve the caller, throw `unauthenticated()` /
 * `forbidden()` from ./problem, and return the context the handler is trusted
 * to act on. Handlers then `await` that guard instead of calling
 * `requireSameOrigin` directly, and it stays the first statement.
 */
import { forbidden } from "./problem";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF defense in depth for browser mutations: the browser sets
 * `Origin` on every non-GET request and cannot be told to forge it.
 *
 * Non-browser clients must therefore send `Origin` explicitly — see
 * docs/rest-api.md.
 */
export function requireSameOrigin(request: Request): void {
  if (!MUTATING_METHODS.has(request.method)) {
    return;
  }

  const origin = request.headers.get("origin");
  if (!origin) {
    throw forbidden("The Origin header is missing.");
  }

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden("The Origin header is not a valid URL.");
  }

  if (originHost !== request.headers.get("host")) {
    throw forbidden("The request comes from an untrusted origin.");
  }
}
