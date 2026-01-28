# Quick Way to Add Constant Nodes

**Problem**: Users needed to search through the full node menu to add simple constant value nodes (String, Integer, Float, Boolean), which was inefficient for frequently used operations.

**Solution**: Added a dedicated "Constants" section in QuickActionTiles with one-click buttons for String, Integer, Float, and Boolean constant nodes.

**Implementation**:
- Added `CONSTANT_NODES` array in `web/src/components/node_menu/QuickActionTiles.tsx` with 4 constant types
- Created smaller, compact tile styling (`.constant-tile`) for constants section
- Used appropriate MUI icons (TextFieldsIcon, PinIcon, CalculateIcon, ToggleOnIcon)
- Each constant tile supports drag-and-drop and click-to-place

**Files Changed**:
- `web/src/components/node_menu/QuickActionTiles.tsx`

**Date**: 2026-01-16
