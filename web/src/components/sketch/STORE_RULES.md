# Sketch Store Usage Rules

> **Purpose**: prevent accidental broad store subscriptions from reintroducing
> unnecessary re-renders across the sketch editor tree.
>
> **Last updated**: 2026-04-09

## Store Architecture

The sketch store (`useSketchStore`) is composed of six domain-scoped slices:

| Slice | State speed | Example values |
|---|---|---|
| **ViewportSlice** | 🔴 HOT | `zoom`, `pan` |
| **ToolSlice** | 🔴 HOT | `activeTool`, `toolSettings`, `foregroundColor`, `backgroundColor`, symmetry |
| **SelectionSlice** | 🟡 MEDIUM | `selection`, `lastSelection` |
| **DocumentSlice** | 🟢 COLD | `document` (layers, canvas, activeLayerId, maskLayerId, metadata) |
| **HistorySlice** | 🟢 COLD | `history`, `historyIndex` |
| **UiSlice** | 🟢 COLD | `panelsHidden`, `selectedLayerIds`, `isolatedLayerId`, `isDrawing` |

## Rules

### 1. Subscribe only to what you render

Every `useSketchStore((s) => ...)` selector must return only the specific
value(s) the component or hook actually needs. **Never** subscribe to an entire
slice object when you only need one field from it.

```tsx
// ✅ Good — subscribes to one field
const zoom = useSketchStore((s) => s.zoom);

// ❌ Bad — subscribes to the full document object when only layers are needed
const doc = useSketchStore((s) => s.document);
const layers = doc.layers; // the whole component rerenders on any doc change
```

### 2. Shell components subscribe to stable/slow state only

Shell components (`SketchToolbar`, `SketchToolTopBar`, `SketchLayersPanel`,
`SketchModal` header controls) must **not** subscribe to hot viewport state
(`zoom`, `pan`) or to broad document/selection objects.

Hot state belongs near `SketchCanvasPane` and overlay consumers.

### 3. Do not bundle unrelated state in convenience selectors

Selector helpers must not aggregate fields from multiple slices into a single
return object. The deprecated `useSketchStoreSelectors()` aggregator was
removed for exactly this reason.

Use `useResolvedToolSettings()` for merged tool settings with defaults, and
direct `useSketchStore` selectors for everything else.

### 4. Use `useActiveToolSettings()` for single-tool consumption

When a component only needs the settings for the currently active tool, use
`useActiveToolSettings()` instead of `useResolvedToolSettings()`. The active-
tool hook returns a narrower slice and avoids rerenders from unrelated tool
setting changes (e.g. brush slider while eraser is active).

### 5. Separate committed state from live preview state

- **Committed selection** (`store.selection`) is the persisted mask stored in
  the Zustand slice. Shell components can subscribe to it.
- **Live selection preview** (marquee rubber band, lasso path, add/subtract
  intermediate mask) should live in React refs or local state near
  `SketchCanvas`/overlay code and must **not** be written to the store on
  every pointer move.

The same principle applies to transform preview, brush cursor position, and
any other per-frame transient state.

### 6. Keep autosave/export sync independent of hot state

The `onDocumentChange` autosave callback should fire only when the committed
`document` reference changes, not when viewport, selection, or tool-settings
change. Tool settings are merged via ref at call time so they don't add a
dependency.

### 7. Test subscription boundaries

Existing tests in `__tests__/subscriptionBoundaries.test.tsx` verify that
connected components don't rerender on unrelated state changes. When adding
a new connected component or changing selectors, add matching render-count
tests to prove isolation.

## Quick Reference: Where Hot State is Consumed

| Hot state | Primary consumer | Method |
|---|---|---|
| `zoom`, `pan` | `SketchCanvasPane` | direct selector |
| `selection` | `SketchCanvasPane` | direct selector |
| `toolSettings` | `ConnectedToolTopBar` | `useActiveToolSettings()` for active tool, `useResolvedToolSettings()` for full settings |
| `mirrorX`, `mirrorY` | `SketchCanvasPane` | direct selector |
| `foregroundColor` | `ConnectedToolbar`, `SketchCanvasPane` | direct selector |

## Enforcement

- The deprecated `useSketchStoreSelectors()` aggregator has been removed.
  Importing it will cause a build error.
- Connected components in `SketchEditor.tsx` include JSDoc comments documenting
  which slices they subscribe to and which they do NOT.
- `subscriptionBoundaries.test.tsx` runs in CI and will fail if subscription
  boundaries regress.
