# Apps

This package contains the code for building standalone mini-apps from NodeTool workflows.
It is a Vite + React project that shares components with the main web editor.
The compiled assets are bundled with the Electron desktop app so users can run
custom apps outside of the full editor.

Key folders:

- `src/components` – React components used across generated apps
- `src/stores` – Zustand stores for app state management
- `src/styles` – Shared styling for app UIs

Run `npm start` during development to launch a local server. Use `npm run build`
to produce a static build that can be packaged with Electron.
