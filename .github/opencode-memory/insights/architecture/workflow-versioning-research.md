# Workflow Versioning Research Insights

## Overview

Documenting technical learnings from implementing experimental workflow versioning features.

## Key Insights

### 1. Visual Timeline Design

**Challenge**: Displaying many versions in limited horizontal space

**Solution**: 
- Use node size to indicate change magnitude
- Color-code by save type for quick scanning
- Add "Now" marker to ground the timeline

**Code Pattern**:
```typescript
const nodeRadius = (magnitude: number): number => {
  const minRadius = 6;
  const maxRadius = 20;
  const normalized = magnitude / maxChangeMagnitude;
  return minRadius + normalized * (maxRadius - minRadius);
};
```

### 2. Comparison Logic

**Challenge**: Comparing historical version with current state requires computing diff against live data

**Solution**:
- Reuse existing `computeGraphDiff()` function
- Determine "ahead" vs "behind" based on change direction
- Provide impact analysis before restore

**Key Learning**: Users need to know what they'll lose before restoring

### 3. Component Composition

**Challenge**: New features need to integrate with existing VersionHistoryPanel

**Solution**:
- Export new components from `components/version/index.ts`
- Use same data types (WorkflowVersion, Graph)
- Follow existing MUI theming patterns

## Technical Patterns

### Consistent State Management

```typescript
// Use existing VersionHistoryStore for UI state
const { selectedVersionId, isCompareMode } = useVersionHistoryStore();

// Use existing useWorkflowVersions for data
const { data: versions } = useWorkflowVersions(workflowId);
```

### Visual Consistency

```typescript
// Follow existing color patterns
const getSaveTypeColor = (saveType: SaveType, theme) => {
  switch (saveType) {
    case "manual": return theme.palette.primary.main;
    case "autosave": return theme.palette.secondary.main;
    // ...
  }
};
```

## Performance Considerations

### Large Version Lists

- Timeline: Limit visible nodes or use virtualization
- Diff computation: Memoize expensive calculations
- Rendering: Use React.memo for list items

### Memory Management

- Don't store full graph in component state
- Use refs for DOM elements
- Clean up subscriptions on unmount

## Error Handling

### Missing Data

```typescript
if (!currentGraph) {
  return <Typography>No current workflow loaded</Typography>;
}
```

### Invalid Graphs

```typescript
if (!diff) {
  return <Typography>Unable to compute diff</Typography>;
}
```

## Testing Strategy

### Unit Tests

1. Timeline rendering with 0, 1, 10, 100 versions
2. Diff computation edge cases
3. Color scheme verification

### Integration Tests

1. Timeline click handlers
2. Version comparison workflow
3. Restore with impact warning

## Future Enhancements

### Short-term

- [ ] Add timeline to VersionHistoryPanel
- [ ] Add "Compare with Current" to context menu
- [ ] Optimize for 100+ versions

### Long-term

- [ ] Virtualized timeline (react-window)
- [ ] Zoom/pan controls
- [ ] Branch/fork visualization
- [ ] Version annotations
- [ ] Export diff reports

## Related Files

- `web/src/components/version/WorkflowChangeTimeline.tsx`
- `web/src/components/version/VersionCompareWithCurrent.tsx`
- `web/src/utils/graphDiff.ts`
- `web/src/stores/VersionHistoryStore.ts`
