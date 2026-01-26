# Alignment & Distribution Features

This document describes alignment and distribution features for the canvas editor, organized from essential to advanced features based on Sketch's implementation.

---

## Essential Features (Priority 1) ✅

These are the core alignment features every design tool must have.

### Basic Alignment (6 buttons)
The foundation of any design tool's alignment capabilities.

| Feature | Description | Status |
|---------|-------------|--------|
| **Align Left** | Moves selected objects to the leftmost edge of the selection bounds | ✅ Implemented |
| **Align Center (H)** | Centers objects horizontally based on the selection bounds | ✅ Implemented |
| **Align Right** | Shifts objects to the rightmost edge of the selection bounds | ✅ Implemented |
| **Align Top** | Positions objects to the topmost edge of the selection bounds | ✅ Implemented |
| **Align Middle (V)** | Centers objects vertically based on the selection bounds | ✅ Implemented |
| **Align Bottom** | Aligns objects to the bottom edge of the selection bounds | ✅ Implemented |

### Basic Distribution
Even spacing between multiple elements.

| Feature | Description | Status |
|---------|-------------|--------|
| **Distribute Horizontally** | Evenly spaces objects horizontally (requires 3+ elements) | ✅ Implemented |
| **Distribute Vertically** | Evenly spaces objects vertically (requires 3+ elements) | ✅ Implemented |

---

## Important Features (Priority 2) ✅

Features that significantly improve the design workflow.

### Single Element Alignment to Canvas
Allows aligning a single element to the canvas boundaries.

| Feature | Description | Status |
|---------|-------------|--------|
| **Align to Canvas** | Single element can align to canvas edges/center | ✅ Implemented |
| **Alt/Option Modifier** | Hold ⌥ to force alignment to canvas (multiple elements) | ✅ Implemented |

### Smart Guides & Snapping
Visual feedback during element movement.

| Feature | Description | Status |
|---------|-------------|--------|
| **Smart Guides** | Visual lines appear showing alignment with other elements | ✅ Implemented |
| **Edge Snapping** | Elements snap to edges of other elements | ✅ Implemented |
| **Center Snapping** | Elements snap to centers of other elements | ✅ Implemented |
| **Canvas Snapping** | Elements snap to canvas edges and center | ✅ Implemented |
| **Snap Threshold** | Configurable distance for snapping (default: 5px) | ✅ Implemented |

### Tidy
Automatically arrange elements into a neat grid.

| Feature | Description | Status |
|---------|-------------|--------|
| **Tidy Button** | Arranges multiple elements into evenly distributed rows/columns | ✅ Implemented |

### Set Spacing
Manually set specific spacing between elements.

| Feature | Description | Status |
|---------|-------------|--------|
| **Set Horizontal Spacing** | Apply fixed pixel spacing horizontally | ✅ Implemented |
| **Set Vertical Spacing** | Apply fixed pixel spacing vertically | ✅ Implemented |

---

## Advanced Features (Priority 3) 🔜

Features for power users and complex layouts.

### Reference Layer Alignment
Align multiple objects to a specific reference layer.

| Feature | Description | Status |
|---------|-------------|--------|
| **Reference Layer** | Click a layer twice to make it the reference for alignment | 🔜 Planned |
| **Visual Indicator** | Reference layer shows thicker outline | 🔜 Planned |

### Make Grid
Create grids from single or multiple layers.

| Feature | Description | Status |
|---------|-------------|--------|
| **Make Grid** | Duplicate a layer into a grid pattern | 🔜 Planned |
| **Grid Handle** | Drag handle to adjust rows/columns | 🔜 Planned |
| **Grid Spacing** | Adjust spacing between grid items | 🔜 Planned |
| **Multi-Layer Grid** | Create grid from multiple selected layers | 🔜 Planned |

### Smart Distribute Handles
Interactive distribution controls for evenly-spaced elements.

| Feature | Description | Status |
|---------|-------------|--------|
| **Distribution Handles** | Drag handles to adjust spacing between elements | 🔜 Planned |
| **Horizontal Handles** | Adjust horizontal spacing interactively | 🔜 Planned |
| **Vertical Handles** | Adjust vertical spacing interactively | 🔜 Planned |
| **Grid Spacing** | Adjust both horizontal and vertical in grid layouts | 🔜 Planned |

### Layer Reordering (Smart Distribute)
Reorder layers within an evenly-spaced selection.

| Feature | Description | Status |
|---------|-------------|--------|
| **Reorder Handle** | Circular handle in center of each element | 🔜 Planned |
| **Drag to Reorder** | Drag element to swap with another | 🔜 Planned |
| **Auto-Reflow** | Other elements automatically adjust | 🔜 Planned |
| **Grid Reorder** | Reorder within grid-like layouts | 🔜 Planned |

---

## Expert Features (Priority 4) 📋

Features for advanced users and specific use cases.

### Parent-Aware Alignment
Alignment relative to parent containers.

| Feature | Description | Status |
|---------|-------------|--------|
| **Align to Parent** | Elements align to their immediate parent (group/frame) | 🔜 Planned |
| **Override to Canvas** | Hold ⌥ to align to canvas instead of parent | 🔜 Planned |
| **Group Boundaries** | Respect group bounds when aligning | 🔜 Planned |

### Relative Positioning
Position layers using operators.

| Feature | Description | Status |
|---------|-------------|--------|
| **Left Operator (l)** | Position X pixels from left edge | 🔜 Planned |
| **Right Operator (r)** | Position X pixels from right edge | 🔜 Planned |
| **Top Operator (t)** | Position Y pixels from top edge | 🔜 Planned |
| **Bottom Operator (b)** | Position Y pixels from bottom edge | 🔜 Planned |
| **Center Operator (c/m)** | Position relative to center | 🔜 Planned |

### Pixel Fitting
Ensure elements stay on pixel boundaries.

| Feature | Description | Status |
|---------|-------------|--------|
| **Pixel Fitting** | Keep elements aligned to pixel grid | 🔜 Planned |
| **Distribute Unevenly** | Option to maintain pixel alignment | 🔜 Planned |
| **Sub-pixel Option** | Allow sub-pixel placement for exact distribution | 🔜 Planned |

---

## Implementation Notes

### Current Architecture

The alignment system is implemented in the Zustand store (`LayoutCanvasStore.ts`) with the following methods:

```typescript
// Basic alignment (support single element + canvas alignment)
alignLeft(ids: string[], toCanvas?: boolean)
alignCenter(ids: string[], toCanvas?: boolean)
alignRight(ids: string[], toCanvas?: boolean)
alignTop(ids: string[], toCanvas?: boolean)
alignMiddle(ids: string[], toCanvas?: boolean)
alignBottom(ids: string[], toCanvas?: boolean)

// Distribution
distributeHorizontally(ids: string[])
distributeVertically(ids: string[])

// Tidy & Spacing
tidyElements(ids: string[], spacing?: number)
setHorizontalSpacing(ids: string[], spacing: number)
setVerticalSpacing(ids: string[], spacing: number)

// Smart snap
calculateSnapGuides(elementId, x, y, width, height)
```

### UI Integration

Alignment controls are in `CanvasToolbar.tsx` with MUI icons:
- `AlignHorizontalLeftIcon`, `AlignHorizontalCenterIcon`, `AlignHorizontalRightIcon`
- `AlignVerticalTopIcon`, `AlignVerticalCenterIcon`, `AlignVerticalBottomIcon`
- `ViewColumnIcon` (distribute horizontal), `TableRowsIcon` (distribute vertical)
- `AutoFixHighIcon` (tidy)

### Keyboard Modifiers

- **⌥ (Option/Alt)**: Force alignment to canvas instead of selection bounds
- For single element selection, alignment automatically uses canvas as reference

### Adding New Features

1. **Store methods**: Add to `LayoutCanvasStore.ts`
2. **UI controls**: Add to `CanvasToolbar.tsx`
3. **Visual feedback**: Add to `LayoutCanvasEditor.tsx` (for guides/handles)

---

## Feature Comparison with Sketch

| Feature | Sketch | Our Implementation |
|---------|--------|-------------------|
| 6 Basic Alignments | ✅ | ✅ |
| 2 Distribute Options | ✅ | ✅ |
| Align to Canvas | ✅ | ✅ |
| ⌥ Override to Canvas | ✅ | ✅ |
| Smart Guides | ✅ | ✅ |
| Snap to Elements | ✅ | ✅ |
| Snap to Canvas | ✅ | ✅ |
| Tidy | ✅ | ✅ |
| Set Spacing | ✅ | ✅ |
| Make Grid | ✅ | 🔜 |
| Smart Distribute Handles | ✅ | 🔜 |
| Reference Layer | ✅ | 🔜 |
| Parent-Aware Alignment | ✅ | 🔜 |
| Relative Positioning (l,r,t,b,c) | ✅ | 🔜 |
| Pixel Fitting | ✅ | 🔜 |

---

## Next Steps

1. ✅ Complete essential alignment (done)
2. ✅ Complete smart guides (done)
3. ✅ Add single element canvas alignment (done)
4. ✅ Add ⌥ modifier for canvas alignment (done)
5. ✅ Implement Tidy feature (done)
6. ✅ Add set spacing functions (done)
7. 🔜 Add reference layer support
8. 🔜 Implement Smart Distribute handles
9. 🔜 Add Make Grid feature
