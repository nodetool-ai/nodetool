# UI Primitives Implementation Guide

This document provides practical examples of implementing the new UI primitives in existing components.

## Real-World Examples

### Example 1: SetupPanel.tsx

**Before:**
```tsx
<Box css={panelStyles(theme)} className="setup-panel-container">
  <div className="scrollable-content">
    <Box className="setup-container">
      <Typography variant="h6" sx={{ mb: 1.5 }}>Title</Typography>
      <Typography variant="subtitle2" className="setup-list-title">
        Subtitle
      </Typography>
      <Box><ol>...</ol></Box>
    </Box>
  </div>
</Box>

// CSS
const panelStyles = css({
  display: "flex",
  flexDirection: "column",
  padding: "0.75em",
  ".setup-container": {
    padding: "1em",
    borderRadius: "12px"
  }
});
```

**After:**
```tsx
import { FlexColumn, Card } from "../ui_primitives";

<FlexColumn gap={0} padding={3} fullHeight>
  <div className="scrollable-content">
    <Card padding="comfortable">
      <FlexColumn gap={2}>
        <Typography variant="h6">Title</Typography>
        <FlexColumn gap={1}>
          <Typography variant="subtitle2">Subtitle</Typography>
          <ol>...</ol>
        </FlexColumn>
      </FlexColumn>
    </Card>
  </div>
</FlexColumn>

// Simplified CSS (no container styles needed)
const panelStyles = css({
  height: "100%"
});
```

**Benefits:**
- 40% less CSS code
- Self-documenting layout structure
- Type-safe padding/gap values
- Consistent spacing across theme

---

### Example 2: GettingStartedPanel.tsx

**Before:**
```tsx
<Box className="panel-header">
  <RocketLaunchIcon />
  <Box>
    <Typography sx={{ fontWeight: 600, fontSize: "1.1rem" }}>
      Getting Started
    </Typography>
    <Typography sx={{ color: "text.secondary", fontSize: "0.85rem" }}>
      Complete these steps
    </Typography>
  </Box>
</Box>

// CSS
".panel-header": {
  display: "flex",
  alignItems: "center",
  gap: "0.75em",
  marginBottom: "1em"
}
```

**After:**
```tsx
import { FlexRow, FlexColumn, Text, Caption } from "../ui_primitives";

<FlexRow gap={3} align="center" className="panel-header">
  <RocketLaunchIcon />
  <FlexColumn gap={0.5}>
    <Text size="big" weight={600}>Getting Started</Text>
    <Caption size="small">Complete these steps</Caption>
  </FlexColumn>
</FlexRow>

// No CSS needed for layout!
```

**Benefits:**
- No CSS required for layout
- Typography scales with theme
- Consistent size/color variants
- Easier to maintain

---

## Common Migration Patterns

### Pattern 1: Vertical Stack with Spacing

**Before:**
```tsx
<Box sx={{ display: "flex", flexDirection: "column", gap: theme.spacing(2) }}>
  <Item1 />
  <Item2 />
  <Item3 />
</Box>
```

**After:**
```tsx
<FlexColumn gap={2}>
  <Item1 />
  <Item2 />
  <Item3 />
</FlexColumn>
```

---

### Pattern 2: Horizontal Row with Alignment

**Before:**
```tsx
<Box sx={{ 
  display: "flex", 
  alignItems: "center", 
  justifyContent: "space-between",
  gap: theme.spacing(1.5)
}}>
  <LeftContent />
  <RightContent />
</Box>
```

**After:**
```tsx
<FlexRow gap={1.5} align="center" justify="space-between">
  <LeftContent />
  <RightContent />
</FlexRow>
```

---

### Pattern 3: Typography with Manual Styling

**Before:**
```tsx
<Typography sx={{ 
  fontSize: theme.fontSizeBig,
  fontWeight: 600,
  color: theme.vars.palette.primary.main
}}>
  Important Text
</Typography>
<Typography sx={{
  fontSize: theme.fontSizeSmall,
  color: theme.vars.palette.text.secondary
}}>
  Helper text
</Typography>
```

**After:**
```tsx
<Text size="big" weight={600} color="primary">
  Important Text
</Text>
<Caption size="small" color="secondary">
  Helper text
</Caption>
```

---

### Pattern 4: Card/Container with Padding

**Before:**
```tsx
<Box sx={{ 
  padding: theme.spacing(2.5),
  borderRadius: "8px",
  border: `1px solid ${theme.vars.palette.divider}`,
  backgroundColor: theme.vars.palette.background.paper
}}>
  <Content />
</Box>
```

**After:**
```tsx
<Card variant="outlined" padding="normal">
  <Content />
</Card>
```

---

## Migration Checklist

When refactoring a component:

1. **Identify Patterns**
   - [ ] Find all `display: "flex"` with `flexDirection: "column"` → use `FlexColumn`
   - [ ] Find all `display: "flex"` (horizontal) → use `FlexRow`
   - [ ] Find Typography with manual sizing/coloring → use `Text`/`Caption`
   - [ ] Find Box with manual padding → use `Card`/`Container`

2. **Import Primitives**
   ```tsx
   import { FlexColumn, FlexRow, Card, Text, Caption } from "../ui_primitives";
   ```

3. **Replace Patterns**
   - Use semantic names: `gap`, `padding`, `align`, `justify`
   - Use theme-based values: `gap={2}` instead of `gap: theme.spacing(2)`
   - Use size variants: `size="big"` instead of `fontSize: theme.fontSizeBig`

4. **Clean Up CSS**
   - Remove redundant layout CSS
   - Keep only custom styling (colors, borders, animations)
   - Remove hardcoded spacing values

5. **Test**
   - [ ] Visual inspection (does it look the same?)
   - [ ] Unit tests (add if not exists)
   - [ ] Typecheck passes
   - [ ] Lint passes

---

## Tips & Best Practices

### ✅ DO

- Use primitives for layout structure
- Use semantic padding variants: `"compact"`, `"normal"`, `"comfortable"`
- Use consistent gap values: `0.5`, `1`, `1.5`, `2`, `3`, `4`
- Combine primitives: `<FlexColumn><FlexRow>...</FlexRow></FlexColumn>`

### ❌ DON'T

- Don't nest too many primitives (keep it flat where possible)
- Don't mix primitives with manual flex CSS (pick one approach)
- Don't use hardcoded pixel values (use theme spacing)
- Don't override primitive styles with `sx` (use props instead)

---

## Results from Real Refactoring

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Lines of code | 858 | 753 | -105 lines (12%) |
| CSS lines | 254 | 126 | -128 lines (50%) |
| Manual flex patterns | 23 | 0 | -23 patterns |
| Typography manual styling | 18 | 0 | -18 instances |
| Tests | 0 | 3 | +3 tests |

---

## Next Components to Refactor

**High Priority** (similar patterns to examples):
1. ActivityPanel
2. TemplatesPanel
3. ProviderSetupPanel
4. WelcomePanel

**Medium Priority** (moderate complexity):
5. Node inspector panels
6. Settings dialogs
7. Modal components

**Low Priority** (already well-structured):
8. Header components
9. Button groups
10. Icon wrappers

---

## Questions?

See:
- `README.md` - Complete primitive documentation
- `EXAMPLES.md` - More usage examples
- `SUMMARY.md` - Overview and benefits
- `SetupPanel.tsx` - Real refactored example
- `GettingStartedPanel.tsx` - Complex refactored example
