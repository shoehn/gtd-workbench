# 13 · ⌘K command palette

Reference: SPEC §6 (⌘K is reserved there), the KEYS boxes in the mockups, the capture
syntax from step 01. The palette is a keyboard front door, not a second UI: every
command it offers must already exist as an api call or a route.

## Do

1. **Open** with ⌘K / Ctrl-K anywhere on desktop (and from a "⌘K" mono button in the
   phone header). One input, results below, Esc closes, ↑↓ move, ⏎ runs. Render it with
   the primitives (Card + Row), no library. Fuzzy match with a small scorer in
   `lib/fuzzy.ts` (prefix > word-start > substring; no dependency).
2. **Modes by first character** — the input's leading token decides what the list is:
   - plain text → **search**: items across all lists (status ≠ trash) and projects,
     grouped by list with the list's tag; ⏎ opens the row on its screen (Next with
     `highlight`, Projects with `p`, Waiting, Someday, Calendar with the week).
   - `>` → **commands**: go to each screen, "Clarify inbox", "Start weekly review",
     "Sync calendars", "Toggle dark theme" (after 15), "Settings"; plus, when opened
     from a row that has a cursor (Next Actions, Projects, Waiting), the row's own
     actions: done, focus, later/next, follow up, received, change context, move to
     project.
   - `+` → **capture**: the rest of the line goes through `api.capture` with the same
     shorthand as the rapid log; the result line reads back what was parsed
     ("→ inbox · @calls · B · fri 02.10") before ⏎ confirms.
   - `@` → **jump to context**: lists contexts with their open counts, ⏎ opens
     `/next?ctx=…`.
   - `#` → **projects**: ⏎ opens the project.
   Show the five modes as a mono hint line when the input is empty.
3. **Recent** (last 8 selections, in memory only) at the top when the input is empty.
4. **Accessibility**: `role="dialog"` with a label, `aria-activedescendant` on the list,
   focus returns to the previously focused element on close.
5. **Keys**: add ⌘K and the mode prefixes to SPEC §6; remove the "later" note on ⌘K.

## Don't

- No command that isn't already an api call. No settings inside the palette. No
  natural-language parsing beyond the capture shorthand.

## Definition of done

- From any screen: ⌘K, type "shop", ⏎ → lands on the Waiting-for row for the furniture shop; ⌘K,
  "+ Call plumber @calls", ⏎ → item captured with @calls; ⌘K, "> start", ⏎ → review
  started; all without the mouse.
- With the cursor on a Next Actions row, ⌘K "> later" demotes that row.
- Palette renders in ≤ 1 frame on the seed data (no async on open; search is local).
