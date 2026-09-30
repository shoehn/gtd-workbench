# 01 · Inbox: rapid log and unprocessed items

Reference: `docs/handoff/design/mockups/Main.dc.html`; SPEC §3.1. Build on the shell from 00.

## Do

1. **Capture syntax parser** `src/lib/capture-syntax.ts`: `parse(line, today) → { text,
   tags, context?, priority?, date? }` for `#tag`, `@context` (must be in the known
   contexts list, else left in text), `!A|!B|!C`, `^dd.mm | ^ddd (mon…sun, next occurrence)
   | ^tomorrow | ^today`. Unparseable tokens stay in `text`. Unit tests with vitest for
   ten representative lines, including "no shorthand at all" and a `#` inside a word.
2. **`api.capture(line, source='typed')`** parses, creates an `Item` with `status:'inbox'`,
   `captured` = the raw line, `text` = parsed text, and returns it. Never throws on input.
3. **Rapid log section** exactly as the mockup: tracked label, 44 px field with the `›`
   glyph and the accent ring, hint on the right (`#tag @context !prio ^date`), the one
   line "capture never asks questions" under it. Enter captures and refocuses the field;
   the new item appears at the top of the list without a reload.
4. **Inbox list** as a `Card` with a header row (ITEM · SOURCE · CAPTURED · AGE) and one
   `Row` per item: select checkbox, text, source (mono), captured as `ddd HH:MM`, age as
   `2 h | 1 d`; age ≥ 3 d in warn color. Selected row gets the accent tint.
   Footer strip: "n selected", key hints, "n more below" when the list overflows
   (list scrolls inside the card, header and footer stay).
5. **Top bar** for this screen: h1 "Inbox", meta "14 open · oldest 3 d", primary button
   "Clarify inbox c" linking to `/clarify`, ghost "Sort ▾" (no menu yet). No capture field
   in the top bar on this screen (the rapid log is the capture field).
6. **Keys** (desktop, when focus is not in an input): `j/k` move selection, `x` toggle
   select, `c` go to `/clarify?item=<selected>`, `⌫` trash selected (status→trash, with
   a 5 s undo toast in the footer strip). `/` or `›` focuses the rapid log.
7. Empty state: the card shows one centred mono line "Inbox is empty — nice." and the
   Clarify button is disabled.

## Definition of done

- Seed renders identical in structure to the mockup at 1280×860 (compare side by side).
- Capture of `Call the shop @calls !B ^fri` creates an item whose text is "Call the shop" and
  whose parsed context/priority/date are stored on the item and shown as small chips at
  the end of the row.
- Keyboard flow j → x → ⌫ → undo works without touching the mouse.
- Tests green; lint/typecheck/build green.
