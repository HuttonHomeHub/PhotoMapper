# Contributing to PhotoMapper

Thanks for working on PhotoMapper. This guide is for humans; `CLAUDE.md` holds the
same conventions in the form AI assistants consume.

## Prerequisites

- **Node 22+** and npm.
- No `.env` is required to run locally (see [Configuration](#configuration)).

## Getting started

```bash
npm install
npm run dev      # API on :3001 + Vite dev server, together
```

Vite proxies `/api` and `/uploads` to the backend. Open the URL Vite prints (or the
Codespaces forwarded port). Uploaded files and the SQLite DB live under `server/`
and are gitignored.

## Project layout

See the architecture tree in [`README.md`](README.md). In short:

- `src/` — React 18 + Vite frontend. All photo API calls go through
  `src/hooks/` (`usePhotos`/`useClients`/`useProjects`); all Leaflet code stays in
  `src/components/PhotoMap.jsx`.
- `server/` — Express API. Entry `index.js` → `app.js` (middleware/routers) →
  `routes/*` → `db.js` (repository) with versioned migrations in `migrate.js`.
- `docs/` — [`API.md`](docs/API.md) (endpoint reference),
  [`geo-math.md`](docs/geo-math.md) (FOV/EXIF math),
  [`DEPLOYMENT-SECURITY.md`](docs/DEPLOYMENT-SECURITY.md), and
  `project-management/` (the remediation backlog, roadmap and ADRs).

## Conventions

- **ES modules only** — the package is `"type": "module"`; never use `require()`.
- **camelCase ↔ snake_case** — DB columns are `snake_case`; `db.js` maps them to
  `camelCase` at the boundary. Keep new columns consistent and map them there.
- **Add API calls in the hooks**, not in components. New routes go in
  `server/routes/*`; new DB access in `server/db.js`.
- **Schema changes are migrations** — append a new `{ version, name, up(db) }` to
  the `migrations` array in `server/db.js`. **Never edit an applied migration.**
- **Validation** — declare a zod schema in `server/validation.js` and attach it
  with `validate(...)`; don't hand-roll body checks in handlers.
- **Dark theme palette** — `#1a1a2e` bg, `#16213e` sidebar, `#e97b25` accent.
- **Code style** — Prettier + ESLint. The whole tree follows `.prettierrc`
  (`semi: true`, single quotes, 100 cols). Run `npm run format` before committing;
  CI runs `npm run format:check` and fails on drift. `src/lib/heatmap-patched.js`
  is a vendored file and is Prettier-ignored.

## Testing

```bash
npm test              # run the Vitest suite once
npm run test:watch    # watch mode
npm run test:coverage # with coverage thresholds (enforced in CI)
```

- Node tests (data layer, API via supertest, pure libs) run in the default
  environment; component/hook tests opt into jsdom with a
  `// @vitest-environment jsdom` docblock at the top of the file.
- Add tests under `tests/` mirroring the source layout. New behaviour should ship
  with a test; bug fixes should add a regression test.

## Branches, commits, PRs

- Branch off `main`; never push directly to it. AI-assisted work uses
  `claude/<description>-<id>`.
- Commits: imperative and focused (e.g. `add deletion endpoint`,
  `fix map clustering on zoom`).
- Before opening a PR, make sure `npm run lint`, `npm run build` and `npm test`
  all pass with no new warnings. CI runs the same on `main` and `claude/**`.

## Configuration

All runtime config is validated on startup in `server/config.js`; copy
`.env.example` to `.env` for local overrides. See the table in
[`README.md`](README.md#configuration). Production auth is enforced at a reverse
proxy — read [`docs/DEPLOYMENT-SECURITY.md`](docs/DEPLOYMENT-SECURITY.md) before
deploying.
