# Plotly Lazy Loading Optimization (2026-01-20)

## What

Lazy loaded the Plotly chart component (`react-plotly.js`) in `OutputRenderer.tsx` using React.lazy and Suspense.

## Why

Plotly is a heavy library (~4.6MB) that's only needed when rendering plotly_config type outputs. By lazy loading it:

1. **Reduced initial bundle parsing time**: The Plotly JavaScript doesn't need to be parsed on initial page load
2. **Code splitting**: Plotly is now in a separate chunk (`vendor-plotly-BaMK_cRD.js`)
3. **On-demand loading**: Users who never view plots won't load Plotly code
4. **Better caching**: Plotly chunk can be cached independently

## Implementation

1. Replaced static import with lazy import:
```typescript
// Before
import Plot from "react-plotly.js";

// After
const Plot = lazy(
  () =>
    import("react-plotly.js").then((module) => ({
      default: module.default
    })) as Promise<{ default: React.ComponentType<any> }>
);
```

2. Wrapped Plot component with Suspense and loading fallback:
```tsx
<Suspense fallback={<PlotlyLoadingFallback />}>
  <Plot data={...} layout={...} config={...} />
</Suspense>
```

3. Added loading indicator component:
```tsx
const PlotlyLoadingFallback = () => (
  <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
    <LinearProgress sx={{ width: "50%" }} />
  </div>
);
```

## Files Changed

- `web/src/components/node/OutputRenderer.tsx`

## Impact

- Bundle structure: Plotly now in separate chunk (was in main bundle)
- Initial load: Slight reduction in main bundle size
- Runtime: Plotly code only loaded when rendering plots
- User experience: Loading indicator shown while Plotly loads

## Verification

- TypeScript compilation: Passes
- ESLint: Passes
- Build: Successful with new chunk structure

## Related

- Previous optimization: Asset list virtualization (2026-01-16)
- Component memoization work (ongoing)
