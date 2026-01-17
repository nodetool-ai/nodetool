# Pattern Library Implementation (2026-01-17)

## Technical Approach

1. **Pattern Store (`PatternLibraryStore.ts`)**:
   - Zustand store with `immer` middleware for pattern data
   - Sample patterns with realistic node/edge structures
   - Category filtering and search functionality
   - `getFilteredPatterns()` and `getCategories()` helper methods

2. **Pattern Panel (`PatternLibraryPanel.tsx`)**:
   - Left panel integration with search, category chips, and pattern cards
   - Used `Grid` component from `@mui/material` for responsive layout
   - Draggable cards using HTML5 drag-and-drop API
   - `serializeDragData` for unified drag format

3. **Drop Handling (`dropHandlerUtils.ts`)**:
   - Added `handlePattern` function to create nodes and edges
   - Uses `NodeStore.getState()` for direct store access
   - Generates new node IDs and maps old-to-new for edge connections
   - Preserves node positions relative to drop location

4. **Type Integration (`types.ts`)**:
   - Added `pattern` to `DragDataType` union
   - Added `pattern: WorkflowPattern` to `DragPayloadMap`
   - Imported `WorkflowPattern` from `PatternLibraryStore`

## Key Decisions

- **Store Pattern**: Used existing Zustand patterns with `immer` middleware
- **Drag Format**: Leveraged existing `serializeDragData`/`deserializeDragData` infrastructure
- **Direct Store Access**: Used `NodeStore.getState()` in `handlePattern` to avoid hook issues
- **Node ID Mapping**: Created `idMap` to track old→new IDs for edge recreation

## Challenges

- **useNodes.getState()**: Initially tried `useNodes.getState()` which doesn't exist. Fixed by importing `NodeStore` directly.
- **Type Narrowing**: TypeScript didn't narrow `dragData.payload` in `useDropHandler`. Fixed with explicit cast.

## Files Modified

- `web/src/stores/PatternLibraryStore.ts` (NEW)
- `web/src/components/patterns/PatternLibraryPanel.tsx` (NEW)
- `web/src/components/panels/PanelLeft.tsx` (MODIFIED)
- `web/src/stores/PanelStore.ts` (MODIFIED)
- `web/src/hooks/handlers/dropHandlerUtils.ts` (MODIFIED)
- `web/src/hooks/handlers/useDropHandler.ts` (MODIFIED)
- `web/src/lib/dragdrop/types.ts` (MODIFIED)
- `web/src/lib/dragdrop/serialization.ts` (MODIFIED)
- `web/src/components/patterns/PatternLibraryPanel.tsx` (MODIFIED)

## Testing

- Type checking: ✅ Passes
- Linting: ✅ Passes (1 warning fixed)
- Drag-and-drop: Manual testing required
