# Keyboard Shortcuts

**Insight**: The node editor has comprehensive keyboard shortcuts via `useNodeEditorShortcuts` hook.

**Implementation**: Single hook manages all editor shortcuts (copy, paste, delete, undo, redo, etc.)

**Why**: 
- Centralized shortcut management
- Easier to add/modify shortcuts
- Prevents conflicts

**File**: `web/src/hooks/useNodeEditorShortcuts.ts`

**Date**: 2026-01-10
