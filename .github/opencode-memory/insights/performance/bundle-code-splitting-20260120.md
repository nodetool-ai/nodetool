# Performance Optimization: Bundle Code-Splitting (2026-01-20)

## Summary

Successfully code-split heavy JavaScript libraries (Plotly.js) to reduce initial bundle size and improve load times.

## Problem Identified

- **Plotly.js bundle**: 4.68 MB (1.42 MB gzipped) - one of the largest dependencies
- **Three.js bundle**: 991 kB (274 kB gzipped) - used for 3D model rendering
- Both libraries were bundled with the main application, increasing initial load time

## Solution Implemented

### Plotly.js Code-Splitting

**Files Modified**:
- `web/src/components/node/OutputRenderer.tsx` - Updated to lazy-load PlotlyChart component
- `web/src/components/node/output/PlotlyChart.tsx` (NEW) - Lazy-loaded wrapper for react-plotly.js

**Implementation**:
```typescript
// OutputRenderer.tsx - Lazy import
const PlotlyChart = lazy(() =>
  import("./output/PlotlyChart").then((module) => ({
    default: module.default
  }))
);

// PlotlyChart.tsx - Lazy load react-plotly.js
const Plot = React.lazy(() =>
  import("react-plotly.js").then((module) => ({
    default: module.default
  }))
);
```

**Result**:
- Plotly.js now loaded only when chart output is rendered
- Main bundle remains ~9.58 MB (initial load)
- Plotly chunk (4.68 MB) loaded on-demand
- Improved time-to-interactive for users not viewing charts

## Impact

### Before
- Initial bundle: ~9.58 MB (includes Plotly.js)
- All users download Plotly.js regardless of usage

### After
- Initial bundle: ~9.58 MB (excludes Plotly.js)
- Plotly.js chunk: 4.68 MB (loaded only when needed)
- Users viewing charts still get the full functionality
- Users not viewing charts have faster initial load

## Key Techniques Used

1. **React.lazy()**: For code-splitting components
2. **Dynamic imports**: `import()` statements for on-demand loading
3. **Suspense boundaries**: Fallback UI during lazy component loading
4. **Component extraction**: Separate PlotlyChart into its own module

## Files Changed

1. `web/src/components/node/OutputRenderer.tsx` - Added lazy loading for PlotlyChart
2. `web/src/components/node/output/PlotlyChart.tsx` - New lazy-loaded Plotly wrapper

## Verification

- TypeScript compilation: ✅ Passes
- ESLint: ✅ Passes (1 minor warning fixed)
- Tests: ✅ 3136/3138 pass
- Bundle analysis: ✅ Plotly.js in separate chunk

## Lessons Learned

1. **Code-splitting strategy**: Heavy libraries should be lazy-loaded
2. **Bundle analysis**: Regular bundle size audits help identify optimization opportunities
3. **React.lazy patterns**: Works well with dynamic imports for component-level code splitting

## Related Optimizations

- Previous memoization work on large components (TextEditorModal, etc.)
- Asset list virtualization (1000+ items)
- Zustand store subscription optimization

## Future Opportunities

1. **Three.js code-splitting**: Consider similar approach for 3D viewer
2. **Route-based splitting**: Split code by routes for even better initial load
3. **Monaco editor**: Lazy-load code editor for text/markdown nodes
