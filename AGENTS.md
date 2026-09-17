# AGENTS.md

`bootstrap-init` generates three SST repositories from the templates in this
directory. The templates are real projects, not string-soup.

## Priorities

- **Templates stay runnable.** `bootstrap-app`, `bootstrap-root-project` and
  `bootstrap-vault` must typecheck and (for the app) lint, test and build with
  the `bootstrap` identity. Do not introduce a template language.
- **Identity vs data.** Rename with ordered token replacement
  (`bootstrap-app` before `bootstrap`). Everything that is not a name —
  stages, ACUs, proxy, bastion, buckets, region — is written into the
  `bootstrap-init:generated` region of each `sst.config.ts`.
- **SST forbids top-level imports in `sst.config.ts`.** Do not extract the
  generated constants into a sibling module. Keep them in the delimited region.
- **Cost is a first-class prompt.** Every advanced question that changes spend
  should show an estimated monthly delta. Estimates come from `scripts/cost.ts`
  and a static price table; label them as estimates.
- **No product-specific third-party secrets** in the templates. The vault ships
  `ROOT_DOMAIN` plus one example secret.

## Layout

```
scripts/init.ts          CLI entry
scripts/answers.ts       zod schema, quick preset
scripts/plan.ts          answers → resolved names and per-stage config
scripts/cost.ts          monthly estimate
scripts/prompts/         interactive flow
scripts/generate/        copy, replace, emit, workflows, git
bootstrap-*/             templates
```

## Verification

Unit tests cover `plan.ts`, token replacement order, and `cost.ts`. The e2e
test generates into a temp directory and runs lint, typecheck, test and build
on the generated app.
