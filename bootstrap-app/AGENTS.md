# AGENTS.md

A feature-first Next.js starter. One example feature (`features/notes`) is built
all the way through, and the rules below are the ones that keep every feature
after it looking the same.

## Engineering priorities & guidelines

**The project's top priorities are security and maintainability.** When a change
forces a trade-off, prefer the secure and maintainable option over speed or
cleverness. Concretely:

### Security (non-negotiable)

- **Zero hardcoded secrets.** Never put API keys, passwords, tokens, or auth
  secrets into code, config, or tests. Read sensitive config from environment
  variables. Tests use mocks/fakes, never real or staging credentials.
- **Validate at boundaries.** Every external input (request bodies, query params,
  route params) goes through the feature's zod `contracts.ts` before reaching a
  use case.
- **No injection vectors.** Data access goes through Prisma in `data/`
  repositories; never build raw SQL or shell strings from dynamic input.
- **Guard every API handler** as its first statement (`shared/api/guards.ts`) —
  handlers are the only enforcement point; nothing matches `/api/*` ahead of
  them.
- **No destructive operations without explicit user confirmation** — dropping or
  resetting the DB schema, force pushes, bulk deletions.

### Maintainability & structure

- **Keep the structure stable and readable.** The feature-first layered shape
  described under [Architecture](#architecture--the-vertical-slice) below
  (`domain → data → use-cases → contracts → api → client → ui`, with
  `features/notes` as the reference implementation) is the law for all code.
  ESLint enforces the layer boundaries — don't fight it or suppress it.
- **Reusable UI components (the UI kit) live in `shared/ui/`.** Before writing a
  new button/input/table-style component in a feature, check `shared/ui/` and
  reuse or extend it there. See [docs/ui-kit.md](docs/ui-kit.md) for how to add a
  primitive. Feature `ui/` folders hold only feature-specific composition, never
  generic primitives.
- **Type safety:** no `any`, `@ts-ignore`, or other suppression to silence the
  compiler. Fail with typed problem-document errors (`shared/api/problem.ts`) in
  API code rather than generic strings or swallowed failures.
- **Dependency discipline:** don't add packages when the standard library or an
  installed dependency suffices. The dependency list is deliberately short — if
  one is genuinely needed, add it via npm (exact or verified version) and say
  why.
- **Atomic edits:** keep changes scoped to the task. Don't reformat or rewrite
  untouched files along the way.

### Code style, docs, and verification

- **Always check code style and formatting.** Run `npm run lint` (ESLint,
  includes boundary rules) and format with Prettier (`npm run format` writes;
  keep your edits formatted). Match existing idioms — naming, error handling,
  terse _why_-comments.
- **`docs/` is the reference — keep it alive.** Consult
  [docs/architecture.md](docs/architecture.md),
  [docs/rest-api.md](docs/rest-api.md), and [docs/ui-kit.md](docs/ui-kit.md) for
  clarifications. When a concern changes or a new one arises (a convention, an
  invariant, a gotcha), add or update the relevant doc in the same change — don't
  let docs drift from the code.
- **Keep the OpenAPI specification up to date at all times.** Every endpoint
  change updates its `api/*-spec.ts` fragment and regenerates `docs/openapi.json`
  via `npm run openapi:generate` in the same change.
- **Definition of done** — before concluding any code task, run and pass:
  `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`. Fix
  failures before finishing. New logic ships with co-located tests covering
  success and failure paths (see the procedure below) — assert real invariants,
  not tautologies.

## Architecture — the vertical slice

`features/notes/` is the canonical vertical slice. Every feature mirrors it:

```
features/<feature>/
  domain/            pure rules — no IO, no Prisma, no framework, no auth libs
  data/              *.ts repositories — the ONLY layer that imports shared/db
  use-cases/         orchestrate data + domain; the single funnel for RSC reads AND REST writes
  contracts.ts       zod request + response schemas — shared by api/ AND client/, and the OpenAPI source
  api/               *-handlers.ts (guard → validate → use-case → status) + *-spec.ts (OpenAPI fragment, no server-only imports)
  client/            typed browser fetchers (apiRequest)
  ui/                server + client components (thin; delegate to use-cases / client)
  index.ts           the ONLY surface other features may import
```

Cross-cutting infrastructure lives in `shared/` — db (Prisma singleton), api
(problem+json, guards, `apiHandler`, OpenAPI builder), pagination, ui primitives.

Concrete files to read as a template before writing your own:

- Read path shared by page + API: `features/notes/use-cases/list-notes.ts`
- Write path with conflict handling: `use-cases/create-note.ts` + `api/notes-handlers.ts`
- Soft delete: `data/notes.ts` (`archiveNoteRow`) + `use-cases/archive-note.ts`
- Dynamic route + params: `app/api/v1/notes/[noteId]/route.ts` (one-line re-export)
- OpenAPI fragment incl. a path parameter: `api/notes-spec.ts`
- Client interactive mutation: `ui/archive-note-button.tsx`
- Form that validates with the shared contract: `ui/create-note-form.tsx`

## Architecture rules (non-negotiable — ESLint enforces most)

**REST posture:**

- **Mutations: 100% REST route handlers, zero server actions.** One discoverable,
  uniformly-guarded, testable endpoint per write.
- **Reads: the use case is the single funnel.** A Server Component calls the
  use case **directly** (no self-HTTP hop — a component fetching its own `/api`
  adds a network round trip and a second auth model for zero gain); the REST
  `GET` calls the _same_ use case for interactive client reads. See the notes
  page vs. `GET /notes` — one function, two entry points.

**Layering (enforced by `boundaries/*` + `no-restricted-imports` in `eslint.config.mjs`):**

- `domain/` is **pure** — no framework/db/auth-library/`server-only` imports.
- `data/` is the **only** layer that may import `shared/db` (Prisma). Everything
  else goes through repositories.
- `app/` has no logic: it renders a feature `ui/`, or re-exports a feature `api/`
  handler.
- **The only legal cross-feature import is another feature's `index.ts`** — never
  reach into another feature's internals.

**API mechanics (`shared/api`; full contract in [docs/rest-api.md](docs/rest-api.md)):**

- Wrap every handler in `apiHandler(...)` and **call a guard from
  `shared/api/guards.ts` as the first statement** — nothing matches `/api/*`, so
  handlers are the _only_ enforcement point.
- Failures are RFC 9457 problem docs: `throw` a helper from `shared/api/problem.ts`
  (`notFound`, `conflict`, `validationFailed`, `forbidden`, …); never build an
  error `Response` by hand.
- Read the JSON body with `readJsonBody` (handles 415/400); succeed with
  `jsonResponse` / `noContent`.

## Adding functionality — the procedure

1. **Plan first.** Write a short plan (tradeoffs → chosen approach → minimal edit
   list → self-review). Get it approved before building. Keep deliverables small.
2. Build the slice **bottom-up**: `domain → data → use-cases → contracts → api →
client → ui`, mirroring `features/notes`.
3. For each endpoint follow the **"Adding an endpoint" checklist in
   [docs/rest-api.md](docs/rest-api.md)** (contract → use case → handler → spec
   fragment → mount in `app/api/v1/**/route.ts` as a re-export →
   `npm run openapi:generate`).
4. Co-locate tests: unit-test `domain` heavily; give use cases a focused test with
   the repository mocked; thin handlers get a smoke test.
5. **Verify locally**: `npm run lint`, `npm run typecheck`, `npm test`,
   `npm run build`.

## Conventions

- **No forward-wrapper abstractions.** Inline the real rule; don't extract
  rename-forward aliases or one-consumer generics.
- **Comments are terse and explain _why_,** matching surrounding density.
- **UI:** plain CSS. Design tokens and one class per primitive live in
  `app/globals.css`; `shared/ui/*` are the typed wrappers. There is no CSS
  framework and no component library — see [docs/ui-kit.md](docs/ui-kit.md).
- **User-facing copy is English.**
- **Soft delete over hard delete.** Rows carry an `archivedAt`-style timestamp
  and reads filter on it, so an id in an old URL or a log still resolves.
- **Schema changes:** edit `prisma/models/*.prisma`, then generate a migration
  against a local Postgres in the same change.

## Not included on purpose

This is a starter, so several concerns a real app needs are absent rather than
half-built. Each one has a documented seam:

- **Authentication and authorization.** `shared/api/guards.ts` holds only the
  same-origin (CSRF) check and documents where session/role guards go. Page-level
  guards belong in `app/(app)/layout.tsx`.
- **Multi-tenancy.** There is no tenant resolution or per-tenant query scoping.
- **Internationalization.** Copy is inline English. Adding i18n means a message
  catalog and a locale resolved per request.
- **Auditing, email, and background jobs.** None are wired up. File storage
  is an S3 bucket created by `bootstrap-root-project` and linked from
  `sst.config.ts`. Deployment is SST on AWS; secrets come from `bootstrap-vault`.

Delete this section once the project it seeded has grown its own answers.

## Running locally

See [README.md](README.md) for commands, environment variables, and the database
setup.
