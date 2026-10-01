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
| `/settings` | — (built from the primitives) | Contexts, buckets, calendars, time zone, review checklist |
| `/reference` | — (built from the primitives) | Reference: notes, links, file names — the index, not the archive |

Reference is a sidebar entry with its count and its own screen (§3.11); on the phone it is
reached through ⌘K. Settings
(`/settings`) is desktop-only in v1: the sidebar links to it, the phone tab bar does not (the
page still works at phone width). Desktop shell:
224 px sidebar (Collect / Do / Horizons groups + Weekly Review at the bottom), 48 px top bar
with a "Capture to inbox" field on every screen except Inbox and Clarify. Phone shell:
five-tab bar (Inbox, Next, Projects, Waiting, Review); Calendar and Clarify are reached
from Next and Inbox respectively. Phone rules: §3.8.

## 3. Workflow rules

### 3.1 Capture (Inbox)
- One line per thought, Enter captures, field clears, nothing else happens. Capture never
  asks questions.
- First run: on a database created at this boot, a card above the list says "New here.
  Capture the first thing on your mind; the lists fill themselves. Contexts and the review
  checklist are in settings." The first capture dismisses it. No wizard, no tour.
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
   A "No" ends the item here; steps 2–4 are skipped. Keys `y t m r`. No→Reference asks one
   optional thing more, inline: the kind (note / link with its URL / file with its name;
   suggested from the text — a URL makes it a link) and, in step 3, a project it belongs to.
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
- **Focus star = today's pick.** Set only here (or by time-blocking an action on today in the calendar).
  Clears at midnight. Not a priority.
- Today panel: hard landscape for today (read-only, links to Calendar) and the focus list.
- Health box: projects without next action, overdue waiting-for, actions older than 30 d.
- Keys: `x` done, `f` focus, `e` edit, `p` project, `@` change context.

### 3.4 Projects
- List: state dot (green = has next action, orange = stalled), title, first next action,
  count of next actions, last reviewed. Filters active / work / home / stalled / someday;
  completed count at the right. someday lists projects on hold with a "someday" tag and a
  grey dot (not judged stalled); their detail offers → Active. The filter lives in the URL (`/projects?filter=stalled&p=<id>`).
  work / home come from the store's `areaKinds` map (area → kind); an unmapped area counts
  as neither.
- Detail: outcome ("successful when"), deadline; **Next actions** (read-only rows linking to
  Next Actions, with `↓ later`); **Later steps** (`↑ next`, `+ step`, done steps struck
  through); Waiting for / Reference / Horizon in a row below; Support notes.
- No done checkboxes and no focus stars in this view (planning view). A read-only "today"
  tag shows where a focus is set.
- Demoting a next action to later is allowed at any time; it drops context, priority, time,
  energy, day, time block and focus star (all re-asked on promotion: the step-4 fields inline
  on Projects, day and block on Calendar, the star on Next Actions). Demoting the last next action marks the project stalled at once.
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
  Fixed order: follow-up date ascending, undated last, ties by oldest since (no sort menu in
  v1). `f` creates "Follow up with <who>: <what>" — @computer when who is a desk, support
  or committee, else the follow-up context from Settings (default @calls); B, 15 min, low;
  same project — and moves the follow-up date
  to a week from today. `x` received offers undo for 5 s; if the project is left without a
  next action, an inline "Next action for <project>?" asks for one (skip allowed).
  `/waiting?filter=overdue` shows only overdue rows (linked from Health and project detail).
  `?highlight=<id>` puts the cursor on that row, in whichever pane holds it (from ⌘K).
  `f` follow up creates a @calls/@computer action; `x` received (closes, optionally
  creates the next action).
- Someday/Maybe: grouped by bucket (user-defined), in the store's bucket order, "No bucket"
  last. Activate → back to the inbox and straight into Clarify; Drop → trash (5 s undo).
  A row's bucket changes via a small select shown on hover/focus.
- **Projects on hold**: a section above the buckets listing someday projects (title, later
  step count). Activate → the project is active again (stalled until a step is promoted)
  and `/projects?p=<id>` opens. Drop → status completed with `dropped: true`; it shows
  under Projects' "completed" as "dropped", and its later steps stay with it.

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
- Route `/calendar?week=2026-W39` (ISO week; invalid or missing = the current week).
  ‹ Today › step through weeks. A warn line marks now in today's column (within the grid's hours).
- Time blocks: dropping a Next Actions row (or a block) on the grid snaps to 15 min. A new
  block lasts the action's time estimate (1 h without one); a moved block keeps its length.
  Overlapping blocks sit side by side. A block on today stars the next action for today; a
  block on any other day leaves stars alone. × removes the block and never touches a star.
  Demoting a next action drops its block (SPEC §3.4).
  Clicking a block opens it where it is looked after (Next Actions row, else its project).
- Calendar items (from Clarify → Defer → Calendar) can be dragged between days in the day-only
  strip or onto a slot; removing a calendar item's block leaves it on its day.
- Deadlines: a day-specific action due the day it sits on is drawn once, as the action with
  the DEADLINE tag. An action due the same day as its project shows only as the project.
  Deadlines of open items (next, later, waiting, calendar) and active projects count.
  "Upcoming hard deadlines" lists tomorrow to 30 days ahead (today's are on the grid);
  orange within 7 days.
- Tickler notes: "+ note" on a day (shown on hover/focus) adds one; click to edit, emptying or
  × deletes. No undo.
- Recurring: an item tagged `recurring:weekly` is drawn on every later week at the same
  weekday and time with "↻" (projected, not interactive). Completing it stores the next
  occurrence a week later; undoing the completion takes that occurrence back.

#### Sources (step 12)
- Two kinds, configured in the environment only — `CAL_<ID>_URL`, `CAL_<ID>_NAME`,
  `CAL_<ID>_KIND` (`ics` | `caldav`), `CAL_<ID>_USER`, `CAL_<ID>_PASS`: a published `.ics`
  link (Outlook / Exchange / Google "publish calendar", `webcal://` too) and a CalDAV
  calendar collection (one REPORT with a time range, basic auth). Credentials never go into
  the database or the logs; Settings shows name, kind, host, last sync and status.
- Sync pulls today −7 … +60 days per source on server start, every 15 minutes and on
  "Sync now" (Settings). Recurring events are expanded for that window only (RRULE,
  EXDATE, moved and cancelled occurrences). Events are keyed by (source, uid, recurrence
  id); what vanished from the feed is deleted. A failed sync keeps the last events and shows
  "Work: sync failed 3 h ago" in the calendar footer and on Settings — never a modal. A
  source removed from the environment disappears with its events.
- Times are converted to the app's zone. All-day events sit in the day-only strip on each
  of their days; a timed event past midnight is split at midnight; the time grid widens to
  whole hours around anything outside 08–18.
- Stored per event: title, start, end, all day, location, calendar — no description, no
  attendees. Nothing is ever written back.

### 3.7 Weekly Review
- A checklist template shipped with the app (Get clear 4 steps / Get current 6 / Get
  creative 2) that the user can edit; each review is an instance of the template at that
  time. Phase names are fixed (they drive the stalled/overdue warnings elsewhere).
- A run stores a copy of the template when it starts (`ReviewRun.template`): editing the
  checklist never changes a review under way; the next one uses the edit. An added step
  linked to a list (e.g. `/waiting`) gets that list's live figure and measured note.
- Start → timer runs, sidebar shows "in progress". Steps link to the screen where the
  work happens; the user leaves, does the maintenance there, comes back and ticks.
- Step notes ("captured 6 items", "14 → 0", "2 moved to someday") are **measured deltas**
  between opening a step and ticking it, not typed.
- Pause exists; an abandoned review closes itself after 24 h as "abandoned at step n".
- Review notes textarea saved with the run; "This week so far" counters.
- Finishing a review empties the trash (implicit last step, not a checklist entry).
- Sidebar badge: "in progress" (open run), else the date of the last finished run when it is
  under 7 days old, else "due". One open run at a time; runs are kept as history.
- Without an open run `/review` shows a start card: last review, step count, the usual
  length (average of finished runs, pauses excluded) and, if the latest run was abandoned,
  "abandoned at step n · yesterday" (n = steps ticked in it). An open run whose start is 24 h
  or more ago is closed as abandoned on any page load.
- The current step is the first unticked one. A step becomes current by ticking the one
  before it, moving the cursor to it (`j k`) or following its link; at that moment the run
  snapshots inbox, someday, overdue waiting-for and stalled counts. Ticking writes the note
  from that snapshot (or the latest one taken before it): inbox "14 → 13"; next actions
  "marked n done, m moved to someday"; collect / email / mind sweep / ideas "captured n items
  to inbox"; calendars "last 7 days: n events" / "next 14 days: n events, m hard
  deadlines"; waiting, projects, someday "overdue / stalled / someday a → b"; anything else
  the minutes it took. Rules live in `src/lib/review-notes.ts`.
- An open step shows a live figure from its list as a link (orange when that list needs
  attention: overdue waiting-for, stalled projects); a phase's count turns orange then.
  A ticked step shows its note and how long it took (from becoming current to the tick).
- "This week, so far": items done and captured in the last 7 days, projects completed in
  the last 7 days (dropped ones not counted), projects stalled now.
- Parked ideas (not v1): pinned step strip on other screens, auto-tick when a linked list
  reaches its target state, inline rapid log on the mind-sweep step.

### 3.8 Phone (below 1024 px)
Same routes and api, composed for capture, ticking and reading; planning stays on desktop.
- Header: 58 px left empty for the status bar (never drawn), title 20 px, meta, 36 px
  actions. Every screen but Inbox and Clarify has "›", which opens `/inbox?capture=1` with
  the rapid log focused. Tab bar: Clarify and Calendar light up Inbox and Next.
- Clarify is a focused flow: no tab bar (as drawn in `M-Clarify`), its own bottom bar
  (trash + "File it and next"). Steps 1–2 fold to one line with a check and "Edit" once
  answered; step 4 shows context and priority, time / energy / deadline fold into "… — tap
  to change". The empty state keeps the tab bar.
- Gestures (pointer events, 80 px): Inbox → clarify, ← trash (5 s undo); Next Actions →
  toggles the focus star (the row tick is the tap); Waiting For → received (5 s undo),
  ← follow up. Every row also has a tap path: Inbox rows open Clarify, overdue waiting-for
  rows have "Follow up".
- Next Actions: context chips scroll sideways, time / energy chips under them; a "Today"
  strip links to Calendar. Projects: the list without `?p=`, the detail (single column)
  with it. Waiting: two tabs (`?tab=someday`). Calendar: an agenda from the chosen day
  (strip of the week's days, default today) over 14 days, days without entries left out.
  Weekly Review: one step list with phase labels, progress bar, Pause / Finish above the
  tab bar; notes and "this week" stay on desktop.
- Touch targets ≥ 44 px: controls drawn smaller in the mockups (chips, small buttons) get a
  44 px hit area around them. No hover-only control: what appears on hover on desktop is
  always visible on phone (the bucket select).

### 3.9 Settings
- `/settings`, a small mono "settings" link under Weekly Review in the sidebar (desktop only
  in v1, see §2).
  One column of cards: Contexts, Someday / Maybe buckets, Calendars (read-only names; the
  time zone), the review checklist, Appearance (the theme). No save button: a row commits on ⏎ or leaving the
  field; every change offers undo for 5 s (`u` / `⌘Z`).
- Contexts and buckets are lists the items point to, not loose strings. A context is `@`
  and one word; names are unique regardless of case. Renaming renames every item that uses
  it, in one transaction. Deleting is refused while open items use it ("6 actions use
  @computer — move them first", with a link to `/next?ctx=@computer`; buckets link to
  Someday / Maybe). Order = display order (↑ ↓).
- Follow-up context: a select in the Contexts card ("Follow-ups go to", default @calls) picks
  where `f` on a waiting-for files its action. It is treated like an item using the context:
  a rename carries it along; a delete is refused while it points there ("@calls is where
  follow-ups go — choose another context for them first").
- The checklist: steps are edited per phase (text, optional link to a screen, order, add,
  remove); "Reset to GTD default" restores the base seed's template.
- Time zone (Settings.timezone, else the server's `TZ`): "today", midnight (focus stars),
  overdue and the calendar's now line all count in it; one clock in `lib/clock.ts` behind
  `api.now()` / `api.today()`.
- Theme (Settings.theme): `system` (default) follows the device, live; `light` and `dark`
  force one. The server renders it as `data-theme` on `<html>` (every page is rendered per
  request), so a reload never flashes the other theme; `system` renders no attribute and the
  `prefers-color-scheme` block in `tokens.css` applies. Also the palette's "Toggle dark theme".

### 3.10 Command palette
- A keyboard front door, not a second UI: every entry is an existing api operation or route.
  It searches a small index the server sends with every page, so it opens and filters
  without waiting (no request on open).
- Modes by the first character: plain text searches items (all lists but trash, who and
  project included) and projects, grouped by list, ⏎ opens the row on its screen (Next with
  `?highlight=`, Waiting / Someday with `?highlight=`, Projects with `?p=`, Calendar with the
  week). `>` lists commands: go to each screen, Clarify inbox, start (or open) the weekly
  review, sync calendars (when configured), "Toggle dark theme" (system → dark → light); with a cursor on a Next Actions row also done,
  focus today, later (project actions only), change context…, move to project…; on a
  Waiting For row follow up and received. `+` captures the rest of the line with the
  rapid-log shorthand and reads back what it parsed ("→ inbox · @calls · B · fri 02.10")
  before ⏎. `@` lists contexts with their open counts (⏎ → `/next?ctx=…`), `#` projects.
- Empty input: the five modes as a hint line and the last 8 selections ("Recent", in memory
  only). A dialog with `aria-activedescendant`; focus returns where it was on close.
- No settings in the palette except the theme toggle, no natural-language parsing beyond
  the capture shorthand.

### 3.11 Reference
- Kept, not acted on. An item with `status: 'reference'` and a `reference` (note / link /
  file); it may belong to a project and carry tags, never a context, priority or dates. The
  app is the index: no upload, no preview, no full text of what a link points to.
- `/reference`: a search field (text, note, URL and its host, tags, project; as you type, in
  `?q=`), chips for kind and with project / loose, two-line rows (text + kind; host of the
  link, start of the note or the file name; the project at the right). A link opens in a new
  tab (any scheme), a note expands in place. Edit, project (the Clarify picker), → Someday
  and trash (5 s undo) per row — on desktop shown on hover, focus or the cursor row.
- Clarify "No → Reference" files it (§3.2). On a project, the Reference box lists its
  entries and "+ reference" adds a note to it.
- Someday ↔ Reference: "→ Reference" on a Someday row (`r`), "→ Someday" on a reference
  row, both also in ⌘K for the row under the cursor. The entry keeps what it was (bucket,
  link) for the way back.

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
  reference?: Reference;      // status 'reference' (§3.11)
  tags: string[];
  doneAt?: string;
  trashedAt?: string;         // ISO; purged by the weekly review or after 30 d
}

interface Reference {
  kind: 'note' | 'link' | 'file';
  url?: string;               // link: any scheme — https, obsidian://, a document system's URL
  body?: string;              // note: the text kept; file: a path or file name (no upload)
}

interface Project {
  id: string;
  title: string;              // outcome phrasing
  successfulWhen?: string;
  area?: string;              // 'Home & garden'
  goal?: string;
  deadline?: string;
  status: 'active' | 'someday' | 'completed';
  notes: string;
  lastReviewedAt?: string;
  createdAt?: string;         // ISO
  createdFrom?: 'inbox' | 'projects';  // Clarify step 3, or "+ Project" (later)
  dropped?: boolean;          // completed by Drop on Someday/Maybe, not by finishing it
  completedAt?: string;       // ISO; when it was completed or dropped
  // derived: nextActions = items(status='next', projectId), stalled = active && nextActions.length===0
}

// Store-level: which areas count as "work" or "home" for the Projects filter chips.
// An area missing here shows under neither chip.
type AreaKinds = Record<string, 'work' | 'home'>;

interface ReviewTemplate { phases: { id: string; name: string; steps: { id: string; text: string; link?: string }[] }[] }
interface ReviewCounters { inbox: number; someday: number; waitingOverdue: number; stalled: number }
interface ReviewRun {
  id: string; startedAt: string; finishedAt?: string; pausedMs: number;
  template?: ReviewTemplate;  // the checklist as it was when the run started
  pausedAt?: string;          // set while paused
  steps: { stepId: string; doneAt?: string; note?: string; openedAt?: string; snapshot?: ReviewCounters }[];
  notes: string;
  outcome?: 'finished' | 'abandoned';
}

// One per installation, edited on /settings.
interface Settings {
  contexts: string[];         // '@computer', in the order Next Actions shows them
  followUpContext: string;    // where `f` on a waiting-for files the action (default '@calls')
  buckets: string[];          // Someday/Maybe buckets, in display order
  reviewTemplate: ReviewTemplate;
  weekStart: 'mon';
  timezone: string;           // IANA; empty = the server's TZ
  theme: 'system' | 'light' | 'dark';  // default 'system'
}

interface ExternalEvent {
  id: string;                 // synced: `<source>|<uid>|<recurrence id>`
  calendar: string; title: string;
  start: string; end: string; // timed: ISO with offset in the app's zone; all day: yyyy-mm-dd, end exclusive
  allDay: boolean;
  location?: string;
  sourceId?: string;          // absent = demo data
}

// Store-level, with the sync status of configured sources (env `CAL_<ID>_URL`):
interface ExternalCalendar { name: string; via: string; sourceId?: string; host?: string;
  lastSyncAt?: string; lastError?: string; lastErrorAt?: string }
```

Storage (`STORE=memory|sqlite`, sqlite by default in production, memory in dev and tests;
`DATABASE_FILE`, default `data/gtd.db`): SQLite through Drizzle, one table per interface
above plus the store-level lists (area kinds, tickler, external calendars); `Settings` is
one JSON row in the `settings` table. Two seeds: `seed.base.json` (generic contexts and
buckets, the review template, week start, time zone) and `seed.demo.json` (the demo's own
contexts and buckets, projects, items, calendar, review runs). A database that was never
filled gets the base only; memory mode and `db:seed` / `db:reset` load base + demo. Deployment, backup and restore:
`docs/OPERATIONS.md`. Deviations from the interfaces, each for a reason:
- `Item.timeSlot` and `Item.waiting` are flattened into `time_slot_start/_end` and
  `waiting_who/_since/_follow_up`: always read with their item, and `waiting` is queried.
- `Item.tags`, `ReviewRun.steps` and `ReviewTemplate.phases` are JSON columns: read whole,
  never queried on their own.
- `priority_no` is `real`: undoing a done action parks it half a step ahead until the same
  write renumbers.
- Every list table has `seq`, the position the store keeps it in (capture order, run
  order), so a reload gives the same order the memory store had.
- A stale review run (open, started ≥ 24 h ago) reads as abandoned; it is written as
  abandoned the next time a review starts. No job runs at night.

Derived, never stored: project stalled flag, inbox age, "this week" review counters, health
numbers. (A review step's `snapshot` is stored on purpose: it is the "before" of its note.)

## 6. Keyboard map (desktop)

Global: `⌘K` / `Ctrl-K` opens and closes the command palette (§3.10; on the phone the "⌘K"
button in the header); inside it `↑ ↓` move, `⏎` runs, `esc` closes (or leaves a sub-list);
a leading `>` lists commands, `+` captures, `@` jumps to a context, `#` to a project, plain
text searches. `›`-field on every screen captures to inbox.
Inbox: `j k x c ⌫`, `u` (or `⌘Z`) undo trash within 5 s, `/` focus the rapid log, `esc` leave it. Clarify: `y t m r` (step 1), `p` project picker, `a` toggle next
action, `2 w n k` (step 4), `⏎` file and next, `s` skip, `⌫` trash. Next Actions: `j k` move,
`x f e p @`, `u` (or `⌘Z`) undo done within 5 s, `esc` cancel an edit / drop the cursor.
Waiting: `j k` move in the current pane, `Tab` switch pane (only while a row cursor is
active, `esc` drops it and Tab moves focus again), `f` follow up and `x` received (Waiting
For), `x` activate, `r` → Reference and `⌫` drop (Someday/Maybe), `u` (or `⌘Z`) undo within 5 s.
Reference: `j k` move, `⏎` open the link (new tab) or show the note, `e` edit, `p` project,
`⌫` trash, `u` (or `⌘Z`) undo within 5 s.
Review: `space` tick the step under the cursor, `j k` move the cursor, `p` pause / resume,
`⌘⏎` finish.

## 7. Visual system

See `design/tokens.css`. Two faces (IBM Plex Sans for text, IBM Plex Mono for labels,
counts, keys, dates), cool grey ground `#eef0f3`, panels white, ink `#171a1f`, muted
`#5a6370`, one accent blue `#2456c4`, orange `#a84e0d` reserved for "needs attention"
(overdue, stalled, deadlines, inbox age), green `#1f7a5c` only for "has next action" /
done counters. Radius 3 px. Type 13 px body desktop, 15 px phone; 11 px mono meta; 10 px
tracked mono section labels. Hit targets ≥ 44 px on phone, ≥ 26 px desktop buttons.

Dark theme: the same palette re-tuned, set only in the dark blocks of `tokens.css` (never
a dark-specific class in a component). Rails are darker than the ground in both themes;
`color-scheme: dark` makes native controls follow. Every colour in `src` is a token;
`src/lib/contrast.ts` lists the foreground / background pairs the components use and
`contrast.test.ts` checks them in both themes (text 4.5:1, focus border and now line 3:1),
with no exceptions. The root carries `color-scheme: light dark` in `system`, `light` or
`dark` when the theme is forced.

## 8. Non-goals for v1

Multi-user, sharing, external calendar write-back, email/voice/scan ingestion (only the
`source` field exists), AI features of any kind.

Planned for v1.1:
- Sort and group menus on the lists ("Sort ▾" on Inbox, "Group: context ▾" on Next
  Actions, "Sort: follow-up ▾" on Waiting For, "Group: bucket ▾" on Someday/Maybe, as drawn
  in the mockups). v1 ships fixed orders: Inbox newest first, Next Actions grouped by
  context, Waiting For by follow-up, Someday/Maybe grouped by bucket.
- "Week ▾" view menu on Calendar (Week / Agenda on desktop). v1 ships Week on desktop and
  the agenda on the phone (iteration 08).
- "+ Project" on Projects, with capture-then-Clarify semantics: it captures the typed line
  into the inbox marked as a project, and Clarify opens on it with step 3 preset to
  "+ New project: <line>". Projects are still only born through Clarify; the button is a
  shortcut, not a second way in.
