#!/bin/sh
set -e

# Runs as root, fixes ownership of the data dir, then drops to PUID:PGID and execs
# the app. This lets a plain bind mount (which arrives with the host's ownership)
# work without a manual chown — matching the linuxserver/hotio images the rest of
# a typical self-hosted stack relies on. `exec gosu` keeps the app as PID 1 so
# SIGTERM still reaches it for graceful shutdown.
PUID="${PUID:-1000}"
PGID="${PGID:-1000}"

# Same resolution as server/paths.ts: the standard name, then the old name, then a
# default inside DATA_DIR (/config in the image).
DATA_DIR="${DATA_DIR:-/config}"
DB_DIR="$(dirname "${DB_PATH:-${PHOTOS_DB_PATH:-$DATA_DIR/photos.db}}")"
UPLOADS="${UPLOADS_DIR:-$DATA_DIR/uploads}"

mkdir -p "$DB_DIR" "$UPLOADS"

# Non-recursive on purpose: /config/uploads can hold a large photo library, so we
# only fix the directories themselves (enough for the app to create/read/delete).
# Files the app writes are already owned by the run user. To adopt a pre-existing
# library owned by another uid, chown -R it once by hand.
chown "$PUID:$PGID" "$DATA_DIR" "$DB_DIR" "$UPLOADS" 2>/dev/null || true

# If already running unprivileged (e.g. compose `user:` override), just exec.
if [ "$(id -u)" != "0" ]; then
  exec "$@"
fi

exec gosu "$PUID:$PGID" "$@"
