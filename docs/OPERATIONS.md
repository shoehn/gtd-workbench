# Operations

One image, one volume, one command. The app has no auth and no TLS of its own: run it
behind a reverse proxy — on a trusted network, or with a login at the proxy (see
"Reachable from outside").

## Run

On the machine that will run it (the image is built for that machine's architecture —
check with `uname -m`; no multi-arch images are built):

```sh
git clone … gtd-workbench && cd gtd-workbench
docker compose up -d --build
docker compose ps            # gtd: healthy
curl -s 127.0.0.1:3000/api/health
# {"ok":true,"store":"sqlite","items":0,"version":"0.1.0"}
```

On the first start the database `/data/gtd.db` is created, migrated and filled with the
**base seed** only — contexts, Someday buckets and the weekly-review template, no demo
data. The log says so once:

```
… info  store: sqlite /data/gtd.db — new database, base seed applied
```

Update: see "Releases" below — check out a release tag, build, start. Migrations run on start.

## Configuration

Everything comes from the environment. `compose.yaml` passes these through; put
overrides in a `.env` file next to it — start from `.env.example`, which lists them all.

| Variable | Default | Meaning |
|---|---|---|
| `STORE` | `sqlite` (production), `memory` (dev, tests) | Which store the app uses |
| `DATABASE_FILE` | `/data/gtd.db` in the image, `data/gtd.db` locally | The SQLite file |
| `PORT` | `3000` | Port inside the container |
| `TZ` | `Europe/Zurich` | Time zone for "today", midnight (focus stars), overdue and backup names |
| `LOG_LEVEL` | `info` | `error`, `warn`, `info` or `debug` |
| `GTD_PORT` | `3000` | compose only: host port, bound to `127.0.0.1` |
| `BACKUP_KEEP` | `14` | compose only: backups kept |
| `BACKUP_DIR` | `<dir of DATABASE_FILE>/backups` | where `db:backup` writes |
| `CAPTURE_TOKEN` | — (endpoint off) | Bearer token for `POST /api/capture` |
| `CAPTURE_MAIL_*` | — (no mailbox) | the capture mailbox, see below |

## Calendars (read-only)

Each external calendar is a group of variables; the `<ID>` is any name in capitals:

```sh
# a published .ics link (Outlook / Exchange / Google "publish calendar"; webcal:// works)
CAL_WORK_URL=https://calendar.example.com/published/work.ics
# a CalDAV calendar: the calendar collection's own URL, with basic auth
CAL_HOME_URL=https://dav.example.com/calendars/me/home/
CAL_HOME_USER=me
CAL_HOME_PASS=…            # an app password where the server offers one
# optional: CAL_<ID>_NAME (shown name), CAL_<ID>_KIND=ics|caldav (default: caldav when a user is set)
```

Put them in `.env` next to `compose.yaml`; the `gtd` service reads that file. The app syncs today −7 … +60 days at start, every 15
minutes and on "Sync now" in Settings. A failed sync shows as a warning in the calendar
footer and on Settings; the last good events stay.

Privacy: only title, start, end, all-day flag, location and calendar name are stored — no
descriptions, no attendees. Credentials stay in the environment; the database and the logs
never contain them. Nothing is written back to any calendar.

## Capture from outside: endpoint, mail, share

Three more ways into the inbox. All of them only capture — they never ask, and the item
waits in the inbox for Clarify like anything typed.

### Endpoint

```sh
CAPTURE_TOKEN=…            # a long random string, e.g. `openssl rand -hex 32`; unset = endpoint off
```

```sh
curl -H "Authorization: Bearer $CAPTURE_TOKEN" \
     -d '{"text":"Call the shop @calls"}' https://gtd.example.lan/api/capture
# 201 {"id":"…","text":"Call the shop","context":"@calls","source":"typed",…}
```

Body: `text` (required, ≤ 4 KB, the rapid-log shorthand works), `source` (`typed`
default, or `voice` `email` `share` `scan`), `url` and `note` (kept with the item as
context). 401 without the token (429 past 20 such requests a minute), 429 past 60 captures a minute, 413 for a body over 16 KB.
To rotate the token, change it and restart.

A shell function (needs `jq`), then `in Call the shop @calls`:

```sh
in() { curl -s -H "Authorization: Bearer $CAPTURE_TOKEN" --json "$(jq -n --arg t "$*" '{text: $t}')" https://gtd.example.lan/api/capture >/dev/null; }
```

**iOS Shortcut** ("Capture to GTD"): *Ask for Input* (Text, prompt "Capture") → *Get
Contents of URL*: URL `https://gtd.example.lan/api/capture`, Method POST, Headers
`Authorization: Bearer <token>`, Request Body JSON with one field `text` = *Provided Input*.
Add it to the Home Screen or the Action Button; from the Share Sheet, turn on "Show in Share
Sheet", accept URLs and Text, and send `text` = *Shortcut Input* (a page's title arrives
as its URL; that is fine — Clarify shows it).

### Mail

A dedicated mailbox (an alias of your provider, or a separate account): forward or send to
it, and each mail becomes one inbox item — the subject (without `Fwd:` `Re:` `AW:` `WG:`) as
the text, the start of the body as context in Clarify. Attachments are not kept; the mail
moves to a `Processed` folder (created on the first poll) and stays there.

```sh
CAPTURE_MAIL_HOST=imap.example.com
CAPTURE_MAIL_PORT=993            # default 993 with TLS, 143 without
CAPTURE_MAIL_TLS=true            # false only for a local test server
CAPTURE_MAIL_USER=inbox@example.com
CAPTURE_MAIL_PASS=…              # an app password where the provider offers one
CAPTURE_MAIL_FROM=me@example.com,me@work.example   # who may capture; required
# optional: CAPTURE_MAIL_FOLDER=INBOX, CAPTURE_MAIL_PROCESSED=Processed
```

Polled at start, every 2 minutes and on "Poll now" in Settings. Mail from any other
sender stays in the mailbox untouched and is counted on Settings. The sender check reads
the From header, which anyone can fake: keep the mailbox address to yourself. A mail is
captured once — a re-poll skips Message-IDs it has seen, and forwarding the same mail again
while the first copy is still in the inbox captures nothing. A failed poll shows on Settings
and in `/api/health`; the next good poll clears it.

### Share

The app is installable (Chrome on Android and desktop: "Install app" / "Add to Home
screen"; it needs HTTPS, so through the reverse proxy). Installed, it appears in the share
sheet: sharing a page puts its title in the inbox with the link attached, and a one-line
confirmation offers "Clarify now" or "Done". iOS Safari has no Web Share Target — use the
Shortcut above.

## Reverse proxy

The container listens on `127.0.0.1:${GTD_PORT}` of the host only. Caddy on the same box:

```
gtd.example.lan {
  reverse_proxy 127.0.0.1:3000
}
```

With **Traefik in Docker** (and Authelia as its forwardAuth middleware), use
`compose.traefik.yaml`: it takes the `gtd` service off the host's ports, puts it on
Traefik's network and adds the router labels, with an http → https redirect for this host
(no global redirect is assumed). On the server:

```sh
cp compose.traefik.yaml compose.override.yaml   # git-ignored; docker compose reads it by itself
# in .env: GTD_HOST, and TRAEFIK_NETWORK / _ENTRYPOINT / _HTTP_ENTRYPOINT / _CERTRESOLVER /
#          _AUTH_MIDDLEWARE where yours differ from proxy / websecure / web / letsencrypt /
#          authelia@docker
docker compose config >/dev/null && docker compose up -d --build
```

`docker compose config` fails with a clear message while `GTD_HOST` is unset. Without a
certificate resolver (a wildcard certificate in Traefik's file provider), delete the
`certresolver` label in your copy.

### Reachable from outside: login at the proxy

The app has no login of its own. On a LAN that is fine; once it is reachable from the
internet (needed for the phone away from home, and for sharing, which wants HTTPS), put an
authenticating proxy in front — Authelia, Authentik, oauth2-proxy or Caddy `basic_auth`.
The app needs no change for that: it uses relative URLs only, knows nothing about users, and
does not read any auth header.

What the proxy must get right:

- **Bypass, no login** — these are fetched by clients that cannot do a login page:
  - `POST /api/capture` — scripts, Shortcuts, n8n; it has its own bearer token.
  - `/manifest.webmanifest`, `/icon.svg`, `/icon-192.png`, `/icon-512.png`, `/sw.js` — the
    browser fetches the manifest without cookies; behind a login it gets a redirect and the
    app is neither installable nor a share target. They contain no data.
- **Everything else behind the login**, `/share` included: a share comes from the installed
  app with the login cookie. If the session has expired, the share ends on the login page
  and its content is lost — choose a session that lasts (Authelia: "remember me").
- **`/api/health`** needs no bypass: the container healthcheck calls it on 127.0.0.1. Bypass
  it only for an outside monitor; it reveals the item count.
- **Pass `Host` (or `X-Forwarded-Host`) through unchanged.** Server actions — every write in
  the app — compare the browser's `Origin` with it and refuse a mismatch. Caddy, Traefik and
  nginx with `proxy_set_header Host $host` do this.

Authelia, for example (the order matters, the first match wins):

```yaml
access_control:
  rules:
    - domain: gtd.example.com
      resources:
        - '^/api/capture$'
      methods: [POST]
      policy: bypass
    - domain: gtd.example.com
      resources:
        - '^/manifest\.webmanifest$'
        - '^/icon(-\d+)?\.(svg|png)$'
        - '^/sw\.js$'
      policy: bypass
    - domain: gtd.example.com
      policy: two_factor
```

Then check from outside: `curl -s -o /dev/null -w '%{http_code}' https://gtd.example.com/inbox`
answers with the proxy's redirect (302/401), `…/manifest.webmanifest` with 200, and the
capture `curl` above with 201.

## Health

`GET /api/health` → `200 {"ok":true,"store":"sqlite","items":n,"mail":…,"version":"…"}`, or
`500` with `ok: false` and the error when the database cannot be opened. `mail` is `null`
without a capture mailbox, else `{"lastPollAt":"…","lastError":null}` — reported, never
judged: a failing mailbox does not make the app unhealthy. The image's
`HEALTHCHECK` and the compose healthcheck call it every 30 s.

## Backup

The `gtd-backup` service takes a backup when it starts and then every 24 hours:
`/data/backups/gtd-YYYYMMDD-HHMM.db`, the newest 14 are kept. It uses SQLite's online
backup, so the app keeps running. A backup by hand:

```sh
docker compose exec gtd node scripts/backup.mjs
docker compose exec gtd ls /data/backups
```

Copy backups off the box, e.g. nightly:

```sh
docker compose cp gtd:/data/backups ./backups
```

## Releases

Every release has one version: `package.json` (what `/api/health` reports) and the image tag
of both services in `compose.yaml` (`gtd-workbench:<version>`), and a git tag `v<version>`.
`pnpm release <x.y.z>` sets all of them, commits and tags (it never pushes, and refuses a
version that is already tagged — a release is never rebuilt under its old tag). Then
`git push && git push origin v<x.y.z>`.

On the server:

```sh
git fetch --tags && git checkout v0.1.1
docker compose build                      # gtd-workbench:0.1.1, nothing restarts yet
docker compose exec gtd node scripts/backup.mjs   # a backup right before, by the running version
docker compose up -d                      # the new version starts, migrations run
curl -s 127.0.0.1:3000/api/health         # "version":"0.1.1"
```

Images are not in your file backup, the tags are: any release can be rebuilt with
`git checkout v<x.y.z> && docker compose build`.

**Rolling back** to an older release: if the newer one added a migration (`drizzle/`
gained a file between the two tags), the older version cannot read the database any more —
restore the backup taken right before the upgrade (below) together with the rollback. Without
a new migration, `git checkout v<older> && docker compose up -d` is enough.

## Restore

Stop, copy, start (replace the file name with the backup you want):

```sh
docker compose stop gtd gtd-backup
docker compose run --rm --no-deps --entrypoint sh gtd -c \
  'cp /data/backups/gtd-20261001-0300.db /data/gtd.db && rm -f /data/gtd.db-wal /data/gtd.db-shm'
docker compose start gtd gtd-backup
curl -s 127.0.0.1:3000/api/health
```

The `-wal` / `-shm` files belong to the replaced database and must go with it.

## Smoke test

```sh
pnpm smoke
```

Builds the image, starts it on a throw-away volume, checks it starts empty, captures an
item through the UI (installed Chrome, driven by `playwright-core`; `CHROME_PATH`
overrides), restarts the container, checks the item is still there and takes a backup.
Needs Docker and Chrome on the machine that runs it.

## Local development

| Command | What |
|---|---|
| `pnpm dev` | memory store with the demo data on today's real date; a restart resets it |
| `pnpm dev:demo` | the same on the demo's pinned date (sat 26.09), as in the mockups and screenshots |
| `STORE=sqlite pnpm dev` | the SQLite file `data/gtd.db` |
| `pnpm db:reset` | delete `data/gtd.db`, migrate, fill with the demo data |
| `pnpm db:seed` | replace the contents of `data/gtd.db` with the demo data |
| `pnpm db:backup` | a backup of `data/gtd.db` into `data/backups/` |
| `pnpm build && node .next/standalone/server.js` | the production server as in the image |
