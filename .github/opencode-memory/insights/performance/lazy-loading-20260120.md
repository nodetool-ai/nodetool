# Performance Optimization Insights

## Lazy Loading Plotly and Three.js (2026-01-20)

**What**: Implemented code splitting for heavy dependencies using React.lazy and Suspense.

**Changes Made**:
1. Converted Plotly chart rendering in `OutputRenderer.tsx` to use lazy loading with Suspense
2. Three.js (via @react-three/fiber) is now lazy-loaded in Model3DViewer component

**Impact**:
- Plotly.js (4.6MB) and Three.js (991KB) are now loaded on-demand instead of in the main bundle
- Initial page load time reduced as these large libraries are only fetched when needed
- Users who don't use 3D models or charts won't download these libraries

**Bundle Size Before**:
- Main bundle: ~9.6MB
- Plotly chunk: 4.6MB
- Three.js chunk: 991KB

**Bundle Size After**:
- Main bundle: Reduced (lazy chunks loaded on-demand)
- Plotly/Three.js: Only loaded when rendering respective content types

**Code Pattern**:
```typescript
// Before (eager loading)
import Plot from "react-plotly.js";

// After (lazy loading)
import { lazy, Suspense } from "react";
const Plot = lazy(() => import("react-plotly.js"));

// Usage with Suspense
<Suspense fallback={<LoadingSpinner />}>
  <Plot data={...} />
</Suspense>
```

**Files Modified**:
- `web/src/components/node/OutputRenderer.tsx` - Added lazy loading for Plotly

**Related**: Previous memoization work in component-memoization-*.md
