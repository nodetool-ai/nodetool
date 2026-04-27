# Repeat Transform Implementation Recommendation

## Overview
Implement Photoshop-style "Repeat Last Transform" (Ctrl+Shift+T) and "Repeat on Copy" workflows for the sketch editor. The transform infrastructure already supports this cleanly via the `LayerTransform` type with full affine matrix support.

## Current Architecture Assessment

### Transform Data Model ✅
- `LayerTransform` already stores complete affine state:
  - Decomposed fields: `x, y, scaleX, scaleY, rotation`
  - Authoritative `matrix: AffineMatrix` for skew/distort
  - Mode flag for advanced transforms: `mode?: "distort" | "skew"`
- Commit flow reconciles transforms into pixel data via `reconcileLayerToDocumentSpace()`
- Selection free transform supported with `prepareSelectionFreeTransform()`

### Transform Commit Points ✅
- **Primary commit**: `useTransformActions.handleTransformCommit()` (line 193)
  - Bakes transform into pixel data
  - Updates contentBounds
  - For selection transforms: composites selection over base, transforms mask
  - Resets transform to identity after bake
- **Document store**: `documentSlice.commitLayerTransform()` just updates store, no baking
- In-tool undo/redo: `TransformTool.adjustmentUndoStack` tracks per-handle edits within a session

## Recommended Implementation

### 1. Data Storage - History Slice

**Location**: `web/src/components/sketch/state/slices/historySlice.ts`

Add to `HistorySlice` interface:
```typescript
interface HistorySlice {
  // ... existing fields ...
  lastTransform: CommittedTransform | null;
  setLastTransform: (transform: CommittedTransform | null) => void;
}

interface CommittedTransform {
  /** Full transform that was baked */
  transform: LayerTransform;
  /** Layer dimensions at commit time for proportional scaling to different layer sizes */
  sourceBounds: LayerContentBounds;
  /** Timestamp for debugging/telemetry */
  committedAt: string;
  /** Whether this was a selection-scoped transform (affects repeat behavior) */
  isSelectionTransform: boolean;
}
```

**Rationale**: History slice owns undo/redo state, so transform history is a natural fit. Storing `sourceBounds` enables Photoshop-like behavior where repeating a transform on a different-sized layer scales proportionally.

### 2. Capture Point - useTransformActions

**File**: `web/src/components/sketch/hooks/useTransformActions.ts`

**Modify**: `handleTransformCommit()` (line 193)

Add BEFORE `transformOriginalRef.current = null;` (line 254 for normal path, line 233 for selection path):

```typescript
// Capture committed transform for repeat
const setLastTransform = useSketchStore.getState().setLastTransform;
const committedTransform: CommittedTransform = {
  transform: { ...activeLayer.transform },
  sourceBounds: activeLayer.contentBounds ?? {
    x: 0,
    y: 0,
    width: document.canvas.width,
    height: document.canvas.height
  },
  committedAt: new Date().toISOString(),
  isSelectionTransform: selectionFreeTransformRef.current !== null
};
setLastTransform(committedTransform);
```

### 3. Repeat Transform Action - useTransformActions

**Add new method** to `useTransformActions`:

```typescript
const handleRepeatTransform = useCallback(
  (duplicateFirst: boolean = false) => {
    const lastTransform = useSketchStore.getState().lastTransform;
    if (!lastTransform) {
      return; // No transform to repeat
    }

    const activeLayerId = document.activeLayerId;
    const activeLayer = document.layers.find((l) => l.id === activeLayerId);
    if (!activeLayer) {
      return;
    }

    // Block if locked and not transform-while-locked allowed
    const blockedByLock =
      activeLayer.locked && !layerAllowsTransformWhilePixelLocked(activeLayer);
    if (blockedByLock) {
      return;
    }

    // If repeat-on-copy, duplicate the layer first
    if (duplicateFirst) {
      // Trigger layer duplication - needs layerActions dependency
      // This will be wired through useCanvasActions or similar
      console.warn("Repeat on copy requires layer duplication integration");
      return;
    }

    // Check for selection mismatch
    const hasSelection = selection && selectionHasAnyPixels(selection);
    if (lastTransform.isSelectionTransform !== hasSelection) {
      console.warn("Last transform was selection-scoped but no selection active, or vice versa");
      // Photoshop behavior: allow it anyway, just apply to whole layer
    }

    // Scale transform proportionally if layer size differs
    const currentBounds = activeLayer.contentBounds ?? {
      x: 0,
      y: 0,
      width: document.canvas.width,
      height: document.canvas.height
    };
    const scaleFactorX = currentBounds.width / lastTransform.sourceBounds.width;
    const scaleFactorY = currentBounds.height / lastTransform.sourceBounds.height;

    // Build scaled transform
    const repeatedTransform: LayerTransform = {
      ...lastTransform.transform,
      x: lastTransform.transform.x * scaleFactorX,
      y: lastTransform.transform.y * scaleFactorY
    };

    // If matrix-backed, scale translation components
    if (repeatedTransform.matrix) {
      const m = repeatedTransform.matrix;
      repeatedTransform.matrix = [
        m[0], m[1], m[2], m[3],
        m[4] * scaleFactorX,  // translateX
        m[5] * scaleFactorY   // translateY
      ];
    }

    // Record history before applying
    pushTransformHistory("repeat transform");

    // Apply the transform
    setLayerTransform(activeLayerId, repeatedTransform);

    // Prepare selection free transform if applicable
    if (hasSelection && lastTransform.isSelectionTransform) {
      prepareSelectionFreeTransform();
    }

    // Immediately commit the transform (bake into pixels)
    // Wait one frame for state update
    requestAnimationFrame(() => {
      handleTransformCommit();
    });
  },
  [
    document,
    selection,
    pushTransformHistory,
    setLayerTransform,
    prepareSelectionFreeTransform,
    handleTransformCommit
  ]
);
```

**Return** from `useTransformActions`:
```typescript
return {
  // ... existing exports ...
  handleRepeatTransform
};
```

### 4. Keyboard Shortcut - useEditorKeyboardShortcuts

**File**: `web/src/components/sketch/useEditorKeyboardShortcuts.ts`

**Add parameter** to `UseEditorKeyboardShortcutsParams`:
```typescript
handleRepeatTransform: () => void;
```

**Add shortcut** in keydown handler (after Ctrl+T block, around line 350):

```typescript
// Ctrl+Shift+T: Repeat last transform
if (isCtrlOrCmd && e.shiftKey && e.code === "KeyT") {
  e.preventDefault();
  handleRepeatTransform();
  return;
}
```

### 5. Wire Through useEditorCommands

**File**: `web/src/components/sketch/hooks/useEditorCommands.ts`

**Add to params**:
```typescript
handleRepeatTransform: canvasActions.handleRepeatTransform,
```

**Pass to keyboard shortcuts** (line 134+):
```typescript
useEditorKeyboardShortcuts({
  // ... existing ...
  handleRepeatTransform: canvasActions.handleRepeatTransform
});
```

### 6. Wire Through useCanvasActions

**File**: `web/src/components/sketch/hooks/useCanvasActions.ts`

Return `handleRepeatTransform` from the transform actions destructure and expose it in the returned object.

## Edge Cases & Considerations

### 1. **No Previous Transform**
- Behavior: Silently no-op (Photoshop behavior)
- Implementation: Early return in `handleRepeatTransform`

### 2. **Layer Size Mismatch**
- Behavior: Scale transform proportionally (Photoshop behavior)
- Implementation: Compute `scaleFactorX/Y` from source vs current contentBounds
- Preserves visual effect (e.g., "rotate 45° and move 50px" stays proportional)

### 3. **Selection State Mismatch**
- If last transform was selection-scoped but no selection exists: apply to whole layer
- If last transform was full-layer but selection exists: apply to whole layer anyway
- Log warning but don't block (Photoshop allows this)

### 4. **Advanced Transform Modes (distort/skew)**
- Already captured in `transform.mode` and `transform.matrix`
- Repeat works automatically since we copy the full `LayerTransform`
- Matrix scaling only affects translation (e/f components), preserving shear/rotation

### 5. **Multiple Consecutive Repeats**
- Each repeat commits immediately → updates `lastTransform`
- Result: "Repeat Transform" becomes "repeat the repeat" (Photoshop behavior)
- User can Ctrl+Shift+T multiple times to stack transforms

### 6. **Cross-Layer Repeat**
- Allowed: repeat a transform from Layer A onto Layer B
- Proportional scaling handles size differences
- Selection transforms repeated on non-selection: apply to whole layer

### 7. **Undo/Redo Interaction**
- Undo after repeat: reverts the baked transform (standard history)
- `lastTransform` persists through undo (not part of history stack)
- Photoshop behavior: last transform survives undo of the repeat itself

### 8. **History Persistence**
- `lastTransform` lives in session state, not document serialization
- Cleared on document load/reset (new session)
- Alternative: serialize in document metadata if cross-session repeat is desired

### 9. **Repeat on Copy (Future)**
- Requires layer duplication integration
- Flow: duplicate layer → select duplicate → repeat transform → commit
- Needs `layerActions.handleDuplicateLayer()` dependency
- Can be separate PR after base repeat is working

### 10. **Tool State Conflicts**
- If transform tool is active when Ctrl+Shift+T is pressed: ignore or auto-commit?
- Recommendation: Disable shortcut while transform tool active (in-tool undo/redo takes precedence)
- Check `activeTool === "transform"` and early return

## Testing Strategy

### Unit Tests
**File**: `web/src/components/sketch/__tests__/useTransformActions.test.ts`

```typescript
describe("handleRepeatTransform", () => {
  it("repeats simple translate transform", () => { /* ... */ });
  it("repeats scale+rotate transform", () => { /* ... */ });
  it("repeats distort/skew matrix transform", () => { /* ... */ });
  it("scales transform proportionally for different layer size", () => { /* ... */ });
  it("no-ops when no previous transform exists", () => { /* ... */ });
  it("handles selection-to-full-layer mismatch", () => { /* ... */ });
  it("captures transform after each repeat for chaining", () => { /* ... */ });
});
```

### E2E Tests
**File**: `web/tests/e2e/transforms.spec.ts`

```typescript
test("repeat transform via Ctrl+Shift+T", async ({ page }) => {
  // 1. Transform layer (move + rotate)
  // 2. Commit with Enter
  // 3. Press Ctrl+Shift+T
  // 4. Verify layer moved/rotated again by same amount
});

test("repeat transform scales for different layer sizes", async ({ page }) => {
  // 1. Transform 100x100 layer (move 50px right)
  // 2. Switch to 200x200 layer
  // 3. Repeat transform
  // 4. Verify moved 100px right (proportional scaling)
});
```

## Implementation Effort Estimate

- **Data model (historySlice)**: 15 minutes
- **Capture logic (useTransformActions)**: 20 minutes
- **Repeat action (useTransformActions)**: 45 minutes
- **Keyboard shortcut**: 10 minutes
- **Wiring (useEditorCommands, useCanvasActions)**: 15 minutes
- **Unit tests**: 45 minutes
- **E2E tests**: 30 minutes
- **Edge case polish & docs**: 20 minutes

**Total**: ~3 hours for full feature + tests

## Future Enhancements

1. **Repeat on Copy** (Photoshop Ctrl+Alt+Shift+T)
   - Requires layer duplication hookup
   - ~30 min additional after base repeat works

2. **Repeat with Offset** (hold Alt while repeating to adjust offset interactively)
   - Photoshop advanced feature, low priority
   - ~1-2 hours

3. **Cross-Session Persistence**
   - Serialize `lastTransform` in document metadata
   - ~30 min

4. **UI Indicator**
   - Show "Last Transform: Rotate 45° + Scale 1.5x" in status bar
   - ~20 min

## SHORTCUTS.md Update

**File**: `web/src/components/sketch/SHORTCUTS.md`

Change line 75 from:
```markdown
- [ ] `Ctrl+Shift+T` repeat last transform
```

To:
```markdown
- [x] `Ctrl+Shift+T` repeat last transform
```

Add after line 79:
```markdown
- [ ] `Ctrl+Alt+Shift+T` repeat last transform on copy (duplicate + transform)
```
