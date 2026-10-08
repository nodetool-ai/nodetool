---
layout: page
title: "Upgrading"
permalink: /upgrading
description: "How to update the NodeTool desktop app, the CLI, and a self-hosted Docker server, what happens to your database on start, and how to back up first."
---

Updating NodeTool replaces the program and leaves your data directory in place. On start, the server applies any database migrations the new version needs. Back up before you update, because a migration cannot be undone by installing the old version.

## Back up first

Stop NodeTool, then copy the data. The desktop app and a local server keep these in the data directory.

| What | Where |
|------|-------|
| Database | `nodetool.sqlite3`, plus `nodetool.sqlite3-wal` and `nodetool.sqlite3-shm` if they exist |
| Assets | `assets/` |
| Vector store | `vectorstore.db` |
| App settings | `settings.yaml` in `~/.config/nodetool/` on macOS and Linux, or in `%APPDATA%\nodetool\` on Windows |
| Vaults (desktop) | `vaults/<id>/` |

The data directory is `~/.local/share/nodetool/` on macOS and Linux (or `$XDG_DATA_HOME/nodetool/`) and `%APPDATA%\nodetool\` on Windows. Vaults sit under `~/.local/share/nodetool/vaults/` on macOS and Linux and `%LOCALAPPDATA%\nodetool\vaults\` on Windows. See [Where your data lives](desktop-app.md#where-your-data-lives) for the full table.

Stored provider keys are in the database, encrypted with a master key. The master key is in your operating system keychain unless `SECRETS_MASTER_KEY` is set. A database restored on another machine decrypts only where the master key has the same value, so keep a copy of `SECRETS_MASTER_KEY` if you set one. See [Secret Storage and Master Key](configuration.md#secret-storage-and-master-key).

Export the workflows you cannot afford to lose as a second copy. The API serves a `.nodetool` bundle at `GET /api/workflows/{id}/export-bundle`. See [API Reference](api-reference.md).

## Desktop app

### Turn on automatic updates

**Automatic Updates** is off by default. With it off, the app does not check for updates at all.

1. Open **Settings**.
2. In **General → Workspace**, find **Updates**.
3. Turn on **Automatic Updates**.
4. Choose an **Update Channel**.

Auto-update runs only in installed builds, not in a development checkout. The app reads releases from the `nodetool-ai/nodetool` GitHub repository. It checks when it starts.

### Update channels

| Channel | Follows |
|---------|---------|
| **Stable** | Full releases |
| **Nightly** | Prerelease nightly builds, published daily |

A build whose version ends in `-nightly.<date>.<n>` starts on **Nightly**. Any other build starts on **Stable**. Your own choice in **Settings** overrides that default. The updater allows downgrades, so moving from Nightly to Stable can install an older build.

### What you see

When a newer version exists, the app downloads it in the background. A card at the top right of the main window reads "Version X is available. Downloading in the background..." with a **View Release Notes** link. When the download finishes the card reads "Version X has been downloaded and will be installed on restart." with a **Restart to Update** button. A system notification appears for both events. See [Update Notification](electron-views.md#update-notification).

If the app logs that `app-update.yml` is missing, you have an older installation. Reinstall from [GitHub releases](https://github.com/nodetool-ai/nodetool/releases) to enable auto-updates.

### Update by hand

Download the current installer from [nodetool.ai](https://nodetool.ai) or from GitHub releases, and install it over the existing app. Your data directory stays. See [Installation](installation.md).

### Node packs and runtimes

Node packs and runtime packages update separately, from **Tools → Package Manager**. See [Node Packs](node-packs.md).

## Command line

If you installed the `nodetool` command with npm, install it again:

```bash
npm install -g @nodetool-ai/cli
```

## Self-hosted Docker

The reference `docker-compose.yml` pulls `ghcr.io/nodetool-ai/nodetool:${NODETOOL_VERSION:-latest}`. All state lives under `/workspace` on the `nodetool-data` volume, so it survives an image upgrade.

### Choose a tag

| Tag | Meaning |
|-----|---------|
| `latest` | The newest build of `main` |
| `1.2.3`, `1.2`, `1` | A release, published when a `v1.2.3` git tag is pushed |
| `main-<shortsha>` | A specific commit on `main` |

In production, pin a release with `NODETOOL_VERSION` in `.env` so an upgrade happens when you choose it. Set `NODETOOL_IMAGE` to run an image you built yourself.

### Back up the volume

Stop the server, then archive the volume. With the compose project name `nodetool`, the volume is `nodetool_nodetool-data`:

```bash
docker compose down
docker run --rm -v nodetool_nodetool-data:/workspace -v "$PWD":/backup \
  alpine tar czf /backup/nodetool-data.tgz -C /workspace .
```

The archive includes `/workspace/.secrets_master_key` if the entrypoint generated your master key. Keep that file with the backup. If you use PostgreSQL, take the dump with your own PostgreSQL tools.

### Upgrade

```bash
docker compose pull
docker compose up -d
```

Check that the server is healthy at `http://localhost:17777/health` (or your `NODETOOL_PORT`). See [Self-Hosted Deployment](self-hosted-deployment.md).

### Roll back

Set `NODETOOL_VERSION` to the previous tag and run `docker compose up -d`. If the newer version applied a migration, restore the volume backup first, because the older image may not understand the migrated database. This is advice from how migrations work and not a tested guarantee.

## Database migrations on start

| Database | When migrations run |
|----------|---------------------|
| SQLite (desktop app, local server, and the default Docker setup) | Every time the server starts. It applies pending migrations before it opens the database and logs the versions it applied |
| PostgreSQL or Supabase in Docker | The image entrypoint runs `db-migrate.mjs` on every start when `DATABASE_URL` is set. Set `NODETOOL_MIGRATE_ON_BOOT=0` if a release step migrates instead |

For PostgreSQL or Supabase you can also run migrations yourself:

```bash
nodetool db status  --direct-url "$DIRECT_URL"
nodetool db migrate --direct-url "$DIRECT_URL" --dry-run
nodetool db migrate --direct-url "$DIRECT_URL"
```

`nodetool db rollback --steps <n>` rolls PostgreSQL or Supabase migrations back. See [CLI Reference](cli.md#database-migrations). For a rolling release across replicas, migrations run once before either replica changes, so they must work with the previous image. See [Docker Production Deploy](docker-production-deploy.md#rolling-release).

## Related pages

- [Changelog](changelog.md) for what changed in recent releases
- [Desktop App](desktop-app.md) for settings and data locations
- [Self-Hosted Deployment](self-hosted-deployment.md) for Docker setup
- [Configuration](configuration.md) for storage and secrets variables
