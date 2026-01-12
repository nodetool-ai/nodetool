# WebSocket Connection Failures

**Problem**: WebSocket fails to connect during workflow execution.

**Solution**: Check backend is running and CORS is configured:
```bash
# Backend must be running on port 7777
nodetool serve --port 7777

# Check health endpoint
curl http://localhost:7777/health
```

**Date**: 2026-01-10
