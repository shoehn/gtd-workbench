# 10 · Deploy: container, data volume, backup

Reference: `CLAUDE.md`, SPEC §5, the store selector from step 09. Goal: one image, one
volume, one command on the homelab box; no cloud services.

## Do

1. **Dockerfile**, multi-stage: `pnpm install --frozen-lockfile` → `pnpm build` with
   `output: 'standalone'` in `next.config` → runtime image on `node:<version from
   .nvmrc>-slim` running as a non-root user, `STORE=sqlite`, `DATABASE_FILE=/data/gtd.db`,
   `PORT=3000`. better-sqlite3's prebuilt binary must match the runtime Node major; pin
   both in one place and fail the build if they differ.
2. **compose.yaml**: service `gtd`, named volume `gtd-data` mounted at `/data`,
   `restart: unless-stopped`, healthcheck on `GET /api/health` (add the route: returns
   `{ ok, store, items, version }` and 500 if the database cannot be opened).
   No ports published on the host beyond what the reverse proxy needs; document the
   Traefik/Caddy labels as comments, not as a hard dependency.
3. **First boot**: an empty `/data/gtd.db` is created and migrated automatically and
   seeded from `seed.base.json` only (contexts, buckets, review template) — never the
   demo data. Log one line saying which seed was applied.
4. **Backup**: `scripts/backup.sh` runs `sqlite3 .backup` (or better-sqlite3's
   `backup()` via a `pnpm db:backup` script) into `/data/backups/gtd-YYYYMMDD-HHMM.db`,
   keeps the last 14, and is invoked by a second compose service `gtd-backup` on a
   daily cron (`ofelia` or a plain `sleep` loop — simplest wins). Restoring = stop,
   copy file, start; write that in `docs/OPERATIONS.md` with the exact commands.
5. **Config**: every runtime setting from env, listed in `docs/OPERATIONS.md` with
   defaults: `STORE`, `DATABASE_FILE`, `PORT`, `TZ` (default `Europe/Zurich`; the
   "today"/midnight logic must use it), `LOG_LEVEL`.
6. **Smoke test**: `scripts/smoke.sh` builds the image, starts it with a temp volume,
   captures an item through the UI's server action (curl to the route or a tiny
   Playwright script), restarts the container, and asserts the item is still there.
   `pnpm smoke` runs it; CI later.

## Don't

- No auth, no TLS in the container (the proxy does that), no multi-arch unless the
  homelab box is arm64 — check `uname -m` first and build for that only.

## Definition of done

- `docker compose up -d` on a clean box serves the app with empty lists and zero counts.
- `pnpm smoke` passes; a captured item survives `docker compose restart`.
- A backup file appears after the first backup run and restores per OPERATIONS.md.
