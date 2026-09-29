# 02 · Clarify: the four steps

Reference: `docs/handoff/design/mockups/Clarify.dc.html`; SPEC §3.2 and §4. This is the
screen with the most rules — read §3.2 twice. The mockup shows the "actionable → new
project → next action → defer" branch; you build all branches.

## Do

1. **Route** `/clarify?item=<id>`; without `item`, the oldest inbox item. Top bar: "← Inbox",
   h1 "Clarify", meta "item n of N", a 14-segment progress strip (one segment per inbox
   item, filled up to the current one), "Skip s" on the right.
2. **Layout**: main column (item card + the four steps in one `Card`, then the action bar)
   and a 360 px right rail (Similar already on your lists · Result of this clarify · Keys).
   All four steps are always visible; steps that don't apply are rendered dimmed
   (`opacity-40`, controls disabled), never hidden. No wizard.
3. **Step 1 — Is it actionable?** Four `Btn`s: Yes (primary when pressed) / No → Trash /
   No → Someday-Maybe / No → Reference. A "No" dims steps 2–4 and changes the action bar
   to "Trash / Move to Someday / File as reference" + next.
4. **Step 2 — What is it?** Label *outcome*, field prefilled with `item.captured`. Hint
   line under the title: "Prefilled with your capture. Rewrite only if the words don't say
   what it really is." When the field differs from `captured`, the mono status line
   `edited — original kept on the item: "<captured>"` appears; otherwise the line is empty
   (same height, no layout jump).
5. **Step 3 — Project.** Hint "Leave empty for a single action." A picker field: typing
   filters projects by title (case-insensitive substring, active projects first); the
   first result is `+ New project: <typed text, capitalised>` unless that title already
   exists (then the existing project leads, no "+ New"); each result shows a
   state tag on the right (`no next action` in warn, or `n actions`). Enter picks the
   highlighted result, Esc clears. Under it the checkbox **Make this the project's next
   action** with a mono note: for a new project "new project, no next action yet"; for an
   existing one "project has n next actions — this adds another" or "no next
   action — this becomes it". Default: on only when the chosen project has no next
   action. Ticking never demotes anything. Unticked ⇒ the item will be a *later step* and
   step 4 dims.
6. **Step 4 — Do, delegate or defer?** Buttons Do it now (< 2 min) / Delegate → Waiting
   For / Defer → Next Actions / Defer → Calendar, one pressed at a time.
   - Next Actions: Context select, Priority (A/B/C with the running number computed on
     commit), Time (15/30/1h/2h+), Energy; Deadline field (ISO, optional) with the hint
     "Hard deadline only. Wishes go on the action, not the calendar."
   - Calendar: Day (required), Time from–to (optional). No context/priority.
   - Delegate: "Waiting for whom" (required), follow-up date (optional).
   - Do it now: nothing more; committing marks the item done with `doneAt = now`.
   Hint under the title: "Only for a next action or a single action. Later steps skip this."
7. **Action bar**: primary "File it and next ⏎", ghost "Trash ⌫", and on the right the
   mono summary "will create: 1 project · 1 next action @computer · A · 30 min" computed
   live from the form state.
8. **`api.clarify(itemId, decision)`** — one function, one `Decision` union type covering
   every branch. It mutates atomically: creates the project if new, sets status/context/…
   on the item, never demotes anything, refuses a new project whose title already exists,
   and returns the ids touched. Unit-test each branch (vitest): not actionable ×3, single
   action ×4 destinations, new project + next, existing project + later, next action added
   beside existing ones, duplicate title refused.
9. **Right rail**: "Similar already on your lists" = up to 3 items/projects sharing ≥ 2
   significant words with the item text; "Result of this clarify" mirrors the summary
   as a small table (project / next / list / deadline); Keys box from the mockup.
10. **Keys** (focus outside inputs): `y t m r` step 1; `p` focuses the project picker;
    `a` toggles the next-action checkbox; `2 w n k` step 4; `⏎` file and next; `s` skip;
    `⌫` trash. Tab order follows the visual order.

## Definition of done

- Walking the seed item i4 into the existing project "Home maintenance 2026" with the
  next-action box unticked makes it a later step of that project (status later, no
  step 4), leaves the project's next action n9 untouched, and drops the inbox count by
  one. (The mockup's i3 branch is already in the seed as p-bench / n1.)
- An item captured with `^date` opens with Defer → Calendar preselected on that day.
- Each of the other branches is reachable with the keyboard alone and leaves the store
  consistent (tests prove it).
- The page at 1280×860 matches the mockup's structure; dimmed steps keep their height.
