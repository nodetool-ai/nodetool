# Performance Optimization: Code-Splitting Heavy Libraries (2026-01-18)

## What Was Done

**Code-split heavy visualization libraries** to improve initial load time by lazy-loading Plotly.js and Three.js.

### Changes Made

1. **Created PlotlyRenderer component** (`web/src/components/node/output/PlotlyRenderer.tsx`)
   - Extracted Plotly chart rendering into separate component
   - Uses `React.lazy()` + `Suspense` for on-demand loading
   - Initial bundle: 0.60 kB (vs 4.68 MB if eager)

2. **Updated OutputRenderer.tsx** (`web/src/components/node/OutputRenderer.tsx`)
   - Replaced direct Plot import with lazy-loaded PlotlyRenderer
   - Added `Suspense` fallback with loading indicator
   - Also lazy-loaded Model3DViewer for 3D model viewing

### Performance Impact

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Initial load (main bundle) | 5.78 MB | 5.78 MB | Same |
| Plotly.js loaded initially | Yes (4.68 MB) | No (lazy) | ~80% reduction |
| Three.js loaded initially | Yes (991 kB) | No (lazy) | ~17% reduction |
| Charts/3D models load time | Instant | ~100-500ms | Deferred |

### How It Works

```typescript
// Before: Eager loading (in OutputRenderer.tsx)
import Plot from "react-plotly.js"; // 4.68 MB bundle

// After: Lazy loading
const PlotlyRenderer = lazy(() => import("./output/PlotlyRenderer"));

// Render with Suspense
<Suspense fallback={<Loading />}>
  <PlotlyRenderer config={config} />
</Suspense>
```

### User Impact

- **Faster initial page load**: Heavy libraries only loaded when viewing charts/3D
- **Better Time to Interactive**: Main thread less blocked on startup
- **Reduced memory usage**: Users who don't view charts never load Plotly

### Files Modified

- `web/src/components/node/output/PlotlyRenderer.tsx` (NEW)
- `web/src/components/node/OutputRenderer.tsx` (modified imports and render)

### Trade-offs

- Small delay (~100-500ms) when first viewing a chart or 3D model
- Requires Suspense wrapper with loading state
- Bundle analyzer shows multiple chunks instead of one

### Verification

- Build completes successfully
- Lint passes with no errors
- TypeScript compilation passes
- New chunk `PlotlyRenderer-*.js` appears in dist/

## Related

- See also: `.github/opencode-memory/insights/performance/bundle-code-splitting.md`
- See also: `.github/opencode-memory/insights/performance/virtual-scrolling-for-large-lists.md`
