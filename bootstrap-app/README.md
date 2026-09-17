# bootstrap-app

A minimal, working Next.js starter whose point is its **shape**: a feature-first
layered architecture with the layer boundaries enforced by ESLint, a REST-only
mutation surface described by a generated OpenAPI document, and a plain-CSS UI
kit. One example feature (`features/notes`) is built all the way through so every
layer has a reference implementation.

Infrastructure lives in the sibling `bootstrap-root-project` and `bootstrap-vault`
repos. This app reads `/bootstrap/<stage>/root` at deploy time.

Create a new project with **bootstrap-init** rather than renaming this repo by
hand — the wizard copies the three templates, rewrites identity tokens, and
writes the generated config region.

Built with:

- Next.js 16 (App Router, Turbopack) + React 19 + TypeScript (strict)
- Prisma 7 + PostgreSQL
- SST 4 on AWS
- zod 4 for contracts and OpenAPI generation
- ESLint (incl. `eslint-plugin-boundaries`) + Prettier + Jest
- Plain CSS — no Tailwind, no component library

Read [AGENTS.md](AGENTS.md) for the architecture rules and
[docs/architecture.md](docs/architecture.md) for the tour.

## Getting started (local, no AWS)

```bash
cp .env.example .env      # then point DATABASE_URL at your Postgres
npm install               # runs `prisma generate` via postinstall
npx prisma migrate deploy # apply prisma/migrations to the database
npm run seed              # optional: two example notes
npm run dev               # http://localhost:3000
```

Need a database? Any Postgres 14+ will do, for example:

```bash
bash scripts/start-local-database.sh
```

## Getting started (SST)

Deploy order for a new stage: vault, then root project, then this app.

```bash
cp .env.example .env
npm install
npx sst dev                 # starts local Postgres unless USE_REMOTE_DB=true
npx sst deploy --stage dev
```

Remote databases need the RDS CA bundle:

```bash
bash scripts/fetch-rds-ca.sh
```

## Commands

| Command                    | What it does                                       |
| -------------------------- | -------------------------------------------------- |
| `npm run dev`              | Development server (Turbopack)                     |
| `npx sst dev`              | SST-linked local dev (injects DATABASE_URL)        |
| `npm run build`            | Production build                                   |
| `npm start`                | Serve the production build                         |
| `npm run lint`             | ESLint, including the architecture boundary rules  |
| `npm run typecheck`        | `tsc --noEmit`                                     |
| `npm test`                 | Jest                                               |
| `npm run format`           | Prettier (writes)                                  |
| `npm run openapi:generate` | Rewrite `docs/openapi.json` from the zod contracts |
| `npm run seed`             | Insert the example notes (idempotent)              |

Database work goes through the Prisma CLI rather than npm scripts:

- `npx prisma migrate dev --name <change>` — create and apply a migration
- `npx prisma migrate deploy` — apply existing migrations
- `npx prisma migrate reset --force` — drop, re-apply, and re-run the seed
- `npx prisma studio` — browse the data

`@bootstrap/database` is marked `server-only`, which throws outside a React
Server Component unless the resolver applies the `react-server` condition. That
is why `npm run seed` passes `tsx --conditions=react-server`; running
`npx tsx scripts/seed.ts` directly fails.

## Project structure

```
app/                  routes only — render a feature ui/, or re-export a feature api/ handler
  (app)/              app-shell route group (paths stay at /notes)
  api/v1/             REST namespace; each route.ts is a one-line re-export
  globals.css         design tokens + one class per shared/ui primitive
features/notes/       the example vertical slice — read this first
shared/               cross-cutting infrastructure (api, db, pagination, ui, lib)
database/             npm workspace: Prisma client + pool (@bootstrap/database)
prisma/               multi-file schema (models/*.prisma) and migrations
docs/                 architecture, REST contract, UI kit, generated openapi.json
scripts/              one-off Node scripts (seed, openapi generation, local db)
sst.config.ts         Next.js + database + bucket, reads the root SSM contract
```

## Environment

| Variable              | Required | Purpose                                             |
| --------------------- | -------- | --------------------------------------------------- |
| `DATABASE_URL`        | yes*     | PostgreSQL connection string (`sst dev` injects it) |
| `NEXT_PUBLIC_APP_URL` | no       | Server URL advertised by `GET /api/v1/openapi.json` |
| `ROOT_DOMAIN`         | deploy   | Falls back to vault SSM                             |
| `USE_REMOTE_DB`       | no       | `sst dev` against the shared Aurora/RDS             |
