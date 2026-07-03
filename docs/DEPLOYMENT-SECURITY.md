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
  (matching the common self-hosted convention); the image sets
  `PHOTOS_DB_PATH=/config/photos.db` and `UPLOADS_DIR=/config/uploads` so both the
  database and uploads live there and survive rebuilds. Both are overridable if you
  want a different layout. **Back this volume up** — see Backups (OPS-03) below.
- **Loopback only** — compose publishes `127.0.0.1:3001:3001`, so the Node port is
  never exposed to the internet directly. Point your reverse proxy (above) at
  `127.0.0.1:3001`. If the proxy runs in its own container, put both on a shared
  Docker network and drop the published port entirely.
- **Non-root + PUID/PGID** — the entrypoint starts as root only to `chown /config`
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
GitHub Container Registry on every push to `main` (and on `v*` tags), so you can
pull instead of building:

```
ghcr.io/huttonhomehub/photomapper:latest
```

Compose snippet (mirrors a typical self-hosted stack):

```yaml
photomapper:
  container_name: photomapper
  image: ghcr.io/huttonhomehub/photomapper:latest
  ports:
    - 127.0.0.1:3001:3001   # loopback only — the reverse proxy fronts it (no in-app auth)
  environment:
    - PUID=1000
    - PGID=1000
    - TZ=Europe/London
    - NODE_ENV=production
    - TRUST_PROXY=2       # Cloudflare→nginx→app: use the real client IP, not the proxy
    - LOG_LEVEL=warn      # quieter logs (drop the per-request info lines)
    # - ALLOWED_ORIGINS=https://photos.example.com
    # - ALLOW_RESET=false
  volumes:
    - /apps/photomapper/config:/config   # holds photos.db + uploads
  restart: unless-stopped
```

Notes:

- **No manual chown needed** — the entrypoint chowns `/config` to `PUID:PGID` at
  startup (like linuxserver/hotio images), so a bare bind mount just works. `PUID`/
  `PGID` default to `1000` if unset. (One edge case: to adopt a *pre-existing* photo
  library owned by a different uid, `chown -R` it once — the startup chown is
  non-recursive so it stays fast as the library grows.)
- **Package visibility** — GHCR packages are **private by default**. Either make the
  package public (repo → Packages → the image → Package settings → change visibility)
  for anonymous pulls, or `docker login ghcr.io` on the host with a token that has
  `read:packages`.
- **First publish** — if the workflow's push step 403s, allow Actions to write
  packages: repo Settings → Actions → General → Workflow permissions → *Read and
  write permissions* (the workflow already requests `packages: write`).

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | App listen port (keep behind the proxy). |
| `PHOTOS_DB_PATH` | `server/photos.db` | SQLite file location (point at a persistent volume — OPS-03). |
| `UPLOADS_DIR` | `server/uploads` | Uploaded-image + thumbnail directory (point at the same persistent volume). |
| `ALLOW_RESET` | _unset_ | Set to `true` only if you want `DELETE /api/reset` enabled. |
| `NODE_ENV` | _unset_ | `production` in prod; `test` is used by the test suite. |
| `TRUST_PROXY` | _(off)_ | Express `trust proxy` for reverse-proxy deploys. A hop count (`2` = Cloudflare→nginx→app), `true`/`false`, or an IP/subnet list. Makes `req.ip`, rate-limiting and protocol use the real client. Prefer a hop count over `true` (the rate limiter rejects fully-permissive trust). |
| `LOG_LEVEL` | `info` | pino level; set `warn` to drop per-request access logs. |

> Full config reference is in `.env.example` and validated in `server/config.js` (OPS-07).

## Backups (OPS-03) — ⚠️ not yet implemented

**This is the single largest open production risk.** The SQLite database and the
`uploads/` directory (both on the `/config` volume under Docker) hold **all** state,
and there is currently **no automated backup**. If the volume or host is lost,
everything is gone.

Until OPS-03 is delivered, run a manual off-box backup, e.g.:

```bash
# DB: use SQLite's online backup (safe while the app is running)
docker compose exec app node -e "new (require('better-sqlite3'))(process.env.PHOTOS_DB_PATH).backup('/config/backup-'+Date.now()+'.db')"
# then copy /config (DB backup + uploads) OFF the host — to another server or object storage
```

A scripted, scheduled, off-box backup + a tested restore procedure are tracked as
**OPS-03** (deferred pending a chosen backup destination).
