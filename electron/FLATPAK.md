# Flatpak Support for Nodetool

## Overview

Nodetool can be packaged and distributed as a Flatpak application for Linux systems. Flatpak provides a sandboxed environment with consistent dependencies across different Linux distributions.

## Building the Flatpak Package

### Prerequisites

- Node.js (LTS version)
- npm
- electron-builder
- flatpak-builder (optional, for manual builds)

### Building with electron-builder

The easiest way to build the Flatpak package is through electron-builder:

```bash
cd electron
npm install
npm run build  # This will build both AppImage and Flatpak
```

The Flatpak package will be created in the `electron/dist` directory.

### Configuration Files

The following files are used for Flatpak packaging:

- **electron-builder.json**: Contains the Flatpak target and configuration
- **ai.nodetool.desktop**: Desktop entry file for Linux integration
- **ai.nodetool.metainfo.xml**: AppStream metadata for app stores
- **ai.nodetool.yml**: Flatpak manifest (alternative build method)

## Installing the Flatpak

### From Local Build

```bash
# Install the built Flatpak
flatpak install --user ./electron/dist/ai.nodetool-*.flatpak

# Run the application
flatpak run ai.nodetool
```

### Permissions

The Flatpak package is configured with the following permissions:

- **Network access**: For API calls and model downloads
- **Filesystem access**: Home directory for project files
- **GPU acceleration**: For AI workloads
- **Audio/Video**: For multimedia processing features
- **X11/Wayland**: For GUI display

## Flatpak Runtime

The application uses:

- **Runtime**: org.freedesktop.Platform 23.08
- **SDK**: org.freedesktop.Sdk 23.08
- **Base**: org.electronjs.Electron2.BaseApp 23.08

## Publishing to Flathub

To publish Nodetool on Flathub:

1. Fork the [Flathub repository](https://github.com/flathub/flathub)
2. Create a new repository for `ai.nodetool`
3. Submit the `ai.nodetool.yml` manifest
4. Follow the [Flathub submission guidelines](https://docs.flathub.org/docs/for-app-authors/submission/)

## Troubleshooting

### Build Issues

If the Flatpak build fails:

1. Ensure all prerequisites are installed
2. Check that icon files exist in `electron/resources/linux_icons/`
3. Verify the desktop and metainfo files are properly formatted

### Runtime Issues

If the app doesn't start:

```bash
# Run with verbose logging
flatpak run --verbose ai.nodetool

# Check logs
journalctl --user -xe | grep nodetool
```

## Additional Resources

- [electron-builder Flatpak docs](https://www.electron.build/configuration/flatpak)
- [Flatpak documentation](https://docs.flatpak.org/)
- [Flathub submission guide](https://docs.flathub.org/)
