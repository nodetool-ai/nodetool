# Common Issues and Solutions

This file tracks recurring problems and their solutions to avoid redundant debugging.

## TypeScript Issues

### ReactFlow Node Type Mismatches

**Issue**: TypeScript complains about ReactFlow node types not matching custom NodeData interface.

**Solution**: Use explicit type casting:
```typescript
const nodes = reactFlowNodes as Node<NodeData>[];
```

**Why**: ReactFlow's internal types are generic and don't know about our custom NodeData.

**Files**: `web/src/stores/NodeStore.ts`, ReactFlow-related components

---

### Zustand Store Type Inference

**Issue**: TypeScript can't infer store types properly.

**Solution**: Define state interface before store:
```typescript
interface MyStoreState {
  items: Item[];
  addItem: (item: Item) => void;
}

const useMyStore = create<MyStoreState>((set) => ({
  items: [],
  addItem: (item) => set((state) => ({ 
    items: [...state.items, item] 
  }))
}));
```

**Files**: `web/src/stores/*`

---

## Build Issues

### Memory Issues During Build

**Issue**: Build fails with "JavaScript heap out of memory".

**Solution**: Increase Node.js memory:
```bash
NODE_OPTIONS=--max-old-space-size=4096 npm run build
```

**Why**: Large TypeScript compilation and bundling needs more heap space.

---

### Electron Build Before Web

**Issue**: Electron app shows blank screen or errors.

**Solution**: Always build web before electron:
```bash
cd web && npm run build
cd ../electron && npm start
```

**Why**: Electron serves the built web app, not the source.

---

## Testing Issues

## Testing Issues

### Mocking Zustand Stores in Tests

**Issue**: When mocking Zustand stores in tests, the mock must return the result of calling the selector function, not just the store object.

**Solution**: Use the selector pattern in mockImplementation:
```typescript
// ❌ Bad
(useNotificationStore as unknown as jest.Mock).mockImplementation(() => ({
  addNotification: jest.fn(),
}));

// ✅ Good
(useNotificationStore as unknown as jest.Mock).mockImplementation((selector: any) =>
  selector({ addNotification: jest.fn() })
);
```

**Why**: Components use selective subscriptions like:
```typescript
const addNotification = useNotificationStore((state) => state.addNotification);
```
The mock needs to return what the selector returns when called with the store state.

**Files**: `web/src/components/node_menu/__tests__/FavoritesTiles.test.tsx`

---

### E2E Tests Failing to Connect

**Issue**: E2E tests fail with "Cannot connect to backend".

**Solution**: Ensure Playwright config is starting servers correctly:
```typescript
// playwright.config.ts
webServer: [
  {
    command: 'nodetool serve --port 7777',
    port: 7777,
    timeout: 120000,
  },
  {
    command: 'npm start',
    port: 3000,
    timeout: 120000,
  }
]
```

**Manual debugging**:
```bash
# Terminal 1
conda activate nodetool
nodetool serve --port 7777

# Terminal 2
cd web && npm start
```

---

### Port Already in Use

**Issue**: E2E tests or dev server fails with "Port 7777 (or 3000) already in use".

**Solution**: Kill existing process:
```bash
lsof -ti:7777 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

---

### Jest Can't Find Modules

**Issue**: Jest tests fail with "Cannot find module" for TypeScript imports.

**Solution**: Ensure jest.config.js has proper transform:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
};
```

---

## Lint/Type Check Issues

### `any` Type Usage

**Issue**: ESLint error `@typescript-eslint/no-explicit-any`.

**Solution**: Use explicit types:
```typescript
// ❌ Bad
function process(data: any) { }

// ✅ Good
interface Data {
  id: string;
  value: number;
}
function process(data: Data) { }

// Or for truly unknown data:
function process(data: unknown) {
  if (typeof data === 'object' && data !== null) {
    // Type guard
  }
}
```

---

### Empty Catch Blocks

**Issue**: ESLint error `no-empty` for empty catch blocks.

**Solution**: Add comment explaining why catch is empty:
```typescript
try {
  JSON.parse(jsonString);
} catch (error) {
  // JSON parse failed, return original string as fallback
  return jsonString;
}
```

---

### Strict Equality

**Issue**: ESLint error `eqeqeq` for using `==` instead of `===`.

**Solution**: Use strict equality:
```typescript
// ❌ Bad
if (value == null) { }

// ✅ Good
if (value === null) { }

// Exception: checking both null and undefined
if (value == null) { } // OK, intentional loose equality
```

---

## State Management Issues

### Unnecessary Re-renders

**Issue**: Component re-renders too often, causing performance issues.

**Solution**: Use Zustand selectors properly:
```typescript
// ❌ Bad - subscribes to entire store
const store = useNodeStore();
const node = store.nodes[nodeId];

// ✅ Good - subscribes only to this node
const node = useNodeStore(state => state.nodes[nodeId]);
```

---

### Zustand Temporal (Undo/Redo) Issues

**Issue**: Undo/redo not working for certain state changes.

**Solution**: Ensure temporal middleware is properly configured:
```typescript
const useStore = create<State>()(
  temporal(
    (set) => ({
      // state and actions
    }),
    { limit: 50 } // optional: limit history
  )
);
```

---

## UI/Styling Issues

### MUI Theme Not Applied

**Issue**: Components don't use theme colors/spacing.

**Solution**: Always use theme values:
```typescript
// ❌ Bad
<Box sx={{ padding: '16px', backgroundColor: '#1976d2' }}>

// ✅ Good
<Box sx={{ p: 2, bgcolor: 'primary.main' }}>
```

---

### ReactFlow Canvas Not Rendering

**Issue**: ReactFlow shows blank or tiny canvas.

**Solution**: Ensure container has explicit height:
```typescript
<Box sx={{ width: '100%', height: '100vh' }}>
  <ReactFlow nodes={nodes} edges={edges} />
</Box>
```

---

## API/Backend Issues

### WebSocket Connection Failures

**Issue**: WebSocket fails to connect during workflow execution.

**Solution**: Check backend is running and CORS is configured:
```bash
# Backend must be running on port 7777
nodetool serve --port 7777

# Check health endpoint
curl http://localhost:7777/health
```

---

### CORS Errors in Development

**Issue**: API calls fail with CORS errors in dev mode.

**Solution**: Vite proxy is configured in vite.config.ts:
```typescript
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:7777',
      changeOrigin: true,
    },
  },
}
```

---

## Dependency Issues

### npm install Failures

**Issue**: `npm install` fails with peer dependency errors.

**Solution**: Use `npm ci` instead (uses lock file):
```bash
rm -rf node_modules
npm ci
```

---

### Playwright Browsers Not Installed

**Issue**: E2E tests fail with "Executable doesn't exist".

**Solution**: Install Playwright browsers:
```bash
cd web
npx playwright install chromium
```

---

## Git/CI Issues

### Pre-commit Hooks Failing

**Issue**: Git commit fails due to husky pre-commit hooks.

**Solution**: Fix lint/type errors first:
```bash
make lint-fix
make typecheck
```

Or skip hooks (not recommended):
```bash
git commit --no-verify
```

---

### CI Tests Passing Locally But Failing in GitHub Actions

**Issue**: Tests pass locally but fail in CI.

**Common Causes**:
1. **Environment differences**: CI uses clean environment
2. **Timing issues**: CI may be slower, increase timeouts
3. **Dependencies**: Use `npm ci` not `npm install` in CI

**Solution**: Run tests in clean environment locally:
```bash
rm -rf node_modules
npm ci
npm test
```

---

## Electron-Specific Issues

### Electron Shows Blank Window

**Issue**: Electron app opens but shows blank window.

**Solution**: 
1. Build web first: `cd web && npm run build`
2. Check DevTools for errors: View → Toggle Developer Tools
3. Check main process logs

---

### Native Module Issues

**Issue**: Native modules don't work in Electron.

**Solution**: Rebuild for Electron:
```bash
cd electron
npm run postinstall  # Rebuilds native modules
```

---

## How to Add New Issues

When you encounter and solve a new issue:

1. **Be specific**: Include error messages, file paths
2. **Provide solution**: Working code/commands
3. **Explain why**: Help others understand
4. **Date it**: Add timestamp if time-sensitive
5. **Update if resolved**: Remove if no longer relevant

## Last Updated

2026-01-10 - Initial memory system creation
