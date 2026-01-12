# MUI Theme Not Applied

**Problem**: Components don't use theme colors/spacing.

**Solution**: Always use theme values:
```typescript
// ❌ Bad
<Box sx={{ padding: '16px', backgroundColor: '#1976d2' }}>

// ✅ Good
<Box sx={{ p: 2, bgcolor: 'primary.main' }}>
```

**Date**: 2026-01-10
