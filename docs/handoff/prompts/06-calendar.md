# 06 · Calendar: the hard landscape

Reference: `docs/handoff/design/mockups/Calendar.dc.html`; SPEC §3.6. Five kinds of things,
nothing else. If something on a list does not fall into one of the five kinds, it does not
appear here — that is the point of the screen.

## Do

1. **Route** `/calendar?week=2026-W39` (ISO week; default current). Top bar: h1
   "Calendar", meta "week 39 · 21.09 – 27.09", ‹ Today › buttons, capture field. No "Week ▾"
   menu (v1.1, SPEC §8): only Week in v1; Agenda comes with the phone layout in 08.
2. **Week grid** in a `Card`: `48px repeat(7, 1fr)` columns, rows `40px 96px 1fr`.
   Day headers with tracked weekday + number; today's column tinted accent with
   "SAT · TODAY". Row 2 is the **day-only strip**; row 3 the time grid 08–18, 48 px per
   hour, hour labels in the first column, faint hour lines (`repeating-linear-gradient`
   is fine), and a warn-colored "now" line in today's column.
3. **The five kinds** (`api.weekLandscape(week)` returns them typed with a `kind` field):
   - `appointment` (external events): muted-bg block, 3 px muted left bar, mono time, read-only.
   - `timeblock` (item with `timeSlot`): white, accent outline + accent left bar; click
     opens the item; drag to move (native DnD, snaps to 15 min); × removes the slot and
     the focus star if it was set by blocking.
   - `dayaction` (item with `day`, no slot): day-only strip, white with ink outline and a
     checkbox (`api.complete`); struck through when done.
   - `info` (tickler entries): day-only strip, dashed control-grey outline, muted text,
     no interaction except edit/delete.
   - `deadline` (any item/project with a `deadline`): day-only strip, warn outline, text +
     tracked "DEADLINE" tag; click navigates to the owning list. Never editable here —
     it is mirrored, the list owns it.
4. **Right rail (260 px)**: "What lives here" legend (five swatches drawn with the same
   styles as the blocks — reuse the components), "How items get here" (the five numbered
   lines from the mockup, 1–3 as links), "Upcoming hard deadlines" (next 30 days, from
   `api.upcomingDeadlines()`), sync footer "synced HH:MM · n calendars" listing the
   external calendar names from the seed.
5. **Drop target**: dragging a row from `/next` onto a time slot creates a `timeslot` on
   that item and stars it for that day (SPEC §3.3). Implement the drop side here; the drag
   source is a one-line addition in the Next Actions row (`draggable` + `dataTransfer`
   with the item id).
6. **Recurring**: items with a tag `recurring:weekly` render on every week at the same
   weekday/time with a "↻" suffix; completing one creates the next occurrence (store only
   the rule and the next date; keep it minimal).
7. **`api`**: `weekLandscape`, `setTimeSlot`, `clearTimeSlot`, `setDay`, `addTickler`,
   `upcomingDeadlines`. External events are read from the seed's `externalEvents`; a
   `CalendarSource` interface with a `SeedCalendarSource` implementation keeps the door
   open for a CalDAV/Exchange adapter later. Nothing is ever written to a source.

## Definition of done

- Week 39 of the seed renders as the mockup: Mon client session, Tue meeting, Tue/Wed
  done day-actions, Thu office hours, Fri tickler + deep-work time block, Sat dentist,
  team-lead call, application deadline, now-line, Sun bins tickler + weekly review block.
- Dragging n2 from `/next` onto Mon 09:00 creates a time block there and stars n2.
- Upcoming deadlines lists 03.10 table offer, 12.10 jury comments, 14.10 fair.
