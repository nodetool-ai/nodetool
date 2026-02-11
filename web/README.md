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

## Mini App & Standalone Routes

The application supports multiple app-focused routes:

### Full Mini App (`/apps/:workflowId`)

The full mini app includes the standard application chrome (header, left panel, bottom panel):
- Access via: `http://localhost:3000/apps/{workflow-id}`
- Built as part of the main application bundle
- Includes navigation and additional UI features
- `workflowId` is optional (`/apps` opens the app page without preselecting a workflow)

### Standalone Mini App (`/miniapp/:workflowId`)

A lightweight, standalone version with minimal UI for embedding or fast loading:
- Access via: `/miniapp/{workflow-id}` (same for both dev and production)
- Code-split lazy-loaded component in the main build
- No application header, panels, or navigation
- Optimized for fast load times with React code splitting
- Perfect for sharing workflows as standalone apps

### Standalone Chat (`/standalone-chat/:thread_id?`)

A full-page chat route that keeps side/bottom panels while removing the standard app header:
- Access via: `/standalone-chat` or `/standalone-chat/{thread-id}`
- Uses the standalone chat container UI with optional thread deep-linking
- Useful for chat-first experiences that still need panel tooling
