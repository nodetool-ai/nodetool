# ESC Key for Asset Viewer

**Problem**: Issue requested adding ESC key functionality to exit the asset viewer.

**Solution**: The ESC key functionality was already implemented in `web/src/components/assets/AssetViewer.tsx` at line 399 using `useCombo(["Escape"], handleClose)`. The KeyPressedStore handles the global keyboard events via window listeners.

**Date**: 2026-01-16
