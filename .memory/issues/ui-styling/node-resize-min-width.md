# Node Resize Min Width Increase

**Problem**: The minimum width for resizable nodes was set to 100px, which was too small for practical use and could result in nodes becoming unusable when resized too narrow.

**Solution**: Increased the minimum width from 100px to 200px in `BaseNode.tsx` to match the minimum width used in `GroupNode.tsx`, providing a more sensible minimum constraint that keeps nodes functional.

**Date**: 2026-01-16

**Files Changed**:
- `web/src/components/node/BaseNode.tsx` - Updated minWidth from 100 to 200
