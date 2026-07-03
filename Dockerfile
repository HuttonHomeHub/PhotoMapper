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
RUN npm ci

COPY . .
RUN npm run build \
  && npm prune --omit=dev

# ---- Runtime stage ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    PHOTOS_DB_PATH=/config/photos.db \
    UPLOADS_DIR=/config/uploads

# Persistent state dir (SQLite file + uploads). Named `/config` to match the
# common self-hosted convention. Owned by the unprivileged `node` user so a fresh
# named volume inherits writable ownership.
RUN mkdir -p /config && chown node:node /config

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/package.json ./package.json

USER node
EXPOSE 3001
VOLUME ["/config"]

# Reuses the OPS-04 liveness endpoint as the container health probe.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# server/index.js handles SIGTERM for graceful shutdown (OPS-05).
CMD ["node", "server/index.js"]
