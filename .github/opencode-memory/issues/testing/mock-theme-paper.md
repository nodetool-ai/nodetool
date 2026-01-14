# Missing Paper Palette in Mock Theme

**Problem**: `ViewportStatusIndicator` component uses `theme.vars.palette.Paper.paper` for background color, but the mock theme was missing this property causing test failures.

**Solution**: Added `Paper` palette entry to the mock theme in `themeMock.ts`:
```typescript
Paper: {
  paper: "#232323",
  paperBg: "#232323"
}
```

**Files**:
- `web/src/__mocks__/themeMock.ts`

**Date**: 2026-01-14
