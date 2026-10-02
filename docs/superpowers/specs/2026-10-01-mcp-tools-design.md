# MCP for the GTD Workbench — design

Date: 2026-10-01 · Status: draft for review · First iteration: to be revised after a few
weeks of everyday use.

## 1. Purpose

Let an AI agent support the whole GTD practice with the workbench — in a chat on the
desktop (Claude Desktop, Claude Code, Codex) or on the phone (a chat agent on a server,
e.g. reached through Telegram). Two kinds of user stories:

- **Guide me** — "help me decide". The agent leads, asks, explains; the human decides.
  Served by ready-made workflows (MCP prompts, §6).
- **Record it** — "put this in the tool". The human has decided; the agent writes it,
  fast, from anywhere. Served by tools with write access (§5).

Clarify sits in between: the agent prepares **drafts** (rewritten outcome, project, fields);
the human opens Clarify and mostly just files them (§3.4).

Principles:

- The agent works through the same operations as the screens, never around them, and
  everything it does is visible in the app (activity log, §3.2).
- The main agent gets broad write access. Confirmation steps are not the safeguard;
  visibility and undo are. Tool descriptions say: act when the user stated the decision;
  draft or ask when the agent would be deciding itself.
- Not in scope: settings changes (contexts, buckets, review template, theme), deleting
  anything for good, writing to external calendars.

## 2. Architecture

```
Claude Desktop / Claude Code / Codex / chat agent on a server
        │ stdio (MCP)
        ▼
gtd-mcp  — thin Go binary, one per machine, no GTD logic
        │ HTTPS, Authorization: Bearer <client token>
        ▼
Next.js app — REST API /api/v1/…  →  lib/api.ts  →  store
```

- **The app** owns everything: rules, validation, the activity log, identity (the actor of
  a write is the token's client). `POST /api/capture` becomes one endpoint of `/api/v1`
  and keeps working.
- **The binary** translates MCP to REST. It fetches its tool list and schemas from the app
  (`GET /api/v1/tools`), so app updates need no binary update. Configuration: the app's
  URL and the client token, from the agent's MCP config.
- **The binary is written in Go:** one static binary per OS and architecture (macOS arm64 /
  amd64, Linux amd64 / arm64), so no Node or other runtime is needed where an agent runs.
  Built on the official Go MCP SDK.
- **Exposure:** `/api/v1/*` bypasses the proxy login (like `/api/capture` today) and relies
  on the bearer token: long random tokens, the bad-token throttle, revocable clients. An
  agent on the same server may call the app internally.
- Later, if needed: a remote MCP transport (for clients that only take remote servers)
  sits on the same REST API without changing it.

## 3. Cross-cutting

### 3.1 Clients and presets

Settings → Clients: name ("Claude Desktop", "n8n scan", "Phone agent") and a preset. The
token is shown once, stored hashed, revoked with one click; last use is shown.

| Preset | May |
|---|---|
| capture | `capture`, `add_tickler`, `whoami` |
| read-only | every read tool (§5.1), `get_activity`, `whoami` |
| assistant | everything in §5 |

`CAPTURE_TOKEN` from the environment keeps working as the built-in client
"capture (env)" with the capture preset.

### 3.2 Activity log

Every change, by anyone, is an entry: when, actor (the user in the UI, a named client, the
mail poller, share, the system: trash purge, calendar sync, recurring successors), what in
words ("Clarified *Call Alice* → Waiting For: Alice, follow-up 08.10"), the items or
projects involved with before and after. Shown per item (history) and as a global Activity
view filterable by actor. Kept one year.

### 3.3 Undo

Any entry can be undone — not only within 5 s — as long as nothing touched its items since;
otherwise undo is refused with "changed since by …". An undo is an entry itself.

### 3.4 Drafts

One draft per inbox item: rewritten outcome, kind (action / project / reference / someday /
trash), project (existing, or "+ new: …"), context, priority, time, energy, deadline, and a
one-line reason. A newer draft replaces the older. Clarify opens prefilled, marked
"drafted by <client> · <reason>"; *File it and next* files it, any change by the human
wins. Never applied on its own; gone when the item is filed or trashed. The inbox list
marks items that have a draft.

## 4. Tool conventions

- Items in answers: `id`, `text`, `list`, the fields that matter for that list, and `url`
  to open them in the app.
- Refusals carry the app's reason ("project *X* is on hold — activate it first").
- Every write returns its activity entry id (for `undo`).
- ✦ = not in the app yet. (Stages 1 and 2 built the activity log, undo, clients, drafts,
  `file`, `edit_waiting`, `get_overview`, `find_free_time` and `prepare_weekly_review`; the
  marks are gone from those.)

## 5. Tools

### 5.1 Orientation (read)

| Tool | Purpose |
|---|---|
| `get_overview` | Inbox count and oldest, focus today, today's hard landscape, stalled projects, overdue waiting-fors, deadlines in 7 days, review due / open |
| `search(query, lists?)` | Everything incl. Reference and done, ranked word match; its description: search before capturing or filing, and judge the hits |
| `get_item(id)` | Captured text, source, attached context, project, draft, history |
| `list_inbox(source?, older_than_days?)` | With draft markers |
| `list_next_actions(context?, max_minutes?, energy?, project?, focus_only?)` | "What can I do now" |
| `list_waiting(overdue_only?)` | |
| `list_someday(bucket?)` | |
| `list_reference(query?, kind?)` | |
| `list_projects(status?, stalled_only?)` | |
| `get_project(id)` | Next actions, later steps, waiting, reference, done, deadline |
| `get_calendar(from, to)` | All five kinds incl. external appointments |
| `find_free_time(from, to, min_minutes, day_hours?)` | Gaps between appointments and blocks |
| `get_settings` | Contexts, buckets, time zone, review template (read only) |

### 5.2 Collect

| Tool | Purpose |
|---|---|
| `capture(items[])` | One or many `{text, source?, url?, note?}`, shorthand parsed |
| `add_tickler(day, text)` · `edit_tickler(id, …)` · `delete_tickler(id)` | Day-specific information |

### 5.3 Clarify

| Tool | Purpose |
|---|---|
| `draft_clarification(item_id, draft \| null, reason)` | §3.4; `null` removes it |
| `clarify(item_id, decision)` | The human said what it is |
| `file(text, decision)` | Capture and clarify in one — "I'm waiting on Alice for the video, add it"; one log entry |

`decision` mirrors the four steps: `trash` · `someday(bucket?)` ·
`reference(kind, url?, body?, project?)` · `later(text, project)` ·
`action(text, project?, route)` with `route` = `done` · `waiting(who, follow_up?)` ·
`next(context, priority, time, energy, deadline?)` · `calendar(day, start?, end?)`.
`project` is an id or `{new: title}` — projects are still born only through Clarify (and
`file`). All Clarify rules apply (a parked project takes no next action, …).

### 5.4 Do

| Tool | Purpose |
|---|---|
| `complete(ids)` · `reopen(id)` | |
| `set_focus(ids, on)` | |
| `edit_next_action(id, fields)` | Text, context, priority, time, energy, deadline, project |
| `time_block(id, start, end)` · `clear_time_block(id)` | |
| `trash(ids)` | Any open item |

### 5.5 Waiting

| Tool | Purpose |
|---|---|
| `follow_up(id)` | The chase action, as `f` |
| `received(id)` | |
| `edit_waiting(id, who?, follow_up?)` | |

### 5.6 Projects, Someday, Reference

| Tool | Purpose |
|---|---|
| `add_action(project, text, fields)` · `add_step(project, text)` · `promote(id, fields)` · `demote(id)` | |
| `update_project(id, title?, successful_when?, area?, deadline?, notes?)` | |
| `move_project(id, someday \| active \| completed)` | |
| `activate(id)` · `drop(id)` · `set_bucket(id, bucket)` | Someday/Maybe |
| `add_reference(text, kind, url?, body?, project?)` · `edit_reference(id, …)` | |

### 5.7 Weekly review

| Tool | Purpose |
|---|---|
| `prepare_weekly_review` | Findings per template step: inbox and age, stalled projects, overdue waiting-fors, deadlines in 14 days, someday items untouched > 90 days, last week's numbers, what clients did this week |
| `get_review_state` · `start_review` · `tick_step(step, on)` · `set_review_notes(step, text)` · `finish_review` | |

### 5.8 Trust

| Tool | Purpose |
|---|---|
| `get_activity(since?, actor?, item?)` | |
| `undo(entry_id)` | |
| `whoami` | Client name, preset, allowed tools |

## 6. Guided workflows (MCP prompts)

The agent records decisions as they are made, so an interrupted workflow loses nothing.

| Workflow | How the agent leads |
|---|---|
| Weekly review with me | `prepare_weekly_review` → `start_review`; per step: the findings, one question at a time, record each answer, a short note, tick on "next"; `finish_review` and a summary of what changed. Resumable via `get_review_state` |
| Work through my inbox | Per item: `search` for related, rewrite the outcome by GTD rules, `draft_clarification`. Ends with "n drafts ready — open Clarify". Never files |
| Plan my day | `get_overview`, `get_calendar(today)`, `find_free_time`; proposes focus and blocks in chat; on yes `set_focus`, `time_block` |
| What should I do now? | Where, how much time, what energy → `list_next_actions` → one to three with a reason |
| Who owes me what | `list_waiting(overdue)` with context; offers a nudge (drafted in the mail tool); `follow_up` / `edit_waiting` |
| Stalled projects | `list_projects(stalled)`: next step, park, or done? → record |
| Meeting notes → inbox | Split into `capture(items[])`; with the user, file the obvious ones via `file` |

## 7. Open, for the iteration after real use

- Which workflows get used, which tools the agents misuse or never call.
- Whether drafts are taken as they are (~80 % hoped) or need more fields.
- Whether a read-only client is needed at all.
- Whether a remote MCP transport is wanted.
