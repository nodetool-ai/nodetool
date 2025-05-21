# Electron Desktop App

This folder contains the Electron wrapper that packages NodeTool into a desktop application.
It bundles the web editor and apps into a cross-platform executable and adds
native integrations such as the system tray, file access, and auto-updates.

Key folders:

- `src/` – main process code and preload scripts
- `assets/` – icons and other static resources used by Electron
- `resources/` – templates and additional files bundled into the app

Run `npm start` to launch the desktop app in development mode. Use `npm run build`
to produce a distributable package.
