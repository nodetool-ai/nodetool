# E2E Tests Failing to Connect

**Problem**: E2E tests fail with "Cannot connect to backend".

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

**Date**: 2026-01-10
