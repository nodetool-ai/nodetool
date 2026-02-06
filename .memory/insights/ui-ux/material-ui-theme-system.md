# Material-UI Theme System

**Insight**: Consistent use of theme values (spacing, colors) improves maintainability and theming.

**Best Practices**:
```typescript
// Use sx prop with theme values
<Box sx={{ 
  p: 2,                    // padding: theme.spacing(2)
  mb: 1,                   // marginBottom: theme.spacing(1)
  bgcolor: 'primary.main', // theme.palette.primary.main
}}>
```

**Benefits**:
- Automatic dark/light mode support
- Consistent spacing throughout app
- Easy theme customization

**Date**: 2026-01-10
