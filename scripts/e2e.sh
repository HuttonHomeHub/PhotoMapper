#!/bin/sh
# End-to-end tests: builds the Docker image from this checkout, starts it on a
# throwaway network with an in-memory /config (ALLOW_RESET on, test data only), as
# host "photomapper" (not "app": browsers force the .app domain onto HTTPS), and
# runs the Playwright tests (e2e/) from the pinned Playwright image against it.
# Needs Docker and an installed node_modules (scripts/check.sh does both).
set -eu
cd "$(dirname "$0")/.."

PLAYWRIGHT_IMAGE=mcr.microsoft.com/playwright:v1.65.1-noble
name="photomapper-e2e-$$"
image="photomapper:e2e"

cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker network rm "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "e2e: building the image"
docker build -q --build-arg APP_VERSION=e2e -t "$image" . >/dev/null
docker network create "$name" >/dev/null
docker run -d --name "$name" --network "$name" --network-alias photomapper \
  -e TZ=Europe/London -e ALLOW_RESET=true --tmpfs /config "$image" >/dev/null

echo "e2e: waiting for /health"
i=0
until docker exec "$name" node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    docker logs "$name"
    echo "e2e: the app did not become healthy" >&2
    exit 1
  fi
  sleep 1
done

docker run --rm --network "$name" --user "$(id -u):$(id -g)" -e HOME=/tmp \
  -e BASE_URL=http://photomapper:3001 -v "$PWD":/app -w /app "$PLAYWRIGHT_IMAGE" \
  npx playwright test "$@"
