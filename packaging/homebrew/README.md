# Homebrew cask

`nodetool` is the Homebrew cask for the NodeTool desktop app on macOS. It
installs the DMG attached to each stable GitHub Release and picks the arm64 or
x64 build for the Mac it runs on. Once
[Homebrew/homebrew-cask](https://github.com/Homebrew/homebrew-cask) accepts it,
users install it with:

```bash
brew install --cask nodetool
```

Until then, follow [First submission](#first-submission).

## What the cask declares

| Stanza | Value | Reason |
| --- | --- | --- |
| `url` | `Nodetool-<version>-<arch>.dmg` from the `v<version>` release | The [Release workflow](../../.github/workflows/release.yaml) builds, signs and notarizes one DMG and one zip per architecture from [electron-builder.json](../../electron/electron-builder.json). Homebrew only accepts apps that pass Gatekeeper. |
| `auto_updates true` | | The app updates itself through electron-updater, which reads `latest-mac.yml` from the GitHub Release and installs the matching zip. `brew upgrade` leaves the cask to the app unless `--greedy` is passed. |
| `livecheck` | GitHub releases whose tag is a plain `X.Y.Z` | The Release workflow marks release candidates as GitHub's latest release, so `:github_latest` would report them. homebrew-cask accepts stable versions only. |
| `depends_on macos` | `:monterey` (macOS 12 or later) | The Electron version in [electron/package.json](../../electron/package.json) requires macOS 12. `brew audit --new` compares this with the app's `LSMinimumSystemVersion`. Raise it when an Electron upgrade raises that minimum. |
| `zap` | See below | Paths the app writes. |

`brew uninstall --zap nodetool` removes:

- `~/Library/Application Support/nodetool-electron`, the Electron `userData`
  directory. Electron names it after `name` in
  [electron/package.json](../../electron/package.json), not after the product
  name.
- `~/.local/share/nodetool`, `~/.config/nodetool` and `~/.cache/nodetool`,
  which hold the database, assets, settings and caches. The `nodetool` CLI uses
  the same directories, so zap also removes its workflows and settings.
- The electron-updater and Squirrel caches, preferences and saved window state
  under `~/Library`.

## Updates

After the cask is in homebrew-cask, BrewTestBot runs livecheck every few hours
and opens the version bump pull request for each new stable release.
`brew bump-cask-pr` refuses casks that BrewTestBot bumps, so nothing in this
repository publishes to Homebrew. The workflow below checks that each release
still installs from the cask and that livecheck still finds it.

## Files

- [`nodetool.rb`](nodetool.rb) is the cask, with `@VERSION@`,
  `@SHA256_ARM64@` and `@SHA256_X64@` placeholders.
- [`render.sh`](render.sh) fills in one stable version. It reads the sha256
  digests GitHub records for the release's two DMGs.
- [`test-cask.sh`](test-cask.sh) runs on macOS. It adds the rendered cask to a
  throwaway tap and runs `brew style`, `brew audit --new --online --strict`
  and `brew livecheck`. Then it installs the cask and checks the installed
  app's Developer ID signature, notarization, stapled ticket, architecture,
  version and updater feed. It runs Gatekeeper's `gktool scan` where the OS
  has it, as homebrew-cask's signing audit does, because that audit only runs
  for the official tap. Last, it launches the app until the backend answers
  `/health` and uninstalls with `--zap`.

## Workflow

[`homebrew-cask.yml`](../../.github/workflows/homebrew-cask.yml) runs
`test-cask.sh` on an Apple silicon runner and on an Intel runner, so both DMGs
are installed and launched. The arm64 job uploads the rendered cask as the
`homebrew-cask-nodetool-<version>` artifact. It needs no secrets.

| Trigger | Version |
| --- | --- |
| Pull request touching `packaging/homebrew/` or the workflow | Latest stable release |
| Successful `Release` run for a stable `vX.Y.Z` tag | That tag |
| Manual dispatch | `version` input, or the latest stable release |

Release candidates and nightlies are skipped.

## First submission

Homebrew takes a new cask as a pull request from a person. The repository must
meet the [notability policy](https://docs.brew.sh/Package-Acceptance-Policy#notability),
which sets a higher bar for a submission from the project's owner or from an
address at the cask's `homepage` or `url` domain. `brew audit --new` checks it.

1. Download the cask artifact from the latest successful workflow run, or
   render it on a Mac:

   ```bash
   packaging/homebrew/render.sh 0.8.11 nodetool.rb
   ```

2. Add it to a local clone of homebrew-cask and check it there:

   ```bash
   brew tap --force homebrew/cask
   cp nodetool.rb "$(brew --repository homebrew/cask)/Casks/n/nodetool.rb"
   export HOMEBREW_NO_INSTALL_FROM_API=1
   brew audit --cask --new --online --strict nodetool
   brew style --fix --cask nodetool
   brew install --cask nodetool
   ```

3. Commit it as `nodetool <version> (new cask)` on a branch of your fork of
   Homebrew/homebrew-cask and open a pull request that follows its template.

## Testing locally

On a Mac with Homebrew, from the repository root:

```bash
packaging/homebrew/render.sh 0.8.11 /tmp/nodetool.rb
packaging/homebrew/test-cask.sh /tmp/nodetool.rb 0.8.11
```

`test-cask.sh` installs into `/Applications` and its `--zap` step deletes the
NodeTool data directories listed above. Run it on a machine without NodeTool
data you want to keep.
