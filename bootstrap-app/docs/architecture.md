# Architecture

The app is organized by **feature**, not by technical role. There is no top-level
`components/`, `services/`, or `models/`; everything one feature needs lives in
one folder, and the layers inside that folder are what keep it from turning into
a ball of mud.

`features/notes/` is the reference implementation. Read it top to bottom before
writing a new feature.

## The vertical slice

```
features/notes/
  domain/            pure rules — no IO, no Prisma, no framework
  data/              repositories — the ONLY layer that imports shared/db
  use-cases/         orchestrate data + domain
  contracts.ts       zod schemas — the single source of truth for validation and OpenAPI
  api/               route handlers + the OpenAPI fragment
  client/            typed browser fetchers
  ui/                server and client components
  index.ts           the only surface other features may import
```

Dependencies point **inward and downward**. Nothing below reaches up:

```
ui ─┐
    ├──> use-cases ──> data ──> shared/db ──> @bootstrap/database
api ┘         └──────> domain
                          ▲
contracts.ts ─────────────┘
```

`eslint.config.mjs` encodes exactly this with `eslint-plugin-boundaries`. A
forbidden import is a lint error, not a code-review note.

### Why each layer exists

**`domain/`** holds the rules that would still be true if the app had no
database, no HTTP, and no React: how a title is normalized, what makes it valid,
how an excerpt is cut. It is pure, so it is trivially testable — and the tests
there are the cheapest ones in the project. ESLint additionally blocks `react`,
`next`, `@prisma/*`, `@bootstrap/*`, and `server-only` imports here, because
"pure" erodes the moment one framework import sneaks in.

**`data/`** is the only place Prisma appears. Every function takes and returns
plain data, so a use case never holds a query builder and swapping the storage
engine touches one folder. `NoteRow` is derived from the repository's own return
type, so a changed `select` propagates to the compiler rather than to production.

**`use-cases/`** is the funnel. One use case per thing the app does, and it is
the _only_ entry point to a feature's behaviour — both for a Server Component
rendering a page and for a REST handler serving a client. That is what makes the
page and the API impossible to disagree with each other.

Expected failures come back as typed results (`{ ok: false; conflicts: [...] }`),
not exceptions. Exceptions are for the unexpected, which `apiHandler` turns into
a 500. This is why a taken note title produces a clean 409 naming `title` and a
dropped connection produces a bare 500.

**`contracts.ts`** is isomorphic: it may import zod, its own `domain/`, and the
pure `shared/pagination` module — nothing else. That restriction is what lets the
same schema validate in the browser (`ui/create-note-form.tsx`), validate on the
server (`api/notes-handlers.ts`), and generate the OpenAPI document
(`api/notes-spec.ts`). Three consumers, one definition, so the spec cannot drift
from the implementation.

**`api/`** is thin on purpose: guard, validate, call the use case, choose a
status code. Handlers hold no business logic, which is why their tests are smoke
tests. `*-spec.ts` stays free of `server-only` imports so the
`openapi:generate` script can build the document without a Next.js runtime.

**`client/`** wraps `fetch` once. Every request gets the same headers and
`credentials: "same-origin"`, and every failure arrives as a parsed problem
document, so components never branch on status codes.

**`ui/`** is split by need: server components render what the page already read;
client components (`"use client"`) handle interaction, call `client/`, and then
`router.refresh()` so the server re-reads through the use case instead of the
component keeping a second copy of the list in state.

**`index.ts`** is the feature's public API. Cross-feature imports must go through
it, so one feature's internals can be rearranged without a repo-wide search.

## `app/` has no logic

Route files render a feature's `ui/`, or re-export a feature's `api/` handler:

```ts
// app/api/v1/notes/route.ts
export { GET, POST } from "@/features/notes/api/notes-handlers";
```

Handlers live in the feature so they can reach its use cases; the route file only
mounts them at a URL. Pages are similarly thin — parse the search params with the
contract, call the use case, hand the result to a feature component.

`app/(app)/` is a route group: it wraps pages in the app shell without adding an
`/app` path segment. It is also where a page-level auth guard belongs once there
is one.

## `shared/`

Infrastructure that is genuinely cross-cutting, and nothing else. A helper used
by one feature belongs in that feature.

| Module              | Responsibility                                                           |
| ------------------- | ------------------------------------------------------------------------ |
| `shared/api`        | problem documents, `apiHandler`, guards, browser client, OpenAPI builder |
| `shared/db`         | the single Prisma re-export; the seam for future global scoping          |
| `shared/pagination` | the `page`/`limit` contract and the skip/take + metadata arithmetic      |
| `shared/ui`         | the UI kit — see [ui-kit.md](ui-kit.md)                                  |
| `shared/lib`        | small dependency-free helpers                                            |

`shared/db` exists so features never import `@bootstrap/database` directly. It is
one line today; when a cross-cutting concern arrives (soft-delete
filters, transaction helpers) there is one place to put it.

## Reads and writes

**Writes are REST, always.** No server actions. One endpoint per write means one
place to guard, one thing to document, and something you can call with `curl`.
See [rest-api.md](rest-api.md).

**Reads have two entry points to the same function.** The page calls
`listNotes()` directly; `GET /api/v1/notes` calls the same `listNotes()`. A
Server Component fetching its own HTTP API would add a network round trip and a
second authorization model for no benefit.

## Testing

Tests sit next to the code they cover, and their weight follows the layers:

| Layer        | What to test                                    | Example                         |
| ------------ | ----------------------------------------------- | ------------------------------- |
| `domain/`    | heavily — every rule and edge, no mocks needed  | `domain/note-title.test.ts`     |
| `use-cases/` | the orchestration, with the repository mocked   | `use-cases/create-note.test.ts` |
| `api/`       | a smoke test: guard, validation, status mapping | `api/notes-handlers.test.ts`    |
| `shared/`    | the contract other code relies on               | `shared/api/problem.test.ts`    |

Assert real invariants. A test that restates the implementation catches nothing.
