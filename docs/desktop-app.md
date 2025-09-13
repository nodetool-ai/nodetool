---
layout: default
title: Desktop App
---

The Electron wrapper packages the web editor into a cross‑platform desktop application. It also adds native integrations not available in the browser.

### System tray

- Quick access to your workflows from a tray icon.
- Run workflows or open the chat overlay without launching the full editor.
- Background updates keep everything in sync.

### Mini apps

- Workflows can be exported as standalone apps via the **Apps** project.
- Each app bundles only the components it needs, keeping downloads small.

### Updating

- Automatic update checks ensure you always have the latest features.
- Logs can be viewed during installation to track progress.

Use `npm run build` in the `electron` folder to generate a distributable package.
