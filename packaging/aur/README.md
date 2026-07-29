# AUR packaging

`nodetool-bin` is the Arch User Repository package for the NodeTool desktop app.
It installs the Linux AppImage attached to each stable GitHub Release, so users
on Arch-based distros can `paru -S nodetool-bin` / `yay -S nodetool-bin` instead
of downloading the AppImage by hand.

## How it works

- [`PKGBUILD`](PKGBUILD) is the maintained package definition. It downloads
  `Nodetool-<version>-x86_64.AppImage` from the release, extracts it into
  `/opt/nodetool-bin`, symlinks the `nodetool` launcher into `/usr/bin`, and
  installs the desktop entry and icons. The `@PKGVER@` placeholder is filled in
  at publish time.
- [`../../.github/workflows/aur-publish.yml`](../../.github/workflows/aur-publish.yml)
  runs when a GitHub Release is published (or via manual dispatch). For stable
  `X.Y.Z` versions it renders the `PKGBUILD`, computes the AppImage checksum
  with `updpkgsums`, regenerates `.SRCINFO`, and pushes to
  `ssh://aur@aur.archlinux.org/nodetool-bin.git` using
  [`KSXGitHub/github-actions-deploy-aur`](https://github.com/marketplace/actions/publish-aur-package).
  Pre-releases (rc/beta) and nightlies are skipped.

## Required repository secrets

The workflow needs three secrets, set under **Settings → Secrets and variables →
Actions**:

| Secret | Value |
| --- | --- |
| `AUR_SSH_PRIVATE_KEY` | Private SSH key whose public half is registered on the AUR account that maintains `nodetool-bin`. |
| `AUR_USERNAME` | Git commit author name (e.g. the AUR maintainer name). |
| `AUR_EMAIL` | Git commit author email. |

The AUR account must own (or be a co-maintainer of) `nodetool-bin`. If the
package does not exist yet, the first push from an account whose SSH key is
registered creates it.

## Testing the PKGBUILD locally

On an Arch system:

```bash
sed 's/@PKGVER@/0.7.0/g' PKGBUILD > /tmp/PKGBUILD
cd /tmp && updpkgsums && makepkg -si
```
