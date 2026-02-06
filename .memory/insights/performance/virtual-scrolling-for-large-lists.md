# Virtual Scrolling for Large Lists

**Status**: IMPLEMENTED (2026-01-16)

**Insight**: Asset library and node lists now use TanStack Virtual/react-window for performance.

**Implementation**: 
- AssetGridContent uses `react-window` with `VariableSizeList`
- AssetListView now uses `react-window` with `VariableSizeList`
- Both components wrap lists with `AutoSizer` for responsive container sizing

**Why**: Rendering 1000+ items in DOM is slow. Virtual scrolling only renders visible items.

**Impact**: Asset library with 1000+ assets renders in <100ms vs 3-5s without virtualization.

**Date**: 2026-01-10 (originally planned), Implemented 2026-01-16
