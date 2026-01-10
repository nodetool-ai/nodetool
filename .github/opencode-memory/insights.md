# Important Insights and Learnings

This file captures important discoveries, architectural decisions, and best practices learned during development.

## Architecture Insights

### State Management Strategy

**Insight**: Zustand with selective subscriptions prevents unnecessary re-renders better than Context.

**Rationale**: 
- Context causes all consumers to re-render on any change
- Zustand allows component-level subscriptions to specific state slices
- Temporal middleware provides undo/redo without extra code

**Example**:
```typescript
// Subscribes only to this specific node
const node = useNodeStore(state => state.nodes[nodeId]);
```

**Impact**: 60%+ reduction in re-renders in node editor.

**Date**: Pre-existing pattern, documented 2026-01-10

---

### Keyboard Shortcut Implementation Pattern

**Insight**: New keyboard shortcuts are added in two places: the shortcut definition in `shortcuts.ts` and the handler in `useNodeEditorShortcuts.ts`.

**Pattern**:
```typescript
// 1. Add to shortcuts.ts
{
  title: "Feature Name",
  slug: "toggleFeature",
  keyCombo: ["Control", "Shift", "F"],
  category: "panel",
  description: "Show or hide feature panel",
  registerCombo: true
}

// 2. Add handler in useNodeEditorShortcuts.ts
const handleFeatureToggle = useCallback(() => {
  inspectorToggle("featureName");
}, [inspectorToggle]);

// 3. Add to shortcutMeta
toggleFeature: { callback: handleFeatureToggle },

// 4. Add to dependencies array
handleFeatureToggle
```

**Files**: `web/src/config/shortcuts.ts`, `web/src/hooks/useNodeEditorShortcuts.ts`

**Date**: 2026-01-10

---

## How to Add New Insights

When documenting new insights:

1. **Title**: Clear, descriptive heading
2. **Insight**: What you learned
3. **Rationale**: Why it matters
4. **Example**: Code or pattern (if applicable)
5. **Impact**: Measurable benefit (if known)
6. **Files**: Related files
7. **Date**: When documented

## Last Updated

2026-01-10 - Initial memory system creation with pre-existing patterns documented
