# 03 · Next Actions: contexts, filters, focus, Today

Reference: `docs/handoff/design/mockups/Next.dc.html`; SPEC §3.3 and §4.

## Do

1. **Filter bar** under the top bar: CONTEXT chips (multi-select, pressed = ink bg), a
   divider, TIME chips (≤15m, ≤1h — a bucket filter means "time ≤ bucket"), ENERGY chips
   (focus, low), "Clear" on the right. Filters live in the URL search params so they are
   shareable and survive reload. Meta in the top bar: "23 · 9 match filter".
2. **Groups** one `Card` per context in the order of the contexts list, header "@context ·
   n · total time", rows: done checkbox · focus star button (`aria-pressed`, filled accent
   when starred, control-grey outline otherwise) · `PrioChip` · text · project link (or
   "— (single action)" in muted) · time · energy · due (warn color when ≤ 7 days).
   Columns: `24px 24px 36px 1fr 220px 52px 60px 76px`. Groups with no matching rows are
   omitted; the footer line says "n hidden by filter · x done · f focus today · e edit ·
   p project · @ change context".
3. **Priority numbering**: `A1, A2…` is the running number within priority across the
   whole list, recomputed by the api on every change (`api.renumber()`); C has no number.
4. **Done** (`api.complete(id)`): row fades and is removed after 400 ms; if it was a
   project's last next action, the project becomes stalled and the Health box updates.
   Undo for 5 s in the footer strip.
5. **Focus star** (`api.toggleFocus(id, today)`): sets/clears `focusOn = today`. Stars
   older than today are ignored by all readers (that is the "clears at midnight" rule —
   implement it in the api, not with a timer).
6. **Right column (300 px)**: *Today* card — hard landscape for today from
   `api.todayLandscape()` (external events + day-specific items + deadlines due today),
   time in mono, "Week →" link to `/calendar`, the sentence "Calendar holds only what must
   happen today. Everything else lives on the lists." · *Focus for today* card — starred
   items as checkboxes (same `complete`), "3 picked · 1 done" · *Health* card — projects
   without next action (link to `/projects?filter=stalled`), waiting-for overdue (link),
   actions older than 30 d.
7. **Inline edit** (`e` or double-click): the text becomes an input in place; `@` opens a
   context select in place; `p` opens the same project picker as Clarify step 3 (extract
   it to `components/ui/ProjectPicker.tsx` if you haven't yet). Esc cancels, Enter saves.
8. **Keys**: `j/k` move the row cursor across groups, `x` done, `f` focus, `e` edit, `p`
   project, `@` context. The cursor row shows the accent tint.

## Definition of done

- Seed renders as the mockup (two groups visible with @computer + @calls + ≤1h filters,
  A1 and A2 starred, Focus card with 3 picked · 1 done, Health 2 / 1 / 4).
- Toggling a star updates the Focus card immediately; completing A1 keeps the project
  green (it still has B4); completing B4 afterwards turns it stalled in Health.
- URL `?ctx=@computer,@calls&time=60` reproduces the mockup's filter state.
