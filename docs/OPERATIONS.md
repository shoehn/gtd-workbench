# Operations

One image, one volume, one command. The app has no auth and no TLS of its own: run it
behind a reverse proxy on a trusted network.

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

Update: `git pull && docker compose up -d --build`. Migrations run on start.

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

## Reverse proxy

The container listens on `127.0.0.1:${GTD_PORT}` of the host only. Caddy on the same box:

```
gtd.example.lan {
  reverse_proxy 127.0.0.1:3000
}
```

With Traefik in Docker, remove `ports` from the `gtd` service, put both on one network and
use the labels commented in `compose.yaml`.

## Health

`GET /api/health` → `200 {"ok":true,"store":"sqlite","items":n,"version":"…"}`, or `500`
with `ok: false` and the error when the database cannot be opened. The image's
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
| `pnpm dev` | memory store with the demo data; a restart resets it |
| `STORE=sqlite pnpm dev` | the SQLite file `data/gtd.db` |
| `pnpm db:reset` | delete `data/gtd.db`, migrate, fill with the demo data |
| `pnpm db:seed` | replace the contents of `data/gtd.db` with the demo data |
| `pnpm db:backup` | a backup of `data/gtd.db` into `data/backups/` |
| `pnpm build && node .next/standalone/server.js` | the production server as in the image |
