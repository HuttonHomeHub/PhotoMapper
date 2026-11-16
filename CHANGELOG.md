# Changelog

All notable changes to PhotoMapper. Versions are the published Docker image tags
(`ghcr.io/huttonhomehub/photomapper:<version>`). The version lives in `package.json`.

Every PR into `dev` adds its line under `## Unreleased`, in `### Added`, `### Changed` or
`### Fixed`. At release, the Ship It skill turns that section into `## vX.Y.Z — <summary>`:
a minor bump if anything is under Added, otherwise a patch bump. The publish workflow uses
that section as the GitHub Release notes.

## Unreleased

## v1.1.1 — real client IP behind Cloudflare (docs)

### Changed
- **Deployment docs: real client IP behind Cloudflare.** nginx restores the visitor's IP from
  Cloudflare's `CF-Connecting-IP` header, and PhotoMapper trusts one hop (`TRUST_PROXY=1`,
  previously documented as `2`). Same setup as Crane Charts.

## v1.1.0 — versioned releases, React 19 and dependency updates

### Added
- **Version numbers for releases.** Each release now publishes the image as `X.Y.Z`, `X.Y`,
  `latest` and `sha-<short>`, and gets a `vX.Y.Z` tag and a GitHub Release with these notes,
  so you can see what is running and pin or roll back to a known version.
- **This changelog.**

### Changed
- **React 19.** `react` and `react-dom` move from 18.3 to 19.3 together. No app code changes
  were needed.
- **Dependency updates** (Dependabot): express-rate-limit 8.7, helmet 8.3, pino 10.4, prettier
  3.10, supertest 7.3 and testing-library patches (#43); better-sqlite3 13 with SQLite 3.54.1
  (#45); globals 17 (#46); GitHub Actions checkout 7, setup-node 7 and the Docker login,
  metadata, Buildx and build-push actions to their latest majors (#37–#42).
- **Publishing only happens on a release** (a merge of `dev` into `main`). The version comes
  from `package.json`; a release whose version already exists fails instead of overwriting an
  image. Pushing a `v*` tag and running the workflow by hand no longer publish.

## Before versioned releases
Releases up to 2026-11-15 (PRs #33 and #35) were published as `:latest` and `:sha-<short>`
only, with `package.json` left at `1.0.0`. They included the dev-branch workflow, dependency
security fixes, Dependabot, CI-gated publishing and the Ship It skill. The first numbered
release is `1.1.0`.
