# Web UI

This folder contains the React/TypeScript code for the NodeTool visual editor.
The application is built with Vite and ReactFlow and provides the drag‑and‑drop
interface for creating and running workflows.

Important paths:

- `src/` – all front-end source code
- `src/components/` – reusable UI components
- `src/stores/` – state management with custom stores
- `public/` – static assets served by the dev server

Use `npm start` to run the editor locally. Production builds are generated with
`npm run build` and then packaged with the Electron app.
