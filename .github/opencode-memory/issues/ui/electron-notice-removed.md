# Sound Notifications Electron-Only

**Problem**: The Settings menu showed "Only works in Electron app." notice under Sound Notifications in non-Electron environments, which was confusing.

**Solution**: Wrapped the Sound Notifications setting with `{isElectron && (...)}` conditional rendering and removed the notice text. The setting is now hidden entirely when not running in Electron.

**Date**: 2026-01-16
