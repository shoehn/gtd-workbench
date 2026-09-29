# 00 · Scaffold: tokens, shell, primitives, store

Read `AGENTS.md`, `docs/handoff/SPEC.md` (sections 2, 5, 7) and `docs/handoff/design/tokens.css`
first. Open `docs/handoff/design/mockups/Main.dc.html` and `M-Inbox.dc.html` as the visual
reference for the shell.

This is a fresh `create-next-app` (app router, TypeScript, Tailwind, `src/`). Set up the
foundation every later screen builds on. No screen content yet beyond placeholders.

## Do

1. **Tokens.** Put `tokens.css` into `src/styles/tokens.css`, import it in `app/layout.tsx`,
   and map every token in an `@theme inline` block in `src/app/globals.css` (Tailwind v4,
   no `tailwind.config.ts`) exactly as the comment block at the end of the file describes;
   drop the create-next-app demo variables. Load IBM Plex Sans (400/500/600) and IBM Plex Mono (400/500) with
   `next/font/google` and expose them through the `--wb-font-*` variables. `body` gets
   `bg-ground text-ink font-sans text-body antialiased`.
2. **Model and store.** `src/lib/model.ts` with the types from SPEC §5 verbatim.
   `src/lib/store/memory.ts` loads `docs/handoff/data/seed.json` into memory (copy it to
   `src/lib/store/seed.json`), keeps a single mutable state, and exposes an interface
   `Store` with `getState()`, `update(fn)` and `subscribe()`. `src/lib/api.ts` is the only
   module the UI imports: start with read helpers (`listInbox`, `listNext`, `listProjects`,
   `projectStalled`, `today`) — write operations come with the screens. Derived values
   (stalled, age, counts) are computed in `api.ts`, never stored.
3. **Shell.** `components/shell/Sidebar.tsx` (224 px, groups COLLECT / DO / HORIZONS, live
   counts from the api, Weekly Review pinned at the bottom with "due" / "in progress"),
   `TopBar.tsx` (48 px, h1 slot, meta slot, right slot; default right slot is the
   "Capture to inbox" field which calls `api.capture`), `PhoneTabBar.tsx` (5 tabs with the
   inline SVG icons from the mockups), and `Page.tsx` that composes them: sidebar + top bar
   on ≥ 1024 px, tab bar below that. Active nav item as in the mockup (white bg, weight 600).
4. **Primitives** in `components/ui/`, each ≤ 40 lines, styled only with token classes:
   `Card` (white panel, line border, radius), `SectionHead` (10 px tracked mono label),
   `Row` (CSS grid row with `cols` prop as a template string, padding 8/12, soft divider),
   `Tag` (mono 11 px; variants `muted | warn | ok | accent`), `PrioChip` (A = warn bg white
   text, B = muted-bg, C = outline), `ContextChip` (mono 12 px pill, pressed state),
   `Kbd` (mono 11 px muted), `Btn` (variants `primary | ghost | outline`, sizes 26/30/44 px),
   `Field` (input with label, 30 px desktop / 44 px phone), `Meta` (mono 11 px muted span).
5. **Routes.** Create `/inbox /clarify /next /projects /waiting /calendar /review`, each
   rendering `Page` with the right title and a one-line placeholder. `/` redirects to
   `/inbox`.
6. **Scripts.** `pnpm typecheck` (`tsc --noEmit`), `pnpm lint`, `pnpm build` all green.

## Don't

- No component library, no icon package, no state library. No dark-mode toggle.
- No screen-specific markup yet; the shell must look right with empty pages.

## Definition of done

- `/inbox` at 1280 px shows sidebar with correct counts (14 inbox, 23 next, 3 calendar,
  7 waiting, 11 projects, 31 someday) from the seed, top bar with the capture field, and
  at 390 px shows the tab bar instead.
- Typing into the capture field and pressing Enter adds an item to the store (visible as
  the inbox count incrementing) and clears the field. Nothing else happens.
- All primitives have a Storybook-free demo route `/dev/ui` that renders each variant once
  (delete later).
- `pnpm lint && pnpm typecheck && pnpm build` pass.
