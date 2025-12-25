# Standalone Mini App Implementation

## Overview

This implementation adds a separate, optimized route for running mini apps as standalone single-page applications without the main nodetool app components. The workflow ID is part of the route, and the build is optimized for fast load times.

## What Was Added

### 1. New HTML Entry Point (`miniapp.html`)
- Minimal HTML file (1.04 kB vs 2.21 kB for main app)
- No app branding or unnecessary metadata
- Optimized for embedding and fast loading

### 2. New React Entry Point (`src/miniapp.tsx`)
- Lightweight React entry with only essential providers
- Removed: MobileClassProvider, MenuProvider, KeyboardProvider, JobReconnectionManager, DownloadManagerDialog
- Kept: QueryClientProvider, ThemeProvider, WorkflowManagerProvider (required for workflow execution)
- 204 lines vs 392 lines in main `index.tsx`

### 3. Standalone Mini App Component (`src/components/miniapps/StandaloneMiniApp.tsx`)
- Clean implementation without app chrome (no AppHeader, PanelLeft, PanelBottom)
- Focused solely on workflow input forms and results
- Similar structure to MiniAppPage but stripped of navigation elements

### 4. Vite Multi-Page Build Configuration
- Updated `vite.config.ts` to support two entry points
- Separate bundles for main app and mini app
- Shared dependencies are automatically optimized by Vite

## Routes

### Full Mini App: `/apps/:workflowId`
- Includes full application chrome (header, left panel, bottom panel)
- Navigation to editor available
- Part of main application bundle

### Standalone Mini App: `/miniapp/:workflowId`
- **URL Format**: `/miniapp/{workflow-id}` (same for dev and production)
- **Entry File**: Served from `miniapp.html` in production
- Minimal UI - no app chrome
- Optimized for embedding and fast load times
- Separate bundle from main application

## Bundle Sizes

### Production Build Results:
- **Main App HTML**: 2.21 kB
- **Standalone Mini App HTML**: 1.04 kB (53% smaller)
- **Main App JS**: 893 kB
- **Mini App Entry JS**: 2.5 kB (gzipped: 1.07 kB)
- **Standalone Component JS**: 3.2 kB (gzipped: 1.60 kB)

Both bundles share the core workflow execution bundle (`useMetadata-Do30KQ7h.js` ~10.5 MB), which is necessary for workflow functionality.

## Usage

### Development
```bash
# Start dev server
cd web
npm start

# Access full mini app
http://localhost:3000/apps/[workflow-id]

# Access standalone mini app
http://localhost:3000/miniapp/[workflow-id]
```

### Production Build
```bash
# Build both entry points
cd web
npm run build

# Outputs:
# - dist/index.html (main app)
# - dist/miniapp.html (standalone mini app)
```

### Deployment
When deploying, configure your server to:
1. Serve `dist/index.html` for main app routes
2. Serve `dist/miniapp.html` for mini app routes (`/miniapp/*`)
3. Ensure proper routing for SPA (single-page app) behavior

Example nginx configuration:
```nginx
location / {
    try_files $uri $uri/ /index.html;
}

location /miniapp {
    try_files $uri $uri/ /miniapp.html;
}
```

## Key Differences

| Feature | Full Mini App (`/apps/:workflowId`) | Standalone Mini App (`/miniapp/:workflowId`) |
|---------|--------------------------------------|---------------------------------------------|
| HTML Size | 2.21 kB | 1.04 kB |
| Entry Bundle | Part of main app (~893 kB) | Separate mini bundle (~2.5 kB) |
| App Header | ✓ Yes | ✗ No |
| Left Panel | ✓ Yes | ✗ No |
| Bottom Panel | ✓ Yes | ✗ No |
| Navigation | ✓ Yes | ✗ No |
| Keyboard Shortcuts | ✓ Yes | ✗ No |
| Menu System | ✓ Yes | ✗ No |
| Mobile Support | ✓ Yes | ✓ Yes (basic) |
| Workflow Execution | ✓ Yes | ✓ Yes |
| Results Display | ✓ Yes | ✓ Yes |

## Benefits

1. **Fast Load Times**: Minimal HTML and separate small entry bundle
2. **Easy Embedding**: No app chrome makes it perfect for iframes
3. **Optimized Bundle**: Only includes what's needed for workflow execution
4. **Maintained Separately**: Changes to main app don't affect standalone mini app
5. **Production Ready**: Built and optimized by Vite

## Technical Details

### Provider Hierarchy (Standalone Mini App)
```
React.StrictMode
└── QueryClientProvider
    └── ThemeProvider
        └── WorkflowManagerProvider
            └── RouterProvider
                └── Route: /miniapp/:workflowId
                    └── ProtectedRoute
                        └── StandaloneMiniApp
```

### Provider Hierarchy (Full App)
```
React.StrictMode
└── QueryClientProvider
    └── JobReconnectionManager
    └── ThemeProvider
        └── MobileClassProvider
            └── MenuProvider
                └── WorkflowManagerProvider
                    └── KeyboardProvider
                        └── RouterProvider
                            └── Routes (including /apps/:workflowId)
                                └── DownloadManagerDialog
```

## Future Enhancements

Potential improvements for the standalone mini app:

1. **Query Parameter Support**: Allow workflow ID via query string for easier sharing
   - Example: `/miniapp.html?workflowId=abc123`
   
2. **Theme Customization**: Allow embedding sites to customize colors via query params
   - Example: `/miniapp.html?workflowId=abc123&theme=light`

3. **Custom Branding**: Support for custom logos and titles
   - Example: `/miniapp.html?workflowId=abc123&title=My%20Custom%20App`

4. **Further Bundle Optimization**: Code splitting for lazy-loaded workflow components

5. **Offline Support**: Service worker for PWA capabilities

## Testing

The implementation has been verified to:
- ✓ Build successfully with Vite
- ✓ Pass TypeScript compilation (1 pre-existing error in test file)
- ✓ Pass ESLint with no new errors (only pre-existing warnings)
- ✓ Generate separate optimized bundles
- ✓ Maintain all existing functionality in main app

Manual testing recommended:
1. Start dev server and navigate to `/miniapp/[workflow-id]`
2. Verify workflow loads without app chrome
3. Test workflow input and execution
4. Verify results display correctly
5. Test in embedded iframe
6. Verify production build serves correctly
