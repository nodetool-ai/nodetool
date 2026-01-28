# Node Header Icon Fix

**Problem**: "Enable Node" and "Run From Here" actions in node header floating menu used the same PlayArrowIcon, causing user confusion.

**Solution**: Changed "Enable Node" icon from PlayArrowIcon to PowerSettingsNewIcon. The power icon clearly conveys "power on/activate" semantics, distinct from "play/run" execution.

**Files Changed**:
- `web/src/components/context_menus/NodeContextMenu.tsx` - Context menu fix
- `web/src/components/node/NodeToolButtons.tsx` - Node toolbar fix

**Date**: 2026-01-16
