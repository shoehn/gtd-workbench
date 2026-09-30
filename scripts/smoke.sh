#!/usr/bin/env bash
# pnpm smoke — build the image, run it on a throw-away volume, capture an item through the UI,
# restart the container and check the item is still there; then take one backup.
set -euo pipefail
cd "$(dirname "$0")/.."

tag=gtd-workbench:smoke
name=gtd-smoke-$$
volume=gtd-smoke-$$
port=${SMOKE_PORT:-3999}
text="Smoke test $$ @calls"

cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker volume rm "$volume" >/dev/null 2>&1 || true
}
trap cleanup EXIT

wait_healthy() {
  for _ in $(seq 1 60); do
    if curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "smoke: the app did not become healthy"; docker logs "$name" | tail -20; exit 1
}

echo "smoke: building $tag"
docker build -q -t "$tag" . >/dev/null
docker volume create "$volume" >/dev/null
docker run -d --name "$name" -p "127.0.0.1:$port:3000" -v "$volume:/data" "$tag" >/dev/null
wait_healthy

health=$(curl -fsS "http://127.0.0.1:$port/api/health")
echo "smoke: fresh start $health"
echo "$health" | grep -q '"store":"sqlite","items":0' || { echo "smoke: expected an empty sqlite store"; exit 1; }

node scripts/smoke-capture.mjs "http://127.0.0.1:$port" "$text"

docker restart "$name" >/dev/null
wait_healthy
curl -fsS "http://127.0.0.1:$port/inbox" | grep -q "Smoke test $$" \
  || { echo "smoke: the captured item is gone after the restart"; exit 1; }
echo "smoke: item survived the restart"

docker exec "$name" node scripts/backup.mjs
docker exec "$name" sh -c 'ls /data/backups/gtd-*.db' >/dev/null
echo "smoke: ok"
