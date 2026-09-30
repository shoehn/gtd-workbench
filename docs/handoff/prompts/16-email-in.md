# 16 · Email-in and share-in: more ways into the inbox

Reference: SPEC §3.1 (`source`: typed | voice | email | share | scan), the capture api.
Principle unchanged: capture never asks questions. Every channel here ends in
`api.capture(line, source, attachments?)` and nothing else.

## Do

1. **Capture endpoint** `POST /api/capture` with a bearer token (`CAPTURE_TOKEN` env;
   one token, rotate by restart). Body: `{ text, source?, url?, note? }`. Returns the
   created item. Rate-limited (60/min) and size-limited (4 KB text). This one endpoint
   serves every channel below and any future one (a shell alias, an iOS Shortcut, the
   GTD MCP server you already run).
2. **Email-in** — pick the simplest that fits the homelab: (a) IMAP poll of a dedicated
   mailbox every 2 min (`imapflow`), or (b) an inbound webhook if a mail service with
   HTTP delivery is available. Default to (a). Subject becomes the item text (strip
   `Fwd:`/`Re:`/`AW:`/`WG:` prefixes but keep them in `captured`); the first 2 KB of the
   plain-text body goes into `Item.reference.body` as context, not into the text; the
   message id is stored so a re-poll never duplicates; the mail is moved to a
   `Processed` folder, never deleted. `source = 'email'`. Sender whitelist from env
   (`CAPTURE_MAIL_FROM`, comma-separated); anything else is ignored and counted.
3. **Share-in** — a Web Share Target: `manifest.webmanifest` with `share_target`
   pointing at `/share` (`POST`, `multipart/form-data`, fields title/text/url), and a
   minimal service worker so the app is installable on Android and desktop Chrome.
   `/share` calls the capture endpoint (same-origin, no token needed) and shows a
   one-line confirmation with "Clarify now" and "Done" (`source = 'share'`; a shared
   URL goes to `reference.url`, the page title becomes the text).
4. **Inbox**: the source column already exists; add a small icon per source (inline
   SVG) next to the mono label and a filter chip row "all · typed · email · share".
5. **Health**: `/api/health` reports last mail poll time and error; Settings shows the
   mailbox status like a calendar source.
6. **Docs**: `docs/OPERATIONS.md` gains the env vars, the mailbox setup, an example
   `curl` for the endpoint and an example iOS Shortcut description.
7. **Tests**: mail parser tests on three fixtures (plain, HTML-only, forwarded with
   attachments — attachments are ignored, a count is kept), dedupe test, share handler
   test, endpoint auth/rate-limit tests.

## Don't

- No attachment storage, no HTML rendering, no reply/auto-responder, no parsing of
  the body for tasks, no AI. Voice and scan stay placeholders (`source` values only).

## Definition of done

- Forwarding a mail to the mailbox produces one inbox item within one poll with the
  cleaned subject as text and the body preview visible in Clarify's item card;
  forwarding it again produces nothing.
- Sharing a page from Android Chrome creates an item with the URL attached.
- `curl -H 'Authorization: Bearer …' -d '{"text":"Call Lena @calls"}' /api/capture`
  creates the item with @calls parsed.
