# Flatpak Support for Nodetool

## Overview

Nodetool can be packaged and distributed as a Flatpak application for Linux systems. Flatpak provides a sandboxed environment with consistent dependencies across different Linux distributions.

**Important**: As of the latest release, Flatpak builds are **independent from the main release workflow** and are built through a dedicated CI pipeline that does not block releases.

## CI Build System

### Automated Builds

Flatpak packages are automatically built by the [Flatpak CI workflow](.github/workflows/flatpak-ci.yml) which:

- Runs on every push to `main` branch
- Can be manually triggered via workflow_dispatch
- Does NOT block GitHub releases
- Produces downloadable artifacts for testing
- Runs in isolation from AppImage and macOS builds

### Workflow Features

- **Non-blocking**: Build failures do not affect releases
- **Independent**: No dependencies on other build workflows
- **Containerized**: Runs in Flatpak-capable container (`ghcr.io/flathub-infra/flatpak-github-actions`)
- **Cached**: SDKs, runtimes, and node_modules are cached for faster builds
- **Secure**: No signing keys required for CI builds

### Downloading CI Builds

1. Go to [Actions tab](https://github.com/nodetool-ai/nodetool/actions/workflows/flatpak-ci.yml)
2. Click on a successful workflow run
3. Download the artifact (e.g., `nodetool-abc12345-x86_64.flatpak`)
4. Install locally:
   ```bash
   flatpak install --user nodetool-abc12345-x86_64.flatpak
   flatpak run ai.nodetool.NodeTool
   ```

## Building Locally

### Prerequisites

- Flatpak and flatpak-builder installed
- Required runtimes:
  ```bash
  flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
  flatpak install --user -y flathub org.freedesktop.Platform//24.08
  flatpak install --user -y flathub org.freedesktop.Sdk//24.08
  flatpak install --user -y flathub org.electronjs.Electron2.BaseApp//24.08
  ```

### Build from Source

```bash
# Clone the repository
git clone https://github.com/nodetool-ai/nodetool.git
cd nodetool

# Build Flatpak
flatpak-builder \
  --user \
  --install-deps-from=flathub \
  --force-clean \
  --repo=flatpak-repo \
  build-dir \
  electron/ai.nodetool.NodeTool.flatpak.yml

# Create bundle
flatpak build-bundle flatpak-repo nodetool.flatpak ai.nodetool.NodeTool stable

# Install
flatpak install --user nodetool.flatpak
```

## Flatpak Manifest

The Flatpak manifest ([`electron/ai.nodetool.NodeTool.flatpak.yml`](ai.nodetool.NodeTool.flatpak.yml)) defines:

### Runtime and SDK

- **Runtime**: org.freedesktop.Platform 24.08
- **SDK**: org.freedesktop.Sdk 24.08
- **Base**: org.electronjs.Electron2.BaseApp 24.08
- **Architecture**: x86_64 (aarch64 support planned)

### Permissions

The manifest explicitly declares minimum required permissions:

#### Display and Graphics
- `--share=ipc` - Inter-process communication
- `--socket=x11` - X11 display server
- `--socket=wayland` - Wayland display server
- `--device=dri` - GPU acceleration for AI workloads

#### Audio/Video
- `--socket=pulseaudio` - Audio input/output
- `--device=all` - Camera and microphone access for multimedia features

#### Network and Storage
- `--share=network` - API calls, model downloads, backend communication
- `--filesystem=home` - User projects, workflows, and configuration files

#### System Integration
- `--talk-name=org.freedesktop.Notifications` - Desktop notifications
- `--talk-name=org.kde.StatusNotifierWatcher` - System tray (KDE)
- `--talk-name=com.canonical.AppMenu.Registrar` - Menu bar (Ubuntu)
- `--talk-name=org.freedesktop.portal.Desktop` - Desktop portals

### Build Process

The manifest builds NodeTool from source:

1. Checks out the repository
2. Builds the web frontend (`web/`)
3. Builds the Electron application (`electron/`)
4. Downloads micromamba for Python environment
5. Compiles TypeScript
6. Packages everything into `/app/nodetool`
7. Installs desktop integration files
8. Creates launcher script

## Configuration Files

- **[`electron/ai.nodetool.NodeTool.flatpak.yml`](ai.nodetool.NodeTool.flatpak.yml)**: Main Flatpak manifest
- **[`electron/flatpak-wrapper.sh`](flatpak-wrapper.sh)**: Launcher script
- **[`electron/resources/ai.nodetool.NodeTool.desktop`](resources/ai.nodetool.NodeTool.desktop)**: Desktop entry
- **[`electron/resources/ai.nodetool.NodeTool.metainfo.xml`](resources/ai.nodetool.NodeTool.metainfo.xml)**: AppStream metadata

## Running the Application

```bash
# Run the application
flatpak run ai.nodetool.NodeTool

# Run with verbose logging
flatpak run --verbose ai.nodetool.NodeTool

# Check logs
journalctl --user -xe | grep nodetool
```

## Publishing to Flathub (Future)

The current setup is build-only. To publish to Flathub in the future:

1. **Create Flathub repository**
   - Fork the [Flathub repository](https://github.com/flathub/flathub)
   - Create a new repository for `ai.nodetool.NodeTool`

2. **Submit manifest**
   - Copy `electron/ai.nodetool.NodeTool.flatpak.yml` to the Flathub repo
   - Update sources to point to release tarballs
   - Add GPG signing configuration

3. **Follow submission guidelines**
   - Review [Flathub submission guidelines](https://docs.flathub.org/docs/for-app-authors/submission/)
   - Submit pull request to Flathub
   - Address review feedback

4. **Set up signing**
   - Generate GPG key for signing
   - Add signing configuration to CI workflow
   - Store GPG key in GitHub Secrets

## Troubleshooting

### Build Issues

**Problem**: Flatpak build fails with permission errors
```bash
# Solution: Run in privileged container or with sudo
sudo flatpak-builder --user ...
```

**Problem**: Missing dependencies
```bash
# Solution: Install all required runtimes
flatpak install --user -y flathub org.freedesktop.Platform//24.08
flatpak install --user -y flathub org.freedesktop.Sdk//24.08
flatpak install --user -y flathub org.electronjs.Electron2.BaseApp//24.08
```

**Problem**: Build fails on manifest validation
```bash
# Solution: Validate manifest syntax
flatpak-builder --show-manifest electron/ai.nodetool.NodeTool.flatpak.yml
```

### Runtime Issues

**Problem**: Application doesn't start
```bash
# Check if runtime is installed
flatpak list --runtime

# Reinstall if needed
flatpak install --user -y flathub org.freedesktop.Platform//24.08

# Run with verbose logging
flatpak run --verbose ai.nodetool.NodeTool
```

**Problem**: Permission denied errors
```bash
# Check current permissions
flatpak info --show-permissions ai.nodetool.NodeTool

# Override permissions if needed (not recommended)
flatpak override --user --filesystem=home ai.nodetool.NodeTool
```

### CI Issues

**Problem**: CI workflow fails
- Check the [Actions tab](https://github.com/nodetool-ai/nodetool/actions/workflows/flatpak-ci.yml) for logs
- Workflow failures do NOT block releases or other builds
- Review build logs for specific errors

**Problem**: Artifacts not found
- Ensure workflow completed successfully
- Check retention period (default: 30 days)
- Look for artifacts in the workflow run page

## Development

### Testing Changes Locally

```bash
# Make changes to the manifest
vim electron/ai.nodetool.NodeTool.flatpak.yml

# Test build locally
flatpak-builder --force-clean build-dir electron/ai.nodetool.NodeTool.flatpak.yml

# Install and test
flatpak-builder --user --install --force-clean build-dir electron/ai.nodetool.NodeTool.flatpak.yml
flatpak run ai.nodetool.NodeTool
```

### Validating the Manifest

```bash
# Validate syntax
flatpak-builder --show-manifest electron/ai.nodetool.NodeTool.flatpak.yml

# Check for common issues
flatpak run --command=sh org.freedesktop.Sdk//24.08
```

## Additional Resources

- [Flatpak Documentation](https://docs.flatpak.org/)
- [Electron BaseApp](https://github.com/flathub/org.electronjs.Electron2.BaseApp)
- [Flathub Submission Guide](https://docs.flathub.org/)
- [Flatpak Builder Documentation](https://docs.flatpak.org/en/latest/flatpak-builder.html)

## Architecture Notes

### Why Independent from Release Workflow?

1. **Non-blocking**: Flatpak builds can fail without affecting releases
2. **Faster releases**: No need to wait for Flatpak build
3. **Independent testing**: Flatpak builds can be tested separately
4. **Easier maintenance**: Changes to Flatpak don't affect other platforms
5. **Flexible cadence**: Flatpak can be built on every commit to main

### Future Enhancements

- **Multi-architecture**: Add aarch64 support
- **Flathub publishing**: Automate submission to Flathub
- **Repository signing**: Add GPG signing for security
- **Auto-updates**: Integrate with Flatpak update mechanism
- **Beta channel**: Separate stable/beta builds
