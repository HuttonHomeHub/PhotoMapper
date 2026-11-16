# OPS-02: production image. Multi-stage — the build stage compiles the frontend
# and native modules (better-sqlite3, sharp); the runtime stage carries only the
# pruned production node_modules, the built dist/, and the server.

# ---- Build stage ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

# Toolchain for native module compilation (better-sqlite3, sharp).
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
# The shared platform is vendored; npm resolves its file: dependencies from here.
COPY vendor ./vendor
RUN npm ci

COPY . .
RUN npm run build \
  && npm prune --omit=dev

# ---- Runtime stage ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# gosu lets the root entrypoint drop to PUID:PGID while keeping the app as PID 1
# (so SIGTERM still reaches it for graceful shutdown).
RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu \
  && rm -rf /var/lib/apt/lists/*

# All state lives under /config (the shared container standard): DB_PATH and
# UPLOADS_DIR default to photos.db and uploads/ inside DATA_DIR. The entrypoint
# fixes ownership at startup.
ENV NODE_ENV=production \
    PORT=3001 \
    DATA_DIR=/config
RUN mkdir -p /config

# Release version stamped in by the publish workflow (from the image tag). Reported
# at GET /health and /version.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./package.json
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3001
VOLUME ["/config"]

# Reuses the OPS-04 liveness endpoint as the container health probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Entrypoint runs as root, chowns /config to PUID:PGID (default 1000:1000), then
# drops privileges via gosu and runs the CMD. server/index.js handles SIGTERM
# for graceful shutdown (OPS-05).
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
