# Vite Build Performance

**Insight**: Vite's dev server is significantly faster than Webpack for this codebase.

**Why**:
- Native ES modules in dev (no bundling)
- Faster HMR (Hot Module Replacement)
- esbuild for dependency pre-bundling

**Impact**: Dev server starts in ~2s vs ~15s with Webpack.

**Date**: 2026-01-10
