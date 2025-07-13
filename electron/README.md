# Electron Desktop App

This folder contains the Electron wrapper that packages NodeTool into a desktop application.
It bundles the web editor and apps into a cross-platform executable and adds
native integrations such as the system tray, file access, and auto-updates.

Key folders:

- `src/` – main process code and preload scripts
- `assets/` – icons and other static resources used by Electron
- `resources/` – templates and additional files bundled into the app

This app is built with React and Vite. In development you can launch the UI with
hot reload using:

```bash
npm run dev
```

To compile the Electron renderer and main process, run:

```bash
npm run build
```

Then start the desktop app with:

```bash
npm start
```

Use the build output in `dist-electron/` to create distributable packages.
