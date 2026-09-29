# 09 · Persistence: SQLite behind the same store interface

Reference: SPEC §5; `src/lib/store/memory.ts` and `src/lib/api.ts` as they exist now.
Nothing in `components/` or `app/` may change in this step except imports.

## Do

1. Pick Drizzle + better-sqlite3 (single file, no daemon, matches a single-user app;
   Prisma is fine if you prefer its migrations — say which and why in the PR
   description). Schema = SPEC §5 one table per interface, `items.tags` and the review
   run's `steps` as JSON columns, everything else typed columns. Indexes on
   `items(status)`, `items(project_id)`, `items(day)`, `items(deadline)`.
2. `src/lib/store/sqlite.ts` implements the same `Store` interface as `memory.ts`.
   `update(fn)` runs in a transaction. `subscribe` is implemented with a simple
   in-process emitter (single user, single process).
3. `src/lib/store/index.ts` selects the store by `STORE=memory|sqlite` (default sqlite in
   production, memory in tests). A `pnpm db:seed` script loads `seed.json`; `pnpm db:reset`
   drops and reseeds.
4. Server actions: every `api.*` write becomes a server action (or stays a direct call
   if the store is already server-only) — make the boundary explicit and consistent, no
   mixed pattern. Reads stay in server components; client components receive data as
   props and call actions.
5. Run the full vitest suite against both stores (parametrised) — the api tests from
   01–07 must pass unchanged.
6. Add a nightly `abandonStaleRuns` and the midnight focus-clear semantics as pure reads
   (already the case), so no cron is needed.

## Definition of done

- `STORE=sqlite pnpm dev` behaves exactly like memory mode; restart keeps the data.
- All tests green in both modes; lint/typecheck/build green.
- `docs/handoff/SPEC.md` §5 updated if any column deviated from the interfaces, with the
  reason.

## After this

The next iterations are yours to order: external calendar source (CalDAV read-only),
email-in, command palette (⌘K), template editor for the review, dark theme switch, and the
Reference screen. Each should get its own prompt in this folder written the same way:
reference, do, don't, definition of done.
