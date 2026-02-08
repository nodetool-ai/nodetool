# Flatpak Support Summary

## What Was Added

This PR adds comprehensive Flatpak support for Nodetool on Linux, providing a sandboxed, distribution-independent packaging format.

### New Files

1. **electron/resources/ai.nodetool.desktop**
   - Desktop entry file for Linux integration
   - Provides menu entry, icon, and application metadata

2. **electron/resources/ai.nodetool.metainfo.xml**
   - AppStream metadata file
   - Required for app stores and software centers
   - Contains application description, screenshots, and release information

3. **electron/ai.nodetool.yml**
   - Flatpak manifest file
   - Alternative build method using flatpak-builder
   - Defines runtime, SDK, and permissions

4. **electron/FLATPAK.md**
   - Comprehensive documentation for Flatpak support
   - Build instructions
   - Installation guide
   - Troubleshooting tips

5. **electron/validate-flatpak.sh**
   - Validation script to check Flatpak configuration
   - Verifies all required files exist
   - Validates file formats (JSON, YAML, XML)

### Modified Files

1. **electron/electron-builder.json**
   - Added `"flatpak"` to Linux targets
   - Added `flatpak` configuration section with runtime, SDK, and permissions
   - Enhanced desktop entry configuration

2. **README.md**
   - Added Flatpak link in the Download table for Linux

3. **electron/README.md**
   - Added "Building for Distribution" section
   - Documented Flatpak packaging support

4. **.github/workflows/release.yaml**
   - Updated to include `*.flatpak` files in Linux release assets

## How It Works

### Build Process

When running `npm run build` in the electron directory, electron-builder will now:
1. Build the standard AppImage (as before)
2. Build a Flatpak package using the configuration in `electron-builder.json`
3. Output both packages to the `electron/dist/` directory

### Flatpak Configuration

The Flatpak package includes:

**Runtime & SDK:**
- org.freedesktop.Platform 23.08
- org.freedesktop.Sdk 23.08
- org.electronjs.Electron2.BaseApp 23.08

**Permissions:**
- Network access (for API calls and model downloads)
- Filesystem access (home directory)
- GPU acceleration (DRI device)
- Audio/Video (PulseAudio, camera, microphone)
- Display (X11 and Wayland)
- System integration (notifications, tray)

### Installation

Users can install the Flatpak in several ways:

1. **From local file:**
   ```bash
   flatpak install --user Nodetool-*.flatpak
   flatpak run ai.nodetool
   ```

2. **From GitHub releases:**
   - Download the .flatpak file from releases
   - Double-click to install (if xdg-desktop-portal is configured)
   - Or use the command line method above

3. **Future: From Flathub** (when submitted)
   ```bash
   flatpak install flathub ai.nodetool
   ```

## Benefits

### For Users

1. **Distribution-independent:** Works on any Linux distribution with Flatpak
2. **Sandboxed:** Enhanced security through containerization
3. **Automatic dependencies:** Runtime and dependencies are managed automatically
4. **Easy updates:** Flatpak handles updates seamlessly
5. **Consistent experience:** Same runtime across all distributions

### For Developers

1. **Single package:** One package works on all Linux distributions
2. **Reduced support burden:** Fewer distribution-specific issues
3. **Easy testing:** Test on any Linux distribution
4. **App store ready:** Can be submitted to Flathub

## Testing

To test the Flatpak build locally:

```bash
cd electron
npm install
npm run build

# Validate configuration
./validate-flatpak.sh

# Test installation
flatpak install --user dist/ai.nodetool-*.flatpak
flatpak run ai.nodetool
```

## CI/CD Integration

The GitHub Actions release workflow now automatically:
1. Builds Flatpak packages for Linux releases
2. Uploads them to GitHub releases alongside AppImage
3. Makes them available for download on the releases page

## Next Steps (Optional)

1. **Submit to Flathub:** Follow [Flathub submission guidelines](https://docs.flathub.org/)
2. **Add Flatpak badge:** Add Flathub badge to README after submission
3. **User feedback:** Gather feedback from Linux users on Flatpak experience

## Resources

- [electron-builder Flatpak docs](https://www.electron.build/configuration/flatpak)
- [Flatpak documentation](https://docs.flatpak.org/)
- [AppStream metadata specification](https://www.freedesktop.org/software/appstream/docs/)
- [Desktop Entry specification](https://specifications.freedesktop.org/desktop-entry-spec/)
