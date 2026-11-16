# Deployment & Security Guide

> Status: **required reading before any production deployment.**
> Authentication for PhotoMapper is enforced at the **reverse proxy**, not in the
> application (see ADR-0007). The Node process assumes every request that reaches
> it is already authenticated. **If you expose the Node port directly to the
> internet, the app is completely open** — all photos, uploads, and the data-reset
> endpoint become public. Always put it behind the proxy described here.

## Architecture

```
Internet ──HTTPS──▶ Reverse proxy (TLS + auth) ──HTTP(localhost)──▶ Node app :3001
                     nginx / Caddy / access proxy                   (never exposed publicly)
```

- The Node app binds `PORT` (default 3001) on the host only.
- The proxy terminates TLS, performs authentication, and forwards to the app.
- Bind the app to loopback in production (e.g. run behind the proxy on the same
  host, firewall the port, or use a container network) so it is unreachable
  except via the proxy.

## Minimum requirements (all must be true in production)

1. **TLS** at the proxy (Let's Encrypt or equivalent). Redirect HTTP→HTTPS. (SEC-11)
2. **Authentication** at the proxy covering **every** path, including `/uploads/*`
   and `/api/*`. HTTP Basic auth is the simplest; an SSO/access proxy is better
   if available. (SEC-01, SEC-03)
3. **The Node port is not publicly reachable** (firewall / loopback / container net).
4. **`ALLOW_RESET` is unset** (or `false`) unless you deliberately need the
   destructive reset endpoint. (SEC-02)

## Example: nginx with Basic auth + TLS

```nginx
# /etc/nginx/.htpasswd created with:  htpasswd -c /etc/nginx/.htpasswd operator
server {
    listen 443 ssl;
    server_name photomapper.example.com;

    ssl_certificate     /etc/letsencrypt/live/photomapper.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/photomapper.example.com/privkey.pem;

    # Authentication for the entire app, including /uploads and /api
    auth_basic           "PhotoMapper";
    auth_basic_user_file /etc/nginx/.htpasswd;

    client_max_body_size 60m;   # keep in step with the app upload cap (SEC-07)

    location / {
        proxy_pass         http://127.0.0.1:3001;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name photomapper.example.com;
    return 301 https://$host$request_uri;
}
```

### Behind Cloudflare: restore the real client IP in nginx

With Cloudflare in front of nginx, the request reaches nginx from a Cloudflare server, so
`$remote_addr` (and the last `X-Forwarded-For` entry) is Cloudflare's IP, not the visitor's.
Restore the visitor's IP once, in nginx, and pass only that on. The app then trusts exactly
one hop (`TRUST_PROXY=1`). Crane Charts runs behind the same proxy and is set up the same way.

```nginx
# /etc/nginx/conf.d/cloudflare-realip.conf (http context, shared by every site)
# Cloudflare's ranges: https://www.cloudflare.com/ips-v4 and /ips-v6. Refresh when they change.
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
set_real_ip_from 2400:cb00::/32;
set_real_ip_from 2606:4700::/32;
set_real_ip_from 2803:f800::/32;
set_real_ip_from 2405:b500::/32;
set_real_ip_from 2405:8100::/32;
set_real_ip_from 2a06:98c0::/29;
set_real_ip_from 2c0f:f248::/32;
real_ip_header CF-Connecting-IP;
```

In each app's `location`, send the restored address as the only forwarded hop. Use
`$remote_addr`, not `$proxy_add_x_forwarded_for`, so a client can't prepend fake entries:

```nginx
proxy_set_header X-Real-IP       $remote_addr;
proxy_set_header X-Forwarded-For $remote_addr;
proxy_set_header X-Forwarded-Proto $scheme;
```

`CF-Connecting-IP` is only trusted from the listed Cloudflare ranges. A request that reaches
nginx directly (for example from the LAN) keeps its own address.

### Example: Caddy (auto-TLS)

```
photomapper.example.com {
    basic_auth {
        operator JDJhJDE0J...   # `caddy hash-password` output
    }
    reverse_proxy 127.0.0.1:3001
}
```

## What the app still does (defense-in-depth, not a substitute for the proxy)

- **Reset endpoint is gated** by `ALLOW_RESET` (default off) → `DELETE /api/reset`
  returns 403 unless explicitly enabled. (SEC-02)
- **Security headers** via helmet + CSP (SEC-09), **CORS allowlist** off by default
  (SEC-04), **per-IP rate limiting** on `/api` (SEC-07), and **generic error
  messages** in production (SEC-08) are all enforced in-app.

## Health checks (OPS-04)

- `GET /health` — liveness; returns `200 {"status":"ok"}` without touching the
  database. Use it for container/orchestrator liveness probes.
- `GET /ready` — readiness; runs a trivial DB query and returns `503` if the
  database is unreachable, `200 {"status":"ready"}` otherwise.

Both sit outside `/api`, so they are not rate-limited. Behind the proxy they are
covered by the same auth as everything else; the container's own `HEALTHCHECK`
hits the app directly on loopback inside the container, so proxy auth does not
interfere with it.

## Running with Docker (OPS-02)

A multi-stage `Dockerfile` and `docker-compose.yml` are provided.

```bash
docker compose up -d --build      # build image, start in the background
docker compose logs -f app        # tail logs
docker compose down               # stop (waits up to stop_grace_period for drain)
```

Key points:

- **Data persistence** — a named volume `photomapper-config` is mounted at `/config`
  (the shared container standard); the image sets `DATA_DIR=/config`, so the
  database (`/config/photos.db`) and uploads (`/config/uploads`) live there and
  survive rebuilds. `DB_PATH` and `UPLOADS_DIR` override them if you want a
  different layout. Backups are written inside it by default — see Backups (OPS-03) below.
- **Loopback only** — compose publishes `127.0.0.1:3001:3001`, so the Node port is
  never exposed to the internet directly. Point your reverse proxy (above) at
  `127.0.0.1:3001`. If the proxy runs in its own container, put both on a shared
  Docker network and drop the published port entirely.
- **Non-root + PUID/PGID** — the entrypoint starts as root only to `chown` the data directories
  to `PUID:PGID` (default `1000:1000`), then drops privileges via `gosu` and runs
  the app as that user. So a bare bind mount works without a manual chown, and you
  can set `PUID`/`PGID` like the rest of a typical stack.
- **Graceful shutdown** — `stop_grace_period: 15s` gives the app's SIGTERM handler
  (OPS-05, 10 s force-exit guard) time to drain in-flight requests and close the
  DB before the container is killed.
- **Health** — the container `HEALTHCHECK` probes `GET /health` (OPS-04).

Override configuration via the compose `environment:` block or a
`docker compose --env-file` file (do **not** commit real secrets). TLS and auth
still terminate at the reverse proxy in front of the container (ADR-0007).

### Pre-built image from GHCR

The `.github/workflows/publish-image.yml` workflow builds and pushes the image to
GitHub Container Registry on every release (a merge into `main`), so you can pull
instead of building. Each release is tagged with its version (`X.Y.Z` and `X.Y`),
`latest` and `sha-<short>`:

```
ghcr.io/huttonhomehub/photomapper:latest
ghcr.io/huttonhomehub/photomapper:1.1.0   # pin a version to control upgrades
```

Compose snippet (mirrors a typical self-hosted stack):

```yaml
photomapper:
  container_name: photomapper
  image: ghcr.io/huttonhomehub/photomapper:latest
  ports:
    - 127.0.0.1:3001:3001 # loopback only — the reverse proxy fronts it (no in-app auth)
  environment:
    - PUID=1000
    - PGID=1000
    - TZ=Europe/London
    - NODE_ENV=production
    - TRUST_PROXY=1 # one hop: nginx (which restores the real client IP from Cloudflare)
    - LOG_LEVEL=warn # quieter logs (drop the per-request info lines)
    # - ALLOWED_ORIGINS=https://photos.example.com
    # - ALLOW_RESET=false
  volumes:
    - /apps/photomapper/config:/config # holds photos.db + uploads
  restart: unless-stopped
```

Notes:

- **No manual chown needed** — the entrypoint chowns `/config` to `PUID:PGID` at
  startup (like linuxserver/hotio images), so a bare bind mount just works. `PUID`/
  `PGID` default to `1000` if unset. (One edge case: to adopt a _pre-existing_ photo
  library owned by a different uid, `chown -R` it once — the startup chown is
  non-recursive so it stays fast as the library grows.)
- **Package visibility** — GHCR packages are **private by default**. Either make the
  package public (repo → Packages → the image → Package settings → change visibility)
  for anonymous pulls, or `docker login ghcr.io` on the host with a token that has
  `read:packages`.
- **First publish** — if the workflow's push step 403s, allow Actions to write
  packages: repo Settings → Actions → General → Workflow permissions → _Read and
  write permissions_ (the workflow already requests `packages: write`).

## Environment variables

| Var           | Default                | Purpose                                                                                                                                                                                                                                                |
| ------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PORT`        | `3001`                 | App listen port (keep behind the proxy).                                                                                                                                                                                                               |
| `DATA_DIR`    | `/config` in the image | Where all state lives (shared container standard).                                                                                                                                                                                                     |
| `DB_PATH`     | `$DATA_DIR/photos.db`  | SQLite file location (OPS-03). Replaces `PHOTOS_DB_PATH`, which still works and logs a deprecation warning.                                                                                                                                            |
| `UPLOADS_DIR` | `$DATA_DIR/uploads`    | Uploaded-image + thumbnail directory.                                                                                                                                                                                                                  |
| `APP_VERSION` | `dev`                  | Release version, set at build time; reported at `/health` and `/version`.                                                                                                                                                                              |
| `ALLOW_RESET` | _unset_                | Set to `true` only if you want `DELETE /api/reset` enabled.                                                                                                                                                                                            |
| `NODE_ENV`    | _unset_                | `production` in prod; `test` is used by the test suite.                                                                                                                                                                                                |
| `TRUST_PROXY` | _(off)_                | Proxy hops in front whose forwarded headers are trusted: `1` when nginx restores the real client IP (see "Behind Cloudflare"). `true` means 1; anything but a hop count stops startup. Makes `req.ip`, rate-limiting and protocol use the real client. |
| `LOG_LEVEL`   | `info`                 | pino level; set `warn` to drop per-request access logs.                                                                                                                                                                                                |

> Full config reference is in `.env.example` and validated in `server/config.ts` (OPS-07).

## Backups (OPS-03)

PhotoMapper backs itself up, the same way as Crane Charts (the shared kit):

- **What:** one zip per backup, holding a consistent snapshot of the database (SQLite's
  online backup, safe while the app runs) and the `uploads/` folder
  (`BACKUP_INCLUDE_UPLOADS=0` leaves uploads out).
- **When:** every `BACKUP_INTERVAL_HOURS` (default 24; the first five minutes after
  start), and on demand with `POST /api/backup`. `BACKUP_ENABLED=0` turns the schedule
  off, e.g. if a host cron calls `POST /api/backup` instead.
- **Where:** `BACKUP_DIR`, default `/config/backups`, keeping the newest `BACKUP_KEEP`
  (default 7) of each kind. **That is on the same disk as the data.** For copies that
  survive losing the host, mount `BACKUP_DIR` from another disk or a NAS share, e.g.
  `- /mnt/nas/photomapper-backups:/backups` with `BACKUP_DIR=/backups`, or download a
  backup (`GET /api/backup/download`) and keep it elsewhere.
- **Health:** `GET /api/backup` reports the last success, the last error and the next
  run, so a failing nightly backup is visible, not just logged.

**Restore** (`POST /api/backup/restore`, a backup by name or an uploaded zip) checks
the archive before touching anything: entry names, sizes against `MAX_RESTORE_MB`, the
database's integrity and its tables. It then takes a `prerestore` backup, so a restore
can itself be undone, and swaps the uploads and then the database under the write lock.
A restored backup from an older version is migrated as it opens.
