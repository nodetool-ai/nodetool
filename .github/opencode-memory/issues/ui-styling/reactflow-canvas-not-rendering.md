# ReactFlow Canvas Not Rendering

**Problem**: ReactFlow shows blank or tiny canvas.

**Solution**: Ensure container has explicit height:
```typescript
<Box sx={{ width: '100%', height: '100vh' }}>
  <ReactFlow nodes={nodes} edges={edges} />
</Box>
```

**Date**: 2026-01-10
