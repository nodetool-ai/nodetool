# Plotly Lazy Loading (2026-01-21)

## Issue Found

**Bundle bloat**: Plotly library (4.6 MB) was directly imported in `OutputRenderer.tsx`, causing it to be bundled in the main application bundle.

- **Before**: Plotly loaded eagerly with main bundle (9.6 MB)
- **Impact**: Users who never view charts still download 4.6 MB of charting library

## Solution Implemented

**Code-split Plotly using React.lazy and dynamic imports**:

1. Created new component: `web/src/components/node/output/PlotlyRenderer.tsx`
   - Uses `React.lazy()` to dynamically import `react-plotly.js`
   - Wrapped in `Suspense` with loading indicator
   - Memoized with `React.memo` for re-render prevention

2. Updated `web/src/components/node/OutputRenderer.tsx`:
   - Removed direct Plot import
   - Replaced with lazy-loaded `PlotlyRenderer` component
   - Removed `PlotlyConfig` from imports (now in new component)

## Result

- **Plotly now lazy-loaded**: Only loads when user views a plotly chart
- **Smaller initial bundle**: Main bundle no longer contains Plotly
- **On-demand loading**: 4.6 MB chart library loaded only when needed
- **Progressive loading**: Loading indicator shown while Chart loads

## Bundle Analysis

| Before | After |
|--------|-------|
| Plotly in main bundle (9.6 MB total) | Plotly in separate chunk (4.6 MB) |
| Eager loading | Lazy loading on-demand |
| All users download 4.6 MB | Only chart users download 4.6 MB |

## Files Changed

- `web/src/components/node/output/PlotlyRenderer.tsx` (NEW)
- `web/src/components/node/OutputRenderer.tsx` (MODIFIED)

## Verification

- ✅ TypeScript compilation passes
- ✅ ESLint passes (1 warning unrelated to changes)
- ✅ All 3138 tests pass
- ✅ Build succeeds with code-split chunks

## Related Patterns

This follows the same code-splitting pattern documented in:
- `.memory/insights/bundle-code-splitting.md`
