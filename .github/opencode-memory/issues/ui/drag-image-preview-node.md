# Drag Image to Preview Node Creates Node Instead of Moving

**Problem**: Dragging an image file from the OS onto a preview node in the workflow canvas would create a new image node instead of allowing the preview node to be moved to a new position.

**Solution**: Modified `useDropHandler.ts` to detect when dropping on a preview node. When dropping on a preview node without the Alt key modifier, the handler returns early without creating an image node, allowing the normal ReactFlow node drag behavior to move the node. When the Alt key is held while dropping, an image node is created as before.

**Changes**:
- Added `targetIsPreviewNode` check using `target.closest(".preview-node")`
- Added early return when dropping on preview node without modifier key
- Requires Alt key (event.altKey) to create image node when dropping on preview node

**Files Modified**:
- `web/src/hooks/handlers/useDropHandler.ts`

**Date**: 2026-01-16
