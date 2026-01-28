# Electron App Distribution

**Insight**: Electron app bundles web build and Python environment.

**Process**:
1. Build web app (`cd web && npm run build`)
2. Package with electron-builder
3. Include micromamba for Python environment
4. Auto-update via electron-updater

**Platforms**: Windows, macOS (Intel + Apple Silicon), Linux

**Date**: 2026-01-10
