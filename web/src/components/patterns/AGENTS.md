# Pattern Library Component

## Overview

The Pattern Library feature enables users to save, organize, and apply reusable workflow patterns (subflows) within the NodeTool editor.

## Architecture

### Files

| File | Purpose |
|------|---------|
| `stores/research/PatternStore.ts` | Zustand store for pattern persistence and management |
| `hooks/patterns/usePatternLibrary.ts` | High-level hook for pattern operations |
| `hooks/patterns/useApplyPattern.ts` | Hook for applying patterns to the canvas |
| `components/patterns/PatternLibraryPanel.tsx` | Full panel for pattern management |
| `components/patterns/PatternSelector.tsx` | Quick selector popup for patterns |

### Data Model

```typescript
interface WorkflowPattern {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  nodes: PatternNode[];
  edges: PatternEdge[];
  createdAt: number;
  updatedAt: number;
  usageCount: number;
}

interface PatternNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

interface PatternEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}
```

## Usage

### Basic Pattern Application

```typescript
import { usePatternLibrary } from '../../hooks/patterns/usePatternLibrary';

const MyComponent = () => {
  const { applyPattern } = usePatternLibrary();

  const handleApply = () => {
    applyPattern('pattern-id', { x: 200, y: 200 });
  };

  return <Button onClick={handleApply}>Apply Pattern</Button>;
};
```

### Creating Pattern from Selection

```typescript
import { usePatternLibrary } from '../../hooks/patterns/usePatternLibrary';

const CreatePatternButton = () => {
  const { createPatternFromSelection } = usePatternLibrary();

  const handleCreate = () => {
    createPatternFromSelection(
      'My Pattern',
      'Description of the pattern',
      'Category',
      ['tag1', 'tag2']
    );
  };

  return <Button onClick={handleCreate}>Save as Pattern</Button>;
};
```

## Integration Points

### SelectionActionToolbar

The Pattern feature integrates with the `SelectionActionToolbar` component to provide:
- Quick pattern application via the Extension icon
- Pattern selection popup menu

### Persistence

Patterns are stored in `localStorage` under the `nodetool-patterns` key, allowing:
- Offline access
- Cross-session persistence
- No backend dependency

## Best Practices

1. **Use Selective Store Subscriptions**: Always use selectors when subscribing to `PatternStore`
   ```typescript
   const patterns = usePatternStore(state => state.patterns); // ✅
   const store = usePatternStore(); // ❌ causes re-renders
   ```

2. **Memoize Expensive Operations**: Use `useMemo` for filtering and sorting patterns
   ```typescript
   const filteredPatterns = useMemo(() => {
     return patterns.filter(p => p.category === selectedCategory);
   }, [patterns, selectedCategory]);
   ```

3. **Handle Edge Cases**: Always check if a pattern exists before applying
   ```typescript
   const pattern = getPatternById(id);
   if (!pattern) return;
   ```

## Testing

See test files:
- `stores/research/__tests__/PatternStore.test.ts`
- `hooks/patterns/__tests__/useApplyPattern.test.ts`

## Limitations

- Patterns are stored locally (not shared across devices)
- No built-in import/export for patterns (could be added)
- No version history for patterns (could be added)
