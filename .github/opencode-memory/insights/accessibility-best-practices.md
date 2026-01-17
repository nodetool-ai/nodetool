# Accessibility Best Practices (2026-01-17)

## Overview
Lessons learned from NodeTool accessibility audit for WCAG 2.1 Level AA compliance.

## IconButton Accessibility

### Problem
IconButtons without `aria-label` are invisible to screen readers.

### Solution
```typescript
// ❌ Bad - no accessible name
<IconButton onClick={handleDelete}>
  <DeleteIcon />
</IconButton>

// ✅ Good - aria-label provides accessible name
<IconButton 
  onClick={handleDelete}
  aria-label="Delete workflow"
>
  <DeleteIcon />
</IconButton>
```

### Pattern Used
- Added descriptive `aria-label` to all IconButtons
- Labels describe the action, not the icon (e.g., "Clear recent colors" not "X icon")

## Div as Button Accessibility

### Problem
Divs with `onClick` but no `role`/`tabIndex` are not keyboard accessible.

### Solution
```typescript
// ❌ Bad - not keyboard accessible
<div onClick={handleClick}>Click me</div>

// ✅ Good - keyboard accessible with Enter/Space
<div 
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  }}
>
  Click me
</div>
```

### Pattern Used
- Added `role="button"` for semantic meaning
- Added `tabIndex={0}` to make focusable
- Added keyboard handler for Enter/Space activation

## Image Alt Text

### Problem
Empty `alt=""` provides no context to screen reader users.

### Solution
```typescript
// ❌ Bad - no meaning
<img src="output.png" alt="" />

// ✅ Good - descriptive
<img src="output.png" alt="Generated image output" />
```

### Pattern Used
- Images in nodes: "Generated image output"
- Example templates: Use template name (`example.name`)
- Decorative images: Keep empty `alt=""` with purpose

## Collapsible Sections

### Problem
Expand/collapse headers don't announce state to screen readers.

### Solution
```typescript
<div
  role="button"
  tabIndex={0}
  aria-expanded={isExpanded}
  aria-label={isExpanded ? "Collapse" : "Expand"}
  onClick={() => setIsExpanded(!isExpanded)}
  onKeyDown={(e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsExpanded(!isExpanded);
    }
  }}
>
  Header content
  <IconButton aria-hidden="true">
    {isExpanded ? <ExpandLess /> : <ExpandMore />}
  </IconButton>
</div>
```

### Pattern Used
- Added `aria-expanded` for state
- Added `aria-label` for purpose
- Used `aria-hidden` on icon to avoid duplicate announcements

## Focus Indicators

### Note
NodeTool uses MUI theme which provides visible focus indicators by default. No custom CSS needed for basic focus visibility.

### MUI Pattern
```typescript
<Button sx={{
  '&:focus-visible': {
    outline: '2px solid',
    outlineColor: 'primary.main',
    outlineOffset: '2px'
  }
}}>
  Action
</Button>
```

## Color Contrast

### Note
NodeTool's MUI theme uses color tokens that maintain WCAG AA contrast. Avoid hardcoded colors; use theme values:

```typescript
// ❌ Bad - may have poor contrast
<Typography sx={{ color: '#999' }}>Text</Typography>

// ✅ Good - theme ensures contrast
<Typography sx={{ color: 'text.secondary' }}>Text</Typography>
```

## Testing Checklist

### Keyboard Navigation
- [ ] Tab through all interactive elements
- [ ] Focus indicator visible on all elements
- [ ] Enter/Space activate buttons
- [ ] Escape closes dialogs/menus

### Screen Reader
- [ ] All buttons have accessible names
- [ ] Images have descriptive alt text
- [ ] Expand/collapse sections announce state
- [ ] No unannounced content changes

### Visual
- [ ] Color contrast meets 4.5:1
- [ ] Text resizable to 200%
- [ ] No information conveyed by color alone

## Files Modified

- `web/src/components/node/ImageView.tsx`
- `web/src/components/color_picker/SwatchPanel.tsx`
- `web/src/components/dashboard/ProviderSetupPanel.tsx`

## References

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WAI-ARIA Practices](https://www.w3.org/WAI/ARIA/apg/)
- [MUI Accessibility](https://mui.com/material-ui/integrations/accessibility/)
