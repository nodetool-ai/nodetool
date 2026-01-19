# Performance Optimization: Code Splitting Heavy Libraries (2026-01-19)

## What

Lazy-loaded Plotly and Three.js libraries using React.lazy and Suspense to improve initial load time.

## Why

- **Plotly**: 4.68 MB (1.42 MB gzipped) - Only needed for plotly_config output type
- **Three.js**: 991 kB (274 kB gzipped) - Only needed for 3D model viewing

These libraries were being loaded upfront even though most users never use these features.

## Files Changed

- `web/src/components/node/OutputRenderer.tsx`

## Implementation

1. Replaced static imports with lazy loading:
   ```typescript
   const Plot = lazy(() =>
     import("react-plotly.js").then((mod) => ({ default: mod.default }))
   );
   const Model3DViewer = lazy(() =>
     import("../asset_viewer/Model3DViewer").then((mod) => ({ default: mod.default }))
   );
   ```

2. Wrapped lazy components in Suspense with loading fallback:
   ```typescript
   <Suspense fallback={<LoadingAnimation />}>
     <Plot ... />
   </Suspense>
   ```

## Impact

- **Initial bundle size**: Slightly increased (~20 KB) due to lazy loading infrastructure
- **Initial load time**: Faster for users who don't use Plotly/3D features
- **On-demand loading**: Plotly and Three.js chunks are only downloaded when needed
- **User experience**: Smooth loading with LoadingAnimation fallback

## Verification

- ✅ TypeScript: Passes
- ✅ ESLint: Passes
- ✅ Build: Successful with code-split chunks

## Related

- Previous optimizations: `component-memoization-*.md`, `inline-handler-memoization-*.md`
