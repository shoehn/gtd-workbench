# 05 · Waiting For and Someday/Maybe

Reference: `docs/handoff/design/mockups/Waiting.dc.html`; SPEC §3.5.

## Do

1. **Layout**: two equal `Card`s side by side, each with its own scroll. Route `/waiting`
   (`?tab=someday` is used by the phone layout in 08 and by the sidebar's Someday entry
   to scroll/focus the right pane on desktop).
2. **Waiting For** — header "Waiting For · 7 · 1 overdue", "Sort: follow-up ▾" (options:
   follow-up, since, who). Column header WHAT · FROM WHOM / PROJECT / SINCE / FOLLOW UP,
   rows (`1fr 90px 60px 76px`): text + who (12 px muted), project link (or —), since as
   "n d", follow-up as `ddd dd.mm` / `dd.mm` / "no date"; overdue rows get the warn tint
   and "overdue n d" in warn. Footer keys: "f follow up → creates @calls / @computer
   action · x received".
   - `api.followUp(id)`: creates a next action "Follow up with <who>: <text>" in @calls
     (or @computer if `who` looks like a mailbox/system — keep it simple: contains "desk",
     "support", "committee" → @computer), priority B, 15 min, low energy, linked to the
     same project; moves the follow-up date to +7 d.
     `api.received(id)`: status → done; if the project now has no next action, prompt
     inline "Next action for <project>?" with the step-4 fields (skip allowed).
3. **Someday / Maybe** — header "Someday / Maybe · 31 · reviewed weekly, activated rarely",
   "Group: bucket ▾" (bucket | age | none). Sections per bucket with tracked mono title
   and count; rows: text + Activate + × Drop. Footer: "Activate → becomes a project or a
   next action, via Clarify" and "n more".
   - `api.activate(id)`: status → inbox (keeps text and captured), then navigate to
     `/clarify?item=<id>`. `api.drop(id)`: status → trash with the 5 s undo toast.
   - Bucket editing: a row's bucket is changeable via a small select shown on hover/focus.
4. **Keys**: `j/k` move within the focused pane, `Tab` switches panes, `f` follow up,
   `x` received / activate (pane-dependent), `⌫` drop.

## Definition of done

- Seed renders as the mockup: 7 waiting rows with w1 overdue-tinted, 3 bucket sections.
- `f` on w1 creates the @calls action visible in `/next` and moves w1's follow-up a week.
- Activate on s1 lands in Clarify with the text prefilled; Drop + undo restores the row.
