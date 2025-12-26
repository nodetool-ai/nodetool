# Standalone Mini App Implementation

## Overview

This implementation adds a code-split route for running mini apps as standalone single-page applications without the main nodetool app components. The workflow ID is part of the route, and React's code splitting ensures fast load times.

## What Was Added

### 1. Standalone Mini App Component (`src/components/miniapps/StandaloneMiniApp.tsx`)
- Clean implementation without app chrome (no AppHeader, PanelLeft, PanelBottom)
- Focused solely on workflow input forms and results
- Similar structure to MiniAppPage but stripped of navigation elements
- Lazy-loaded via React.lazy() for automatic code splitting

### 2. Route in Main App (`src/index.tsx`)
- Added `/miniapp/:workflowId` route to existing router
- Lazy-loaded component ensures minimal initial bundle impact
- Uses existing providers and infrastructure from main app

## Routes

### Full Mini App: `/apps/:workflowId`
- Includes full application chrome (header, left panel, bottom panel)
- Navigation to editor available
- Part of main application bundle

### Standalone Mini App: `/miniapp/:workflowId`
- **URL Format**: `/miniapp/{workflow-id}` (same for dev and production)
- **Loading**: Lazy-loaded with React code splitting
- Minimal UI - no app chrome
- Optimized for embedding and fast load times
- Automatically split into separate chunk by bundler

## Code Splitting

The standalone mini app uses React's built-in code splitting:

```typescript
const StandaloneMiniApp = React.lazy(
  () => import("./components/miniapps/StandaloneMiniApp")
);
```

This ensures:
- The component is only loaded when the route is accessed
- Smaller initial bundle for the main app
- Automatic chunk optimization by Vite


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
# Build the application
cd web
npm run build

# Output: dist/index.html (single build with code splitting)
# The standalone mini app component is automatically split into a separate chunk
```

### Deployment
Standard SPA deployment:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

The `/miniapp/:workflowId` route works the same as any other route - it's handled by the client-side router with lazy loading for the component.

## Key Differences

| Feature | Full Mini App (`/apps/:workflowId`) | Standalone Mini App (`/miniapp/:workflowId`) |
|---------|--------------------------------------|---------------------------------------------|
| Entry | Same main bundle | Same main bundle |
| Component Loading | Lazy-loaded | Lazy-loaded |
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

1. **Code Splitting**: Component only loads when route is accessed
2. **Easy Embedding**: No app chrome makes it perfect for iframes
3. **Simplified Architecture**: Uses main app infrastructure
4. **Maintained Together**: Changes to main app benefit both routes
5. **Production Ready**: Built and optimized by Vite with automatic chunking

## Technical Details

### Provider Hierarchy (Both Routes)

Both routes share the same provider hierarchy from the main app:

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
                            └── Route: /miniapp/:workflowId
                                └── ProtectedRoute
                                    └── StandaloneMiniApp (lazy-loaded)
```

The difference is in the component rendering:
- `/apps/:workflowId` renders with AppHeader, PanelLeft, PanelBottom
- `/miniapp/:workflowId` renders only StandaloneMiniApp component

## Future Enhancements

Potential improvements for the standalone mini app:

1. **Query Parameter Support**: Allow workflow ID via query string for easier sharing
   - Example: `/miniapp?workflowId=abc123`
   
2. **Theme Customization**: Allow embedding sites to customize colors via query params
   - Example: `/miniapp?workflowId=abc123&theme=light`

3. **Custom Branding**: Support for custom logos and titles
   - Example: `/miniapp?workflowId=abc123&title=My%20Custom%20App`

4. **Further Optimization**: Additional code splitting for workflow-specific components

5. **Offline Support**: Service worker for PWA capabilities

## Testing

The implementation has been verified to:
- ✓ Build successfully with Vite
- ✓ Pass TypeScript compilation (1 pre-existing error in test file)
- ✓ Pass ESLint with no new errors (only pre-existing warnings)
- ✓ Use React code splitting for optimal loading
- ✓ Maintain all existing functionality in main app

Manual testing recommended:
1. Start dev server and navigate to `/miniapp/[workflow-id]`
2. Verify workflow loads without app chrome
3. Test workflow input and execution
4. Verify results display correctly
5. Test in embedded iframe
6. Check that component is lazy-loaded in browser dev tools
