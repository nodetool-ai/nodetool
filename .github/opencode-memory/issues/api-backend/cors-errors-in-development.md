# CORS Errors in Development

**Problem**: API calls fail with CORS errors in dev mode.

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

**Date**: 2026-01-10
