# UI kit

Plain CSS. No Tailwind, no shadcn, no component library, no CSS-in-JS — the only
styling dependency is the one Next.js already has.

Two pieces:

- **`app/globals.css`** — design tokens as CSS custom properties, a small reset,
  and one class per primitive (`.ui-button`, `.ui-table`, …).
- **`shared/ui/*.tsx`** — a typed React wrapper per primitive. Feature code
  composes these and never writes raw `ui-*` class names.

The split means a visual change is a CSS edit, and an API change is a TypeScript
edit, and the two rarely happen together.

## Tokens

Everything visual comes from custom properties on `:root`, so restyling the app is
a matter of changing that block:

| Group   | Properties                                                                                                                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colour  | `--color-canvas`, `--color-surface`, `--color-border`, `--color-border-strong`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-accent-hover`, `--color-accent-soft`, `--color-danger`, `--color-danger-soft`, `--color-success`, `--color-success-soft` |
| Shape   | `--radius-sm`, `--radius-md`, `--radius-lg`                                                                                                                                                                                                                               |
| Depth   | `--shadow-sm`, `--shadow-md`                                                                                                                                                                                                                                              |
| Spacing | `--space-1` … `--space-7` (4px → 48px)                                                                                                                                                                                                                                    |
| Type    | `--font-sans`, `--font-mono` (system stacks — no webfont request)                                                                                                                                                                                                         |

Use tokens, not literals. A hard-coded `#2f5bd7` or `12px` in a component class is
the thing that makes a later restyle a hunt.

## Primitives

| Wrapper                          | Class                                     | Notes                                                         |
| -------------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| `AppShell`                       | `.ui-shell*`                              | Top bar + centred main column; takes the nav items            |
| `AppNav`                         | `.ui-shell__nav*`                         | The shell's nav; a client leaf so it can read the active path |
| `PageHeader`                     | `.ui-page-header*`                        | Eyebrow, title, description, optional action                  |
| `Card`, `CardHeader`, `CardBody` | `.ui-card*`                               | The default container                                         |
| `Button`                         | `.ui-button*`                             | `primary` / `secondary` / `ghost` / `danger`, `sm` / `md`     |
| `Input`, `Textarea`, `Select`    | `.ui-input`, `.ui-textarea`, `.ui-select` | Set `aria-invalid` to show the error state                    |
| `Field`                          | `.ui-field*`                              | Label + control + hint/error for one input                    |
| `Table` and friends              | `.ui-table*`                              | `TableCell` takes `as="th"` and `actions`                     |
| `Badge`                          | `.ui-badge*`                              | `neutral` / `accent` / `success`                              |
| `Alert`                          | `.ui-alert*`                              | Form-level feedback; `danger` / `success`                     |
| `EmptyState`                     | `.ui-empty*`                              | The zero-row case of a list                                   |

Four helpers exist and are deliberately the only ones: `.ui-page` (the centred
content column), `.ui-stack` (vertical rhythm), `.ui-row` (inline group), and
`.ui-muted` (secondary text). Layout beyond that belongs to the component that
needs it — this is not a utility-class framework, and growing one here defeats the
point.

`buttonClass()` is exported separately from `Button` for the case where the
element must be a `next/link` rather than a `<button>`.

## Adding a primitive

1. Add the class (or classes) to the right section of `app/globals.css`, built
   from tokens.
2. Add the typed wrapper in `shared/ui/`. Spread the native props
   (`React.ComponentPropsWithoutRef<"…">`) and merge `className` with `cx()` so
   callers can extend without forking.
3. Add the row to the table above.

## Where components live

- **`shared/ui/`** — anything generic: a button, an input, a table. If a second
  feature could use it, it goes here.
- **`features/<feature>/ui/`** — composition specific to that feature:
  `notes-table.tsx` knows about note columns, `create-note-form.tsx` knows about
  the note contract. Neither is reusable, and neither belongs in `shared/`.

Before adding a component to a feature, check `shared/ui/` and reuse or extend it
there instead. A second slightly-different button in a feature folder is how UI
kits die.

## Form conventions

`create-note-form.tsx` is the reference. It validates with the same
`contracts.ts` schema the route handler uses, so an obvious mistake never leaves
the browser, and it maps the problem document's `errors` back onto the fields when
the server rejects anyway — one error display path for both.

- Per-field messages go on `Field`; form-level ones go in an `Alert`.
- Mark rejected inputs with `aria-invalid` so the error styling and assistive
  technology agree.
- After a successful mutation, `router.refresh()` and let the server component
  re-read. Do not keep a second copy of the list in component state.
