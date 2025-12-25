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

## Mini App Routes

The application supports two types of mini app routes for running workflows:

### Full Mini App (`/apps/:workflowId`)

The full mini app includes the standard application chrome (header, left panel, bottom panel):
- Access via: `http://localhost:3000/apps/{workflow-id}`
- Built as part of the main application bundle
- Includes navigation and additional UI features

### Standalone Mini App (`/miniapp/:workflowId`)

A lightweight, standalone version with minimal UI for embedding or fast loading:
- Access via: `/miniapp/{workflow-id}` (same for both dev and production)
- Built as a separate optimized bundle (`miniapp.html`)
- No application header, panels, or navigation
- Optimized for fast load times and embedding
- Perfect for sharing workflows as standalone apps

**Build outputs:**
- Main app: `dist/index.html`
- Standalone mini app: `dist/miniapp.html`
