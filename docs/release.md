# Release Process

This document covers Nodetool desktop stable and nightly releases.

## Channels

- **Stable** follows tagged releases such as `v0.7.0` and publishes updater metadata as `latest*.yml`.
- **Nightly** follows scheduled or manually-dispatched prereleases and publishes updater metadata as `nightly*.yml`.

Nightly desktop versions use:

```text
X.Y.(Z+1)-nightly.YYYYMMDD.<run_number>
```

A packaged app whose version matches that suffix defaults to the `nightly` updater channel. Users can also choose the update channel in the desktop Settings page.

## Workflow

Workflow file: `.github/workflows/release.yaml`.

Triggers:

- Stable: push a tag matching `v*`, excluding `v*-nightly.*`.
- Nightly: scheduled daily at `09:00 UTC`.
- Manual: `workflow_dispatch` with `channel=stable|nightly`.

Scheduled nightlies compare the current commit to the latest nightly tag and skip the release when there are no changes.

## Release metadata

The `preflight` job resolves release metadata once and passes it to build and publish jobs:

- release channel
- semver version
- Git tag
- release name
- prerelease/latest flags
- expected updater manifest names

Nightly metadata is resolved by `scripts/resolve-nightly-release.mjs`.

## Build and publish

The matrix build produces artifacts for:

- Windows NSIS installer
- macOS DMG and updater zip
- Linux AppImage
- web build archive

Matrix jobs upload workflow artifacts only. A single `publish-release` job downloads all artifacts, validates the expected stable/nightly assets, and publishes one GitHub Release.

## Required updater assets

Stable releases should include:

- `latest.yml`
- `latest-mac.yml`
- `latest-linux.yml`

Nightly releases should include:

- `nightly.yml`
- `nightly-mac.yml`
- `nightly-linux.yml`

The publish job runs `scripts/validate-release-assets.mjs` before creating/updating the GitHub Release.

## Desktop updater behavior

The Electron updater reads the selected desktop update channel from settings. If the user has not configured a channel, the default is inferred from the packaged app version:

- `*-nightly.YYYYMMDD.<run_number>` defaults to `nightly`
- all other versions default to `latest`

For nightly, the app sets `autoUpdater.channel = "nightly"` and enables prerelease updates.
