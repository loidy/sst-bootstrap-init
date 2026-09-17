# REST API

Every state change in the application goes through the REST API under
`/api/v1`. There are no server actions for mutations: one namespace, one
authorization model, one documented contract.

The full path index lives in [openapi.json](openapi.json) (regenerated via
`npm run openapi:generate`) and at the live `GET /api/v1/openapi.json`. This doc
covers the conventions that document does not.

The example surface:

```
GET    /api/v1/notes            one page of notes (page/limit/q/status/sort/dir)
POST   /api/v1/notes            create a note
DELETE /api/v1/notes/{noteId}   archive (soft-delete) a note
GET    /api/v1/openapi.json     this API's OpenAPI 3.1 document
```

## Shapes

**Success.** A single resource is `{ "data": <resource> }`. A collection is
`{ "data": [<resource>], "page": { page, limit, total, totalPages } }`. The
envelope means a response can grow a sibling member later without becoming a
breaking change.

`POST` answers `201` with a `Location` header pointing at the new resource. A
mutation with nothing to return answers `204`.

Responses are never cached (`cache-control: no-store`): every resource is
caller-scoped.

**Failure.** Always an RFC 9457 problem document, served as
`application/problem+json`:

```json
{
  "type": "/problems/validation",
  "title": "Unprocessable Entity",
  "status": 422,
  "detail": "Some of the submitted values are not valid.",
  "errors": [{ "field": "title", "message": "Enter a title of at least 3 characters." }]
}
```

`errors` is an extension member carrying per-field messages, so a form can
highlight the offending inputs — `fieldErrorsOf()` in `shared/api/client.ts` maps
it onto field names. Handlers never build an error `Response` by hand; they
`throw` a helper from `shared/api/problem.ts` and `apiHandler` renders it.

`type` values are relative references resolved against the API host:

| Type                               | Status | Meaning                                      |
| ---------------------------------- | ------ | -------------------------------------------- |
| `/problems/malformed-body`         | 400    | The body is not valid JSON                   |
| `/problems/unauthenticated`        | 401    | Missing or unusable credentials              |
| `/problems/forbidden`              | 403    | Not allowed (including the `Origin` check)   |
| `/problems/not-found`              | 404    | The resource does not exist                  |
| `/problems/conflict`               | 409    | Collides with existing state                 |
| `/problems/unsupported-media-type` | 415    | `Content-Type` is not `application/json`     |
| `/problems/validation`             | 422    | The body or query failed contract validation |
| `/problems/internal-error`         | 500    | Unexpected failure; never carries details    |

401 and 403 are deliberately vague: the API does not reveal whether an account,
session, or resource exists.

## Status choices worth copying

- **A duplicate is 409, not 422.** The input was well-formed; it lost a race with
  existing state. The `errors` array still names the field so the form can
  highlight it.
- **An already-archived resource is 404, not a second 204.** It is invisible to
  reads, so it is not there to archive. The caller cannot distinguish "never
  existed" from "already gone", which is the point.
- **A bad query parameter is 422, not a silent default.** `readQuery` rejects it.
  Pages are the exception: `readSearchParams` drops offending members and falls
  back to the contract's defaults, because a hand-edited URL should not blank a
  page.
- **A limit above the cap is 422, not a clamp.** Silently serving 50 rows when
  10 000 were asked for hides a broken client.

## Guards

Nothing matches `/api/*` ahead of the handlers, so **every handler calls a guard
from `shared/api/guards.ts` as its first statement**. A handler that forgets its
guard is unguarded.

This starter ships only `requireSameOrigin`, which is CSRF defense in depth for
browser mutations: browsers set `Origin` on every non-GET request and
cannot be told to forge it. Non-browser clients must therefore send `Origin`
explicitly on mutations:

```bash
curl -X POST http://localhost:3000/api/v1/notes \
  -H 'content-type: application/json' \
  -H 'origin: http://localhost:3000' \
  -d '{"title":"Release checklist","body":"Tag the release."}'
```

Authentication belongs in the same file — see the note at the top of
`shared/api/guards.ts`.

## Adding an endpoint

1. **Contract.** Add the request/response schemas to the feature's
   `contracts.ts`. Add `.meta({ description, examples })` — that text becomes the
   OpenAPI documentation.
2. **Use case.** Add or extend a function in `use-cases/`. Return typed results
   for expected failures; throw only for the unexpected.
3. **Handler.** In `api/*-handlers.ts`: `apiHandler(async (request) => { … })`,
   guard first, validate with the contract, call the use case, map the result to a
   status.
4. **Spec fragment.** Describe the operation in `api/*-spec.ts` using
   `schemaRef()` and `queryParameters()`. Register any new named schema in the
   fragment's `schemas` map.
5. **Mount it.** Create `app/api/v1/**/route.ts` as a one-line re-export of the
   handler. New features also register their fragment in `app/api/v1/_spec.ts`.
6. **Regenerate.** `npm run openapi:generate`, and commit `docs/openapi.json`
   with the change.
7. **Test it.** A handler smoke test covering the guard, a validation failure, and
   the success mapping.

Steps 4–6 are not optional. The generated document is how the API stays
discoverable, and it only stays honest if it is regenerated in the same commit as
the change.
