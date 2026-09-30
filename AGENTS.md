<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# GTD Workbench — project conventions

A responsive Getting-Things-Done web app: rapid log → clarify → lists (next
actions by context, projects, waiting for, someday/maybe, calendar) → weekly
review. Textbook GTD, dense utilitarian UI, keyboard-first on desktop, one-hand
capture on the phone.

## Where the truth lives

- `docs/handoff/SPEC.md` — screens, workflow rules, domain model. Read it before
  any feature work. When code and SPEC disagree, SPEC wins; when SPEC is silent,
  ask before inventing.
- `docs/handoff/design/mockups/*.dc.html` — one static mockup per screen. Match
  structure, spacing and copy; treat them as the visual reference, not as code
  to port.
- `docs/handoff/design/tokens.css` — the only place colors, fonts and radii are
  defined.
- `docs/handoff/data/seed.json` — sample data. Screens render this through the
  store, never their own literals.

## Stack

Next.js (app router, `src/`), TypeScript strict, Tailwind v4 with the tokens
mapped in an `@theme inline` block in `src/app/globals.css` (no
`tailwind.config.ts`), no component library. State in a single store module
(`src/lib/store/`) behind a small typed API (`src/lib/api.ts`); UI never touches
storage. `STORE=memory|sqlite` picks the store (sqlite in production, memory in
dev and tests; `STORE=sqlite pnpm dev` for the real thing, `pnpm db:reset` to
start over). In memory mode a dev-server restart resets everything to the
seed — that is expected, not data loss. Writes go through server actions in
`src/lib/actions.ts` only; server components read the api directly. Server
components by default; client components only where there is interaction.

## Layout of `src/`

```
app/                 routes: /inbox /clarify /next /projects /waiting /calendar /review
components/shell/    Sidebar, TopBar (with capture field), PhoneTabBar, Page
components/ui/       primitives: Card, SectionHead, Row (grid row), Tag, Chip, Kbd, Btn, Field
components/<screen>/ screen-specific pieces
lib/model.ts         types (Item, Project, Context, WaitingFor, ReviewRun …) — see SPEC §5
lib/api.ts           typed operations: capture, clarify, complete, star, promote/demote …
lib/store/           index.ts picks memory.ts or sqlite.ts (same interface), schema.ts
lib/capture-syntax.ts  parser for `#tag @context !prio ^date`
```

## Rules that shape the code

- **One control per decision.** A state is _set_ on exactly one screen and only
  _shown_ elsewhere (as a label that links to where it is set). Focus star: Next
  Actions only. Next/later: Projects only. Done: Next Actions and Calendar only.
  See SPEC §4.
- **Capture never asks questions.** The rapid log accepts a line and returns;
  parsing of shorthand is best-effort and never blocks.
- **Calendar is the hard landscape.** Only the five item kinds in SPEC §3.6
  appear there.
- **Every active project has a next action** or is flagged stalled (orange).
  Enforce in the store, surface in the UI, never auto-fix.
- Priorities are `A|B|C` + running number within priority; contexts are `@name`
  strings; energy `focus|normal|low`; time buckets `15|30|60|120+` minutes.
- Time comes from `api.now()` / `api.today()` only, never `new Date()`. Outside
  production they run on the seed's pinned date; removing that pin is one line.
- Dates are ISO strings in the store; display formats follow the mockups
  (`sat 26.09`, `03.10`).
- Accessibility as drawn: real `<button>`, `<a>`, `<input>`+`<label>`; icon-only
  buttons get `aria-label`; text contrast ≥ 4.5:1 (the token palette already
  satisfies this).
- No emoji in UI; inline stroke SVG icons only (the set used in the mockups'
  phone tab bar).
- Keyboard map on desktop follows the `KEYS` boxes in the mockups; document new
  keys in SPEC §6.

## Published files — do not touch unasked

- `docs/report/report.html` is published as a GitHub Page and shared with an
  audience. Do not delete, move, rename, re-render or overwrite it unless the
  user asks for exactly that. The same goes for what it was rendered from
  (`docs/report/report.qmd`, `docs/report/images/`): editing them is fine only
  when asked, and never re-render the HTML as a side effect. Lint, clean-up or
  `.gitignore` changes must leave these files as they are.

## Working style

- Small PR-sized steps; each prompt in `docs/handoff/prompts/` is one step with
  a definition of done. Run `pnpm lint && pnpm typecheck && pnpm build` before
  declaring a step done.
- Prefer editing an existing primitive over adding a variant prop nobody asked
  for.
- When a mockup and SPEC conflict, or something is not covered, stop and ask in
  one sentence with a proposed default.
- Language of UI copy: English. Dates in Swiss format (dd.mm), no ß anywhere.
