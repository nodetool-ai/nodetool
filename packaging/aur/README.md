# AUR packaging

`nodetool-bin` is the Arch User Repository package for the NodeTool desktop app.
It repackages the Linux AppImage attached to each stable GitHub Release, so
users on Arch-based distros, Omarchy included, can run `yay -S nodetool-bin` or
`paru -S nodetool-bin` and get updates through pacman.

## What the package installs

| Path | Source |
| --- | --- |
| `/opt/nodetool-bin/` | The extracted AppImage, with directories made world-readable (the AppImage stores them as `0700`) and `chrome-sandbox` setuid root. |
| `/usr/bin/nodetool` | [`nodetool.sh`](nodetool.sh), the launcher. |
| `/usr/share/applications/nodetool-electron.desktop` | [`nodetool-electron.desktop`](nodetool-electron.desktop), the app launcher entry and `nodetool://` URL handler. |
| `/usr/share/icons/hicolor/512x512/apps/nodetool-electron.png` | The icon from the AppImage. |

The desktop entry and icon are named after the app's Wayland `app_id`,
`nodetool-electron`. Hyprland, Waybar and Walker use that name to match the
running window to its entry and icon.

## Omarchy and other Wayland sessions

On a Wayland session the launcher starts Electron with
`--ozone-platform=wayland`. Without it, the Electron build in the AppImage
selects X11 and needs XWayland. Extra Electron flags go one per line in
`~/.config/nodetool-flags.conf`. They are applied after the defaults, so
`--ozone-platform=x11` there forces XWayland.

The backend stores its credential encryption key through the Secret Service
API and exits if no provider is running. Omarchy runs gnome-keyring. On other
setups install `gnome-keyring` or `kwallet`.

## Files

- [`PKGBUILD`](PKGBUILD) is the package definition. The `@PKGVER@` placeholder
  is filled in per release, and checksums are computed at build time.
- [`render.sh`](render.sh) writes the PKGBUILD and its local sources for one
  version into a directory.
- [`test-package.sh`](test-package.sh) runs inside an `archlinux` container. It
  computes checksums and `.SRCINFO`, runs namcap, builds with `makepkg`,
  installs with `pacman`, validates the installed files and desktop entry, then
  launches the app from its desktop entry. It uses a headless Sway session (a
  wlroots compositor like Hyprland), a D-Bus session and an unlocked
  gnome-keyring. The launch passes when a native Wayland window with the
  expected `app_id` opens and the backend answers `/health`.

## Workflow

[`aur-publish.yml`](../../.github/workflows/aur-publish.yml) runs
`test-package.sh` and publishes the tested directory to
`ssh://aur@aur.archlinux.org/nodetool-bin.git` with
[`KSXGitHub/github-actions-deploy-aur`](https://github.com/marketplace/actions/publish-aur-package).

| Trigger | Version | Publishes |
| --- | --- | --- |
| Pull request touching `packaging/aur/` or the workflow | Latest stable release | No |
| Successful `Release` run for a stable `vX.Y.Z` tag | That tag | Yes |
| Manual dispatch | `version` input, or the latest stable release | When `publish` is checked |

Release candidates and nightlies are skipped. A release made by a manual
`Release` dispatch has no tag on its run, so publish it with a manual dispatch
of this workflow.

## Required repository secrets

Set these under **Settings → Secrets and variables → Actions**:

| Secret | Value |
| --- | --- |
| `AUR_SSH_PRIVATE_KEY` | Private SSH key whose public half is registered on the AUR account that maintains `nodetool-bin`. |
| `AUR_USERNAME` | Git commit author name, such as the AUR maintainer name. |
| `AUR_EMAIL` | Git commit author email. |

The AUR account must own `nodetool-bin` or co-maintain it. If the package does
not exist yet, the first push from an account with a registered SSH key
creates it.

## Testing locally

With Docker, from the repository root:

```bash
packaging/aur/render.sh 0.7.0 aur-pkg
docker run --rm -v "$PWD/aur-pkg:/pkg" -v "$PWD/packaging/aur:/aur:ro" \
  archlinux:latest /aur/test-package.sh /pkg
```

On an Arch system:

```bash
packaging/aur/render.sh 0.7.0 /tmp/nodetool-bin
cd /tmp/nodetool-bin && updpkgsums && makepkg -si
```
