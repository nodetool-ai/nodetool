# Flatpak Build Fix - Testing and Verification Guide

## Problem Description

The GitHub Actions release workflow was failing during the flatpak build step with the error:
```
flatpak-builder failed with status code 1
```

The AppImage build succeeded, but the flatpak build failed silently without detailed error messages.

## Root Cause Analysis

After analyzing the @malept/flatpak-bundler source code and the workflow logs, we identified two issues:

1. **Runtime Installation Location**: The workflow installed flatpak runtimes system-wide using `sudo flatpak install`, but the @malept/flatpak-bundler checks for both user and system installations. Installing system-wide can cause permission issues when the bundler tries to access the runtimes.

2. **Missing Debug Logging**: The bundler uses the `debug` npm package to log stderr/stdout from flatpak-builder, but this logging was not enabled. The DEBUG environment variable was set to `electron-builder` but not `@malept/flatpak-bundler`, so the actual error from flatpak-builder was not visible in the logs.

## Solution Implemented

### Changes to `.github/workflows/release.yaml`

#### 1. Install Flatpak Runtimes in User Space (Lines 370-372)

**Before:**
```yaml
sudo flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
sudo flatpak install -y flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08
sudo flatpak install -y flathub org.electronjs.Electron2.BaseApp//24.08
```

**After:**
```yaml
flatpak remote-add --user --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo
flatpak install --user -y flathub org.freedesktop.Platform//24.08 org.freedesktop.Sdk//24.08
flatpak install --user -y flathub org.electronjs.Electron2.BaseApp//24.08
```

**Why this fixes it:**
- Removes `sudo` to install runtimes in user space instead of system-wide
- The @malept/flatpak-bundler checks both user and system installs (see bundler code lines 122-143)
- User installation avoids permission issues when the bundler accesses the runtimes
- More consistent with how electron-builder expects to find flatpak resources

#### 2. Enable Debug Logging (Line 380)

**Before:**
```yaml
DEBUG: electron-builder
```

**After:**
```yaml
DEBUG: electron-builder,@malept/flatpak-bundler
```

**Why this helps:**
- Enables detailed logging from the flatpak bundler
- Will show stderr/stdout from flatpak-builder command
- Helps diagnose any remaining issues quickly

## Testing Instructions

### Option 1: Quick Validation (No Build)

Run the validation script to check configuration:

```bash
cd electron
bash validate-flatpak.sh
```

This verifies:
- All required files exist (desktop, metainfo, icons)
- Configuration files are valid (JSON, YAML, XML)
- Dependencies are installed

### Option 2: Local Flatpak Build Test

If you have flatpak installed on your system, you can test the full build:

```bash
cd electron
bash test-flatpak-build.sh
```

This script will:
1. Install flatpak runtimes in user space (same as CI)
2. Validate the configuration
3. Attempt a full electron build with flatpak target
4. Show detailed output and results

**Prerequisites:**
- Linux system with flatpak and flatpak-builder installed
- Node.js and npm installed
- Web app built first: `cd ../web && npm install && npm run build`

### Option 3: Verify in CI

Push the changes and monitor the GitHub Actions workflow:

1. Go to: https://github.com/nodetool-ai/nodetool/actions
2. Find the "Release" workflow run
3. Check the "Build Electron (macOS/Linux)" step for ubuntu-latest
4. Look for:
   - Flatpak runtimes installation succeeding
   - Detailed debug output from @malept/flatpak-bundler
   - Both AppImage and flatpak files being created
   - Upload artifacts step including `*.flatpak` files

## Expected Results

### Success Indicators

1. **Runtime Installation:**
   ```
   Installing org.freedesktop.Platform//24.08...
   ✓ Installation complete
   Installing org.freedesktop.Sdk//24.08...
   ✓ Installation complete
   Installing org.electronjs.Electron2.BaseApp//24.08...
   ✓ Installation complete
   ```

2. **Build Output:**
   ```
   • building        target=AppImage arch=x64 file=dist/Nodetool-X.X.X-x86_64.AppImage
   • building        target=flatpak arch=x64 file=dist/Nodetool-X.X.X-x86_64.flatpak
   ```

3. **Artifacts:**
   - `Nodetool-X.X.X-x86_64.AppImage`
   - `Nodetool-X.X.X-x86_64.flatpak`
   - `latest-linux.yml`

### Detailed Logging

With the DEBUG flag enabled, you should now see output like:
```
@malept/flatpak-bundler Using manifest...
@malept/flatpak-bundler Using options...
@malept/flatpak-bundler Ensuring runtime is up to date
@malept/flatpak-bundler $ flatpak-builder --arch x86_64 --force-clean ...
@malept/flatpak-bundler 1> Downloading sources...
@malept/flatpak-bundler 1> Building module nodetool...
```

If there's an error, you'll now see the actual stderr from flatpak-builder.

## Why These Changes Work

### Understanding @malept/flatpak-bundler

The bundler (from `electron/node_modules/@malept/flatpak-bundler/index.js`):

1. **Checks for Runtime Installations** (lines 85-91):
   ```javascript
   async function checkInstalled (id, options, version, checkUser) {
     const args = ['info']
     addCommandLineOption(args, 'show-commit', true)
     addCommandLineOption(args, checkUser ? 'user' : 'system', true)
     args.push([id, options.arch, version].join('/'))
     return spawnWithLogging(options, 'flatpak', args, true)
   }
   ```

2. **Tries Both User and System** (lines 122-143):
   ```javascript
   const [userInstall, systemInstall] = await Promise.all([
     checkInstalled(id, options, version, true),
     checkInstalled(id, options, version, false)
   ])
   ```

3. **Logs via Debug Package** (lines 60-64):
   ```javascript
   child.stdout.on('data', (data) => {
     logger(`1> ${data}`)
   })
   child.stderr.on('data', (data) => {
     logger(`2> ${data}`)
   })
   ```

By installing in user space and enabling debug logging, we ensure:
- The bundler can find the runtimes
- Any errors are visible in the logs
- No permission issues when accessing the runtimes

## Additional Notes

### Why Not System Install?

While system install with `sudo` technically works, it can cause issues:
- The GitHub Actions runner may have permission restrictions
- The bundler runs as the current user and may not have access to system-wide runtimes
- User install is the recommended approach for CI/CD environments

### Alternative Solutions Considered

1. **Provide flatpakref URLs**: Add `runtimeFlatpakref`, `sdkFlatpakref`, and `baseFlatpakref` to electron-builder.json
   - More complex configuration
   - Would require the bundler to download runtimes (slower)
   - Current solution is simpler

2. **Use flatpak-builder directly**: Skip @malept/flatpak-bundler and use ai.nodetool.NodeTool.yml
   - Would require rewriting the build process
   - electron-builder integration is more maintainable

3. **Disable flatpak build**: Remove from targets
   - Doesn't solve the problem
   - Users want flatpak packages

## Files Modified

- `.github/workflows/release.yaml` - Fixed runtime installation and added debug logging

## Files Created

- `electron/test-flatpak-build.sh` - Test script for local verification
- `electron/FLATPAK_BUILD_FIX.md` - This documentation

## References

- [@malept/flatpak-bundler source code](https://github.com/malept/flatpak-bundler)
- [electron-builder flatpak documentation](https://www.electron.build/configuration/flatpak)
- [Flatpak documentation](https://docs.flatpak.org/)
- [GitHub Actions workflow run #21808193596](https://github.com/nodetool-ai/nodetool/actions/runs/21808193596)
