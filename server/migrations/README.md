# Migrations

Numbered SQL files, run in order at startup by the shared kit (`runMigrations` from
`@hhh/server`). **Start at 007**: `007-add-photo-rating.sql`, `008-…`. Versions 1–6 are
taken (see below). Each runs in its own transaction
and is recorded in `schema_migrations` with its checksum. A database that already
holds data is copied to `premigrate-<time>.db` in the backup folder first.

Never edit a migration once it is on `dev`: startup stops if a recorded file changed.
Add a new one instead.

PhotoMapper's first six migrations predate this and stay as JavaScript in
`server/db.ts`, frozen. They run before these files and are recorded in the same
`schema_migrations` table as versions 1–6, with the checksum `legacy`. Keeping them
there means v1.2.0 can still open a database this version has opened, as long as no
SQL migration has run on it yet.
