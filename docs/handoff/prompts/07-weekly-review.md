# 07 · Weekly Review: checklist template, timer, measured notes

Reference: `docs/handoff/design/mockups/Review.dc.html`; SPEC §3.7. The review pane is a
checklist with a timer, not a second copy of the app: the work happens on the other
screens; this screen attributes it.

## Do

1. **Template and runs.** `ReviewTemplate` from the seed is the user's template (editable
   later; for now ship the seed as default and a `resetTemplate()`). `api.startReview()`
   creates a `ReviewRun` (one open run at a time), `pauseReview/resumeReview`,
   `tickStep(stepId)`, `untickStep`, `finishReview()`, `abandonStaleRuns()` (called on
   app load: open runs older than 24 h close as `abandoned`). The sidebar's Weekly Review
   entry shows "due" (no run in the last 7 d), "in progress" (open run) or the date of
   the last finished run.
2. **Route** `/review`. Without an open run: a start card ("Last review fri 18.09 · 8 d ago
   · 12 steps · usually ~45 min") with "Start review"; with one: the three-column layout
   from the mockup. Top bar meta "last: … · n of 12 steps done", timer with a warn dot
   when running, Pause/Resume, "Finish review" primary.
3. **Phase columns** Get clear / Get current / Get creative, each a `Card` with the phase
   number chip, name and "done / total" (ok color when complete, warn when a step in it
   has an orange linked state). Steps are `<label>` rows with a checkbox, text, a second
   line, and a right-hand mono figure. The *current* step (first unticked) has the accent
   tint and "now" on the right; ticked steps are struck through.
4. **Second line of a step** is one of: (a) a live figure from the linked list, as a link
   — "14 → 0 · open Clarify", "7 items · 1 overdue → follow up" (warn when non-zero),
   "11 projects · 2 stalled"; (b) after ticking, the **measured note**: the api snapshots
   the relevant counters when a step becomes current (`openedAt`) and, on tick, writes a
   delta sentence — inbox: "14 → 0"; next actions: "marked n done, m moved to someday";
   capture steps: "captured n items to inbox"; calendar: "last 7 days: n events"; a step
   without a linked list gets the elapsed time only. The user never types these.
   Keep the delta rules in one module `src/lib/review-notes.ts` with a test per rule.
5. **Timer**: elapsed = now − startedAt − pausedMs, ticking each second while the page is
   open; the right-hand figure of a ticked step shows its own duration ("3 min").
6. **Review notes** textarea (autosave to the run) and the "This week, so far" tiles
   (done / captured / completed projects / stalled) computed for the last 7 days.
7. **Leaving and returning**: the run persists; coming back opens at the current step.
   The step links navigate normally; nothing on the other screens changes.
8. **Keys**: `space` tick the current step, `j/k` move the current-step cursor, `p`
   pause/resume, `⌘⏎` finish.

## Definition of done

- Seed run renders as the mockup: Get clear 4/4 with notes, Get current 1/6 with "Review
  past calendar" current, Get creative 0/2, timer running, notes filled, tiles 19/27/1/2.
- Start a fresh run, go to `/clarify`, process one item, come back, tick "Process the
  inbox to zero": its note reads "n → n−1". Finish: sidebar shows today's date.
- An open run with `startedAt` 25 h ago closes as abandoned on load and the start card
  says "abandoned at step 5 · yesterday".
