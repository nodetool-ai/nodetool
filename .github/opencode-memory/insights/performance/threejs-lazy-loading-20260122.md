# Three.js Lazy Loading - Performance Optimization (2026-01-22)

## Issue

The Three.js 3D rendering library (991 KB gzipped: 274 KB) was being loaded eagerly on every page load, even though most users never view 3D models. This unnecessarily increased initial bundle size and load time.

## Solution

Implemented lazy loading for the Model3DViewer component using React's `Suspense` and `lazy`:

1. **Created LazyModel3DViewer wrapper** (`web/src/components/node/output/LazyModel3DViewer.tsx`)
   - Uses `React.lazy()` to dynamically import Three.js-dependent component
   - Shows loading spinner while 3D viewer loads
   - Memoized with `React.memo` to prevent re-renders

2. **Updated OutputRenderer** (`web/src/components/node/OutputRenderer.tsx`)
   - Changed import from direct Model3DViewer to lazy-loaded version
   - Maintains same API and functionality

## Impact

- **Initial bundle reduced**: Three.js no longer in main bundle
- **Faster initial load**: Users who don't view 3D models never download Three.js
- **On-demand loading**: 3D viewer loads only when user views a 3D model
- **Smooth UX**: Loading spinner provides feedback during lazy load

## Files Changed

- `web/src/components/node/output/LazyModel3DViewer.tsx` (NEW)
- `web/src/components/node/OutputRenderer.tsx` (updated import)

## Verification

- Build succeeds with no errors
- Three.js now in separate chunk (`vendor-three-*.js`)
- Main bundle size reduced by ~1 MB
