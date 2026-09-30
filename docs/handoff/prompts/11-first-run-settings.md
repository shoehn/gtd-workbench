# 11 · First run and settings: base seed, contexts, buckets, review template

Reference: SPEC §3.1, §3.5, §3.7, §5; the store from step 09. No mockup exists for this
screen — build it from the primitives in the same density as `Waiting.dc.html`, and keep
it small: it is a settings page, not a feature.

## Do

1. **Seed split.** `seed.base.json` = contexts, buckets, review template, external
   calendar names (empty list by default). `seed.demo.json` = everything else. Memory
   mode, `db:seed` and `db:reset` load both; an empty SQLite database in any mode loads
   base only. `docs/handoff/data/seed.json` is replaced by the two files; update
   CLAUDE.md and README.
2. **Settings model**: `Settings { contexts: string[]; buckets: string[];
   reviewTemplate: ReviewTemplate; weekStart: 'mon'; timezone: string }` stored as one
   row (JSON column is fine). `api.getSettings()`, `api.updateSettings(patch)`.
   Contexts and buckets stop being loose strings: the api validates that an item's
   context exists; renaming a context renames it on every item in one transaction;
   deleting one is refused while items use it ("n actions use @office — move them first",
   with a link to `/next?ctx=@office`). Same rules for buckets.
3. **Route `/settings`** (sidebar entry at the very bottom, under Weekly Review, as a
   small mono "settings" link): three `Card`s in one column, each with an inline
   editable list — Contexts (order = display order in Next Actions; drag or ↑↓ buttons),
   Buckets, Calendars (name + read-only tag; the CalDAV fields come in 12). No save
   button: each row commits on blur/Enter, with the 5 s undo pattern.
4. **Review template editor** as the fourth card: phases fixed in number and name (per
   SPEC §3.7), steps editable per phase: text, optional link (a select of the app's
   routes), reorder, add, remove; "Reset to GTD default" restores `seed.base.json`'s
   template. Editing the template never touches existing `ReviewRun`s (they keep
   their step ids and texts; store the text on the run at start if you don't already).
5. **First run**: when the database was created at this boot (base seed applied), the
   Inbox shows a one-time empty state card above the list — "New here. Capture the first
   thing on your mind; the lists fill themselves. Contexts and the review checklist are
   in settings." — dismissed by the first capture. No wizard, no tour.
6. **Timezone**: `Settings.timezone` replaces the `TZ` env default from step 10 when
   set; every "today", "midnight", "overdue" computation goes through one
   `lib/clock.ts` that reads it (it exists as `api.now()` from step 01 — extend it,
   don't add a second one).

## Definition of done

- Fresh database: sidebar shows zeros, `/settings` shows the six default contexts, three
  buckets, the 12-step template, no calendars.
- Rename `@calls` → `@phone`: every affected item shows `@phone`, Clarify's select offers
  it, tests prove the transaction. Deleting `@computer` while in use is refused with the
  count and link.
- Editing a template step, starting a review, then editing it again: the running review
  is unchanged; the next one uses the new text.
