# 12 · Calendar sources: CalDAV read-only (and .ics URL)

Reference: SPEC §3.6 ("Appointments synced from external calendars — read-only", "nothing
is written back"); the `CalendarSource` interface and `SeedCalendarSource` from step 06;
the Calendars card from step 11.

## Do

1. **Two source kinds**, both behind the existing `CalendarSource` interface:
   `IcsUrlSource` (fetch an `.ics` URL; covers Exchange/Outlook "publish calendar" links
   and most other systems) and `CalDavSource` (PROPFIND/REPORT with basic auth against a
   calendar URL; use `tsdav` or hand-roll the two requests — prefer the smaller
   dependency). Parse with `ical.js` or `node-ical`; expand recurring events with the
   library's rrule support for the visible window only.
2. **Secrets**: credentials live in env only (`CAL_<NAME>_URL`, `CAL_<NAME>_USER`,
   `CAL_<NAME>_PASS`) or, if you prefer settings-stored, encrypted with a key from env
   (`APP_SECRET`) — never plain in the database, never in logs. The Settings card shows
   name, kind, URL host, last sync time, status; the password field is write-only.
3. **Sync**: `api.syncCalendars()` pulls a window of today −7 d … +60 d per source and
   upserts into an `external_events` table keyed by `(sourceId, uid, recurrenceId)`;
   events that vanished from the feed are deleted. Runs on app start, then every 15 min
   (a single `setInterval` in the server process is acceptable for a single-user app;
   guard against overlapping runs), and on the "Sync now" button in Settings.
   Failures are stored on the source (`lastError`) and shown as a warn tag in the
   calendar's footer ("Work: sync failed 3 h ago") — never as a modal, never blocking
   the page.
4. **Rendering**: nothing new — `weekLandscape()` already reads external events; make
   sure all-day events land in the day-only strip as `appointment` kind, multi-day events
   span days, and events outside 08–18 push the grid (earlier start / later end) rather
   than being clipped; add a "show 00–24" toggle if that gets ugly.
5. **Privacy**: events are stored with title, start, end, allDay, location, calendar
   name — no description, no attendees. Say so in `docs/OPERATIONS.md`.
6. **Tests**: parser tests on three fixture `.ics` files (simple, recurring with
   exception, all-day multi-day) and a sync test that proves upsert/delete behaviour
   with a fake source. Network calls are mocked; no test hits the internet.

## Don't

- No write-back of any kind, no OAuth flows (Google/Microsoft Graph are out of scope —
  use their published-calendar `.ics` links instead), no attendee data.

## Definition of done

- A configured `.ics` URL and a CalDAV calendar both show their events in `/calendar`
  and in the Today panel within one sync cycle; a removed event disappears after the
  next sync; a wrong password produces the footer warning and nothing else.
- SPEC §3.6 gets a short "Sources" paragraph; §8 drops "external calendar" from
  non-goals but keeps "write-back".
