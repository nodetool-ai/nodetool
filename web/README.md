# Web UI

React/TypeScript code for the NodeTool visual editor. Built with Vite and ReactFlow for drag-and-drop workflow building.

**Key paths:**

- `src/` - Frontend source
- `src/components/` - UI components
- `src/stores/` - State management
- `public/` - Static assets

**Development:**

```bash
npm start         # Run locally
npm run build     # Production build
```

## Mini App Routes

Two ways to run workflows:

### Full Mini App (`/apps/:workflowId`)

Standard app with header, panels, navigation:
- Access: `http://localhost:3000/apps/{workflow-id}`
- Part of main bundle
- Full UI features

### Standalone Mini App (`/miniapp/:workflowId`)

Lightweight standalone version:
- Access: `/miniapp/{workflow-id}` 
- Code-split lazy component
- No header, panels, or navigation
- Fast loading
- Good for sharing
