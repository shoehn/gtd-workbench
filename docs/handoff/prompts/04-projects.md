# 04 · Projects: list, detail, next ↔ later

Reference: `docs/handoff/design/mockups/Projects.dc.html`; SPEC §3.4 and §4.
This is a planning view: **no done checkboxes, no focus stars**.

## Do

1. **Layout** `420px | 1fr`: project list on the left (white, full height, own scroll),
   detail on the right on the ground color. Route `/projects?p=<id>`; without `p`, the
   first project. Filter chips active / work / home / stalled (URL param); "completed n"
   ghost button at the right shows completed projects instead.
2. **List row** (`10px 1fr 40px 56px`): state dot (ok = has next action, warn = stalled),
   title (600 when selected) with a second line "→ first next action" or, when stalled,
   the warn line "No next action — <reason>" where reason is "waiting on <who> only" if
   the project has waiting-for items, else "define one in review"; NA count (warn when 0);
   last reviewed as "n d ago" (warn when > 14 d). Selected row has the accent tint.
   Footer: "n more · ● has next action · ● stalled".
3. **Detail header**: tracked mono line "AREA · CREATED ddd dd.mm · FROM INBOX", buttons
   Complete / → Someday / ⋯ on the right; h2 title (editable on click); two-row grid
   "successful when" and "deadline".
4. **Next actions card**: header "Next actions · n open · m done · complete them from the
   lists", "+ action" on the right (opens an inline row: text + the Clarify step-4
   fields, files as a next action of this project). Rows (`36px 1fr 84px 44px 44px 64px`):
   `PrioChip`, text as a link to `/next?highlight=<id>`, context, time, a read-only
   "today" tag when the item is focused today, and `↓ later` (`api.demote(id)` → status
   later, clears context/priority/time/energy/focus). Demoting the last next action turns
   the list dot orange immediately.
5. **Later steps card**: header with the hint "not on any list yet — promote with ↑ next,
   or drag above the line" and "+ step"; rows: text + `↑ next` (`api.promote(id)` opens
   the step-4 fields inline — context/priority/time/energy — and files on Enter). Done
   steps of this project are listed struck through with "done · @context" at the end.
   Drag-and-drop between the two cards is optional; if you add it, use native HTML5 DnD,
   no library.
6. **Three-up row** under it: Waiting for (items of this project with status waiting,
   "since … · follow up …", link "All waiting-for →"), Reference (placeholder list of
   attachments — render `project.references` if present, else "no files yet"), Horizon
   (area / goal, editable).
7. **Support notes**: textarea bound to `project.notes`, autosaves on blur; header right
   shows "last reviewed n d ago".
8. **`api`**: `demote`, `promote`, `addAction`, `addStep`, `completeProject`,
   `moveProjectToSomeday`, `updateProject`. `projectStalled(p)` is the single source of
   the stalled rule (active && no next actions; waiting-for does not count) — reuse the
   one from 00, do not reimplement.

## Definition of done

- Seed renders as the mockup with p-bench selected: 2 next actions (A1 with "today",
  B4), 3 later steps + 1 done, one waiting-for, horizon filled.
- `↓ later` on B4 then on A1 turns p-bench stalled in the list, in Next Actions' Health
  box, and in the sidebar count of stalled projects (if you show one).
- `↑ next` on "Place the order…" asks for context/priority/time inline and the item then
  appears in `/next` under that context.
