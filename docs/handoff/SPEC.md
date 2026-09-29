# GTD Workbench — product spec

Status: v0.3, 29.09.2026. Derived from the design canvas "GTD Workbench" and the review
threads on it. Sections 3–4 are decisions, not suggestions; change them here first.

## 1. Purpose

A personal GTD system that follows the textbook workflow without shortcuts: everything is
captured into one inbox, clarified with the same four questions every time, organised into
the canonical lists, and kept honest by a weekly review. Dense, keyboard-driven on desktop;
phone is the same lists with one-hand capture.

## 2. Screens and routes

| Route | Mockup (desktop / phone) | Purpose |
|-------|--------------------------|---------|
| `/inbox` | `Main` / `M-Inbox` | Rapid log capture field + unprocessed items |
| `/clarify` | `Clarify` / `M-Clarify` | Process inbox items one at a time |
| `/next` | `Next` / `M-Next` | Next actions by context, filters, Today panel, focus |
| `/projects` | `Projects` / `M-Projects` | Project list + detail (next actions, later steps, support) |
| `/waiting` | `Waiting` / `M-Waiting` | Waiting For and Someday/Maybe (two panes / two tabs) |
| `/calendar` | `Calendar` / `M-Calendar` | Hard landscape: week view / agenda |
| `/review` | `Review` / `M-Review` | Weekly review checklist with timer |

Reference is a sidebar entry but not a screen in v1 (link goes to Projects). Desktop shell:
224 px sidebar (Collect / Do / Horizons groups + Weekly Review at the bottom), 48 px top bar
with a "Capture to inbox" field on every screen except Inbox and Clarify. Phone shell:
five-tab bar (Inbox, Next, Projects, Waiting, Review); Calendar and Clarify are reached
from Next and Inbox respectively.

## 3. Workflow rules

### 3.1 Capture (Inbox)
- One line per thought, Enter captures, field clears, nothing else happens. Capture never
  asks questions.
- Inline shorthand is parsed best-effort: `#tag`, `@context`, `!A|!B|!C`, `^date`
  (`^03.10`, `^fri`, `^tomorrow`). Unparseable tokens stay in the text.
- Items carry `source`: typed | voice | email | share | scan. Only `typed` exists in v1;
  the others are placeholders for integrations.
- List shows item, source, captured time, age. Age ≥ 3 d turns orange.
- Keys: `j/k` move, `x` select, `c` clarify selected (or first), `⌫` trash.
- Trash is a status, not a delete: `⌫` shows a 5 s undo toast, and trashed items stay in the
  store until the weekly review empties the trash or 30 days after they were trashed.

### 3.2 Clarify — the four steps, always in this order, all visible at once (no wizard)
1. **Is it actionable?** Yes / No→Trash / No→Someday-Maybe / No→Reference.
   A "No" ends the item here; steps 2–4 are skipped. Keys `y t m r`.
2. **What is it?** One text field, prefilled with the captured text. Rewrite only if the
   words don't say what it is. The original capture text stays attached to the item.
   Label of the field: *outcome* (kept on purpose — every item is goal-oriented).
3. **Project.** A picker: typing searches existing projects; the first result is
   "+ New project: …", except when the typed text already is a project's title (ignoring
   case and spacing): then that project leads and no "+ New" is offered — no two open
   projects share a title. Empty = single action. **The item is always the thing in step 2,
   the project always the thing in step 3** — there is no "this item is the project" mode.
   Below it: checkbox "Make this the project's next action" (default on only when the
   project has no next action). Ticking never demotes anything: it adds a next action
   beside the existing ones (note: "project has n next actions — this adds another").
   Unticked → the item becomes a *later step*. Next ↔ later changes only on Projects.
4. **Do, delegate or defer?** Only shown for a next action or single action; later steps
   skip it. Do now (< 2 min) / Delegate → Waiting For (asks who) / Defer → Next Actions
   (context, priority, time, energy) / Defer → Calendar (day, optional time).
   Deadline field: hard deadlines only.
   A `^date` typed at capture is an intent, not a commitment: it is kept as `day` (never as
   `deadline`), and when present step 4 preselects Defer → Calendar with that day.
- "File it and next" (Enter) commits and loads the next inbox item. "Skip" leaves it.
- Right rail: similar items already on the lists (search by words), "Result of this
  clarify" summary (what will be created — Clarify only ever adds), keys.

### 3.3 Next Actions
- Grouped by context; filters for context (multi), time bucket, energy; "Clear". Filters
  live in the URL (`?ctx=@computer,@calls&time=60&energy=low`); a time filter means
  "time ≤ bucket".
- Priority numbers run within a priority across the whole list and are recomputed by the
  api on every change: gaps close, C carries none, undoing a done puts the action back
  under its old number.
- Done fades the row out (400 ms); undo within 5 s (`u` or `⌘Z`, also during the fade).
- Unticking a done item in the Focus card reopens it: back to Next Actions, still starred
  (within the 5 s undo window it is the same as the footer undo and keeps its number;
  after that it is numbered last in its priority).
- Inline edit: text (`e` or double-click), context (`@`), project (`p`, the Clarify picker;
  Enter on an empty field = single action). Enter saves, Esc cancels.
- Row: done checkbox · focus star · priority chip (A1, B3, C) · text · project link ·
  time · energy · due. "Single action" rows show no project.
- **Focus star = today's pick.** Set only here (or by time-blocking on the calendar).
  Clears at midnight. Not a priority.
- Today panel: hard landscape for today (read-only, links to Calendar) and the focus list.
- Health box: projects without next action, overdue waiting-for, actions older than 30 d.
- Keys: `x` done, `f` focus, `e` edit, `p` project, `@` change context.

### 3.4 Projects
- List: state dot (green = has next action, orange = stalled), title, first next action,
  count of next actions, last reviewed. Filters active / work / home / stalled; completed
  count at the right. The filter lives in the URL (`/projects?filter=stalled&p=<id>`).
  work / home come from the store's `areaKinds` map (area → kind); an unmapped area counts
  as neither.
- Detail: outcome ("successful when"), deadline; **Next actions** (read-only rows linking to
  Next Actions, with `↓ later`); **Later steps** (`↑ next`, `+ step`, done steps struck
  through); Waiting for / Reference / Horizon in a row below; Support notes.
- No done checkboxes and no focus stars in this view (planning view). A read-only "today"
  tag shows where a focus is set.
- Demoting a next action to later is allowed at any time; it drops context/priority/time
  (re-asked on promotion). Demoting the last next action marks the project stalled at once.
- Stalled = active project with zero next actions (waiting-for alone does not count).
- Complete is refused while the project has open next actions or later steps ("n open —
  finish, demote or drop them first"); nothing is closed on the user's behalf.
- → Someday demotes the project's next actions to later steps, so nothing of a parked
  project stays on Next Actions. → Active brings it back, stalled until a step is promoted.
- Detail header: area · created ddd dd.mm · from inbox (parts left out when unknown).
- Waiting-for card links to `/waiting?filter=overdue` when one of the project's items is
  overdue ("Overdue waiting-for →"), else to `/waiting` ("All waiting-for →").
- Next-action rows link to `/next?highlight=<id>`, which puts the Next Actions cursor there.

### 3.5 Waiting For and Someday/Maybe
- Waiting For row: what, from whom, project, since, follow-up date. Overdue rows tinted.
  `/waiting?filter=overdue` shows only overdue rows (linked from Health and project detail).
  `f` follow up creates a @calls/@computer action; `x` received (closes, optionally
  creates the next action).
- Someday/Maybe: grouped by bucket (user-defined). Activate → goes through Clarify;
  Drop → gone.

### 3.6 Calendar — the hard landscape only
Exactly five kinds of things, each drawn differently:
1. Appointments synced from external calendars — read-only, grey block, left bar.
2. Time blocks set here — blue outline; an action given a slot (dragging from Next
   Actions creates one and stars the action).
3. Day-specific actions — must happen that day, no time; black outline, checkbox.
4. Day-specific information (tickler) — dashed grey, nothing to do.
5. Hard deadlines — orange outline; mirrored automatically from actions/projects with a
   deadline, owned by their list.
Week view desktop (Mon–Sun, "day only" strip on top of each day, hours 08–18), agenda list
on phone. Nothing is written back to external calendars. Recurring checklists (weekly
review, bins) repeat here. Everything else stays on the lists.

### 3.7 Weekly Review
- A checklist template shipped with the app (Get clear 4 steps / Get current 6 / Get
  creative 2) that the user can edit; each review is an instance of the template at that
  time. Phase names are fixed (they drive the stalled/overdue warnings elsewhere).
- Start → timer runs, sidebar shows "in progress". Steps link to the screen where the
  work happens; the user leaves, does the maintenance there, comes back and ticks.
- Step notes ("captured 6 items", "14 → 0", "2 moved to someday") are **measured deltas**
  between opening a step and ticking it, not typed.
- Pause exists; an abandoned review closes itself after 24 h as "abandoned at step n".
- Review notes textarea saved with the run; "This week so far" counters.
- Finishing a review empties the trash (implicit last step, not a checklist entry).
- Parked ideas (not v1): pinned step strip on other screens, auto-tick when a linked list
  reaches its target state, inline rapid log on the mind-sweep step.

## 4. The "one control per decision" rule

A state is set on exactly one screen and only shown elsewhere, as a label linking to where
it is set.

| State | Set on | Shown elsewhere as |
|-------|--------|--------------------|
| done | Next Actions, Calendar (day-specific) | struck-through line in Projects |
| focus (today) | Next Actions (and by time-blocking) | "today" tag in Projects |
| next ↔ later | Projects | — |
| context, priority, time, energy | Clarify, then inline edit on Next Actions | chips |
| deadline | Clarify / item edit | orange marker on Calendar |
| project membership | Clarify step 3, Projects | project link on rows |

## 5. Domain model (v1)

```ts
type Priority = 'A' | 'B' | 'C';
type Energy = 'focus' | 'normal' | 'low';
type TimeBucket = 15 | 30 | 60 | 120;          // minutes, 120 = "2h+"
type Source = 'typed' | 'voice' | 'email' | 'share' | 'scan';

interface Item {
  id: string;
  text: string;               // the clarified text (step 2)
  captured: string;           // original capture text, never edited
  source: Source;
  capturedAt: string;         // ISO
  status: 'inbox' | 'next' | 'later' | 'waiting' | 'calendar' | 'someday' | 'reference' | 'done' | 'trash';
  projectId?: string;
  context?: string;           // '@computer'
  priority?: Priority;
  priorityNo?: number;        // running number inside priority
  time?: TimeBucket;
  energy?: Energy;
  deadline?: string;          // ISO date, hard deadlines only
  day?: string;               // calendar: day-specific action / info
  timeSlot?: { start: string; end: string };  // calendar: time block
  focusOn?: string;           // ISO date the focus star was set for
  waiting?: { who: string; since: string; followUp?: string };
  bucket?: string;            // someday/maybe grouping
  tags: string[];
  doneAt?: string;
  trashedAt?: string;         // ISO; purged by the weekly review or after 30 d
}

interface Project {
  id: string;
  title: string;              // outcome phrasing
  successfulWhen?: string;
  area?: string;              // 'Home & workshop'
  goal?: string;
  deadline?: string;
  status: 'active' | 'someday' | 'completed';
  notes: string;
  lastReviewedAt?: string;
  createdAt?: string;         // ISO
  createdFrom?: 'inbox' | 'projects';  // Clarify step 3, or "+ Project" (later)
  // derived: nextActions = items(status='next', projectId), stalled = active && nextActions.length===0
}

// Store-level: which areas count as "work" or "home" for the Projects filter chips.
// An area missing here shows under neither chip.
type AreaKinds = Record<string, 'work' | 'home'>;

interface ReviewTemplate { phases: { id: string; name: string; steps: { id: string; text: string; link?: string }[] }[] }
interface ReviewRun {
  id: string; startedAt: string; finishedAt?: string; pausedMs: number;
  steps: { stepId: string; doneAt?: string; note?: string; openedAt?: string }[];
  notes: string;
  outcome?: 'finished' | 'abandoned';
}

interface ExternalEvent { id: string; calendar: string; title: string; start: string; end: string; allDay: boolean }
```

Derived, never stored: project stalled flag, inbox age, review counters, health numbers.

## 6. Keyboard map (desktop)

Global: `⌘K` command palette (later), `›`-field on every screen captures to inbox.
Inbox: `j k x c ⌫`, `u` (or `⌘Z`) undo trash within 5 s, `/` focus the rapid log, `esc` leave it. Clarify: `y t m r` (step 1), `p` project picker, `a` toggle next
action, `2 w n k` (step 4), `⏎` file and next, `s` skip, `⌫` trash. Next Actions: `j k` move,
`x f e p @`, `u` (or `⌘Z`) undo done within 5 s, `esc` cancel an edit / drop the cursor.
Waiting: `f x`. Review: `space` tick current step.

## 7. Visual system

See `design/tokens.css`. Two faces (IBM Plex Sans for text, IBM Plex Mono for labels,
counts, keys, dates), cool grey ground `#eef0f3`, panels white, ink `#171a1f`, muted
`#5a6370`, one accent blue `#2456c4`, orange `#b8560f` reserved for "needs attention"
(overdue, stalled, deadlines, inbox age), green `#1f7a5c` only for "has next action" /
done counters. Radius 3 px. Type 13 px body desktop, 15 px phone; 11 px mono meta; 10 px
tracked mono section labels. Hit targets ≥ 44 px on phone, ≥ 26 px desktop buttons.

## 8. Non-goals for v1

Multi-user, sharing, external calendar write-back, email/voice/scan ingestion (only the
`source` field exists), Reference screen, command palette, dark theme (tokens are ready for
it, no UI yet), AI features of any kind.

Planned for v1.1: sort and group menus on the lists ("Sort ▾" on Inbox, "Group: context ▾"
on Next Actions, as drawn in the mockups). v1 ships the fixed order: Inbox newest first,
Next Actions grouped by context.
