# Virtual Scrolling for Large Lists

**Insight**: Asset library and node lists use TanStack Virtual for performance.

**Why**: Rendering 1000+ items in DOM is slow. Virtual scrolling only renders visible items.

**Implementation**: `@tanstack/react-virtual` with `useVirtualizer` hook

**Impact**: Asset library with 1000+ assets renders in <100ms vs 3-5s without virtualization.

**Date**: 2026-01-10
