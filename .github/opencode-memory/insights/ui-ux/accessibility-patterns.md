# Accessibility Patterns (2026-01-13)

## Effective Patterns for NodeTool

### IconButton ARIA Labels

Always provide descriptive `aria-label` for IconButton components. The label should describe the action, not the icon.

**Pattern:**
```typescript
// ✅ Good - describes the action
<IconButton
  onClick={handleDelete}
  aria-label="Delete workflow"
>
  <DeleteIcon />
</IconButton>

// ❌ Bad - describes the icon
<IconButton
  onClick={handleDelete}
  aria-label="Delete icon"
>
  <DeleteIcon />
</IconButton>
```

**Use cases:**
- Action buttons: "Save workflow", "Delete node", "Copy to clipboard"
- Navigation: "Go back", "Next page", "Open menu"
- State toggle: "Show favorites", "Hide panel", "Expand section"
- Feedback: "Close dialog", "Dismiss notification"

### Div-Based Button Accessibility

When using divs as interactive buttons (for custom styling), always add keyboard support:

**Pattern:**
```typescript
<div
  className="color-swatch"
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }}
  tabIndex={0}
  role="button"
  aria-label="Select color #ff0000"
>
  {/* content */}
</div>
```

**Key attributes:**
- `tabIndex={0}` - makes the element focusable
- `role="button"` - announces as a button to screen readers
- `onKeyDown` - handles Enter and Space key activation
- `aria-label` - provides accessible name

### Form Labels

MUI TextField components should always have visible labels:

**Pattern:**
```typescript
// ✅ Good - has label
<TextField
  label="Hex Color"
  value={hexInput}
  onChange={handleChange}
/>

// ❌ Bad - placeholder only
<TextField
  placeholder="FFFFFF"
  value={hexInput}
  onChange={handleChange}
/>
```

### Expand/Collapse Elements

Elements that toggle visibility should announce their state:

**Pattern:**
```typescript
<IconButton
  onClick={toggleExpanded}
  aria-label={isExpanded ? "Collapse section" : "Expand section"}
  aria-expanded={isExpanded}
>
  {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
</IconButton>
```

## Anti-Patterns to Avoid

### Removing Focus Outlines
Never remove focus indicators without providing alternatives:
```typescript
// ❌ Bad - removes focus outline
sx={{ outline: "none" }}

// ✅ Good - removes default but provides alternative
sx={{
  outline: "none",
  "&:focus-visible": {
    outline: "2px solid",
    outlineColor: "primary.main"
  }
}}
```

### Empty Alt Text on Decorative Images
Decorative images should use `alt=""` to be ignored by screen readers:
```typescript
// ✅ Good - decorative
<img src={decorativePattern} alt="" />

// ❌ Bad - no alt at all
<img src={decorativePattern} />
```

### Generic Link Text
Links should describe their destination:
```typescript
// ❌ Bad - generic
<a href="/docs">Click here</a>

// ✅ Good - descriptive
<a href="/docs">View documentation</a>
```

## Testing Checklist

- [ ] All IconButtons have `aria-label`
- [ ] All form inputs have visible labels
- [ ] All interactive divs are keyboard accessible
- [ ] All images have appropriate alt text
- [ ] Expand/collapse elements announce state
- [ ] Focus indicators are visible
- [ ] Color contrast meets WCAG AA (4.5:1)
- [ ] No keyboard traps in modals
- [ ] Reduced motion is respected where applicable

## Tools Used

- `grep` for automated pattern detection
- Manual code review for semantic HTML
- TypeScript type checking for completeness
- ESLint for code quality
