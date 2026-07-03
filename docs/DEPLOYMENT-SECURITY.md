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
- _Planned (Phase 2):_ security headers via helmet (SEC-09), CORS allowlist
  (SEC-04), rate limiting (SEC-07), generic error messages (SEC-08).

## Environment variables

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | App listen port (keep behind the proxy). |
| `PHOTOS_DB_PATH` | `server/photos.db` | SQLite file location (point at a persistent volume — OPS-03). |
| `ALLOW_RESET` | _unset_ | Set to `true` only if you want `DELETE /api/reset` enabled. |
| `NODE_ENV` | _unset_ | `production` in prod; `test` is used by the test suite. |

> A validated config module and `.env.example` are tracked as OPS-07.

## Backups (OPS-03)

SQLite DB and the `uploads/` directory hold all state. Put both on a persistent
volume and back them up (e.g. nightly `sqlite3 photos.db ".backup"` + uploads
sync). A restore procedure will be documented when OPS-03 lands.
