# Component Refactoring Guide

## Overview

This document describes the architectural changes being made to improve scalability, maintainability, and semantic clarity across the NodeTool codebase.

## Problem Statement

The original codebase had several architectural issues:

1. **DOM Reach-In Patterns**: Components relied on parent-applied CSS classes (e.g., `.value-changed`) to style descendant elements
2. **Implicit State Communication**: State was communicated through CSS classes rather than explicit props
3. **Scattered Styling**: Visual logic was split between parent components and CSS files
4. **Theme Inconsistency**: Mix of CSS custom properties, hardcoded values, and theme references
5. **Poor Separation of Concerns**: Parent components handled both layout and visual details

## Solution Architecture

### 1. UI Primitives Layer

**Location**: `/web/src/components/ui_primitives/`

A new layer of foundational components that:
- Handle their own styling via `sx` prop
- Use semantic props for state (`changed`, `invalid`, `disabled`, `density`)
- Reference `theme.vars` for all visual values
- Have clear, documented prop contracts
- Are fully self-contained with no external style dependencies

**Structure**:
```
ui_primitives/
├── buttons/
│   ├── BaseButton.tsx
│   └── IconButton.tsx
├── inputs/
│   ├── TextField.tsx
│   ├── TextArea.tsx
│   └── NumberField.tsx
├── controls/
│   ├── Switch.tsx
│   └── Slider.tsx
├── selectors/
│   └── Select.tsx
├── index.ts (barrel export)
└── README.md (documentation)
```

### 2. Semantic Props Pattern

**Before** (DOM reach-in):
```tsx
// Parent component
<div className={value !== default ? "value-changed" : "value-default"}>
  <Switch checked={value} onChange={onChange} />
</div>

// CSS file
.value-changed .MuiSwitch-track {
  background-color: var(--palette-primary-main);
}
```

**After** (Semantic props):
```tsx
// Component
<Switch 
  checked={value}
  onChange={onChange}
  changed={value !== default}
/>

// Switch component handles its own styling based on props
```

**Benefits**:
- Clear, explicit state communication
- Self-contained components
- No CSS side effects
- Better TypeScript support
- Easier testing

### 3. Theme-Driven Styling

All visual values reference the theme:

```tsx
const Switch: React.FC<SwitchProps> = ({ changed, ...props }) => {
  const theme = useTheme();

  return (
    <MuiSwitch
      sx={{
        '& .MuiSwitch-track': {
          backgroundColor: changed 
            ? theme.vars.palette.primary.main 
            : theme.vars.palette.grey[600],
          borderRadius: theme.rounded.buttonSmall,
          transition: theme.transitions.create(['background-color']),
        }
      }}
      {...props}
    />
  );
};
```

**Key Points**:
- Use `theme.vars.palette.*` for colors
- Use `theme.rounded.*` for border radius
- Use `theme.spacing()` for spacing
- Use `theme.fontSizeSmall` etc. for fonts
- Use `theme.transitions.create()` for animations

### 4. Density System

Components support three density levels:

```tsx
type Density = 'compact' | 'normal' | 'comfortable';

// Usage
<Switch density="compact" />   // For nodes (tight spacing)
<Switch density="normal" />    // For inspector (standard)
<Switch density="comfortable" /> // For settings (spacious)
```

Implementation maps to concrete values:

```tsx
const dimensions = {
  compact: { width: 24, height: 12 },
  normal: { width: 32, height: 16 },
  comfortable: { width: 40, height: 20 }
}[density || 'compact'];
```

### 5. Component Contract

Each primitive has a clear interface:

```tsx
export interface SwitchProps extends Omit<MuiSwitchProps, 'size'> {
  /** Whether the value differs from default */
  changed?: boolean;
  /** Whether the switch is in an invalid state */
  invalid?: boolean;
  /** Density/size variant */
  density?: 'compact' | 'normal' | 'comfortable';
  /** Visual variant */
  variant?: 'default' | 'emphasized';
}
```

**Documentation Requirements**:
- JSDoc for each prop
- Usage examples in component file
- README with common patterns

## Migration Guide

### Step 1: Identify Target Component

Look for components with:
- CSS class-based state (`.value-changed`, `.value-default`)
- DOM reach-in selectors (`.parent .child {}`)
- Hardcoded colors or dimensions
- Multiple visual states

### Step 2: Choose or Create Primitive

Check if a suitable primitive exists in `/ui_primitives/`. If not:

1. Create new primitive following existing patterns
2. Document the prop interface
3. Add usage examples
4. Ensure theme-driven styling

### Step 3: Refactor Component

Example refactoring of BoolProperty:

**Before**:
```tsx
import { Switch } from "@mui/material";

const BoolProperty = (props: PropertyProps) => {
  return (
    <div className="bool-property">
      <Switch 
        checked={props.value}
        onChange={(e) => props.onChange(e.target.checked)}
        size="small"
      />
      <PropertyLabel name={props.property.name} />
    </div>
  );
};
```

**After**:
```tsx
import Switch from "../ui_primitives/controls/Switch";

const BoolProperty = (props: PropertyProps) => {
  const changed = props.value !== props.property.default;

  return (
    <div className="bool-property">
      <Switch 
        checked={props.value}
        onChange={(e) => props.onChange(e.target.checked)}
        changed={changed}
        density="compact"
      />
      <PropertyLabel name={props.property.name} />
    </div>
  );
};
```

**Key Changes**:
1. Import from `ui_primitives` instead of `@mui/material`
2. Calculate `changed` state explicitly
3. Pass semantic props instead of relying on CSS
4. Specify density for context

### Step 4: Remove CSS Dependencies

Once components are refactored, remove obsolete CSS:

```css
/* BEFORE - Remove these */
.value-changed .MuiSwitch-track {
  background-color: var(--palette-primary-main);
}

.value-changed .MuiSwitch-thumb {
  color: var(--palette-primary-main);
}

/* AFTER - Styling handled in component */
```

### Step 5: Test

1. **Type Check**: `npm run typecheck`
2. **Lint**: `npm run lint`
3. **Unit Tests**: `npm test`
4. **Visual Testing**: Start dev server and verify appearance
5. **Interaction Testing**: Verify all states (default, changed, invalid, disabled)

## Common Patterns

### Pattern 1: Changed Value Indicator

```tsx
const changed = value !== property.default;

<Primitive
  value={value}
  onChange={onChange}
  changed={changed}
/>
```

### Pattern 2: Validation States

```tsx
const invalid = !validateValue(value);

<Primitive
  value={value}
  onChange={onChange}
  invalid={invalid}
  error={invalid}
  helperText={invalid ? "Invalid value" : undefined}
/>
```

### Pattern 3: Context-Aware Density

```tsx
const density = isInspector ? 'normal' : 'compact';

<Primitive
  value={value}
  density={density}
/>
```

### Pattern 4: Conditional Styling

```tsx
<Primitive
  value={value}
  variant={isActive ? 'emphasized' : 'default'}
/>
```

## Benefits Achieved

### 1. Scalability
- New primitives can be added without affecting existing code
- Consistent patterns make it easy to add features
- Clear boundaries between components

### 2. Maintainability
- Single source of truth for component styling
- Easy to find and modify visual logic
- No cascading CSS side effects

### 3. Semantic Clarity
- Props clearly communicate intent
- Type-safe interfaces prevent errors
- Self-documenting code

### 4. Theme Consistency
- All colors from `theme.vars.palette`
- All spacing from `theme.spacing()`
- All transitions from `theme.transitions`
- Unified design language

### 5. Developer Experience
- TypeScript autocomplete for all props
- Clear error messages
- Consistent API across primitives
- Good documentation

## Next Steps

### Short Term (Weeks 1-2)
1. Complete property component refactoring
2. Update CSS files to remove obsolete rules
3. Add unit tests for primitives
4. Document common patterns

### Medium Term (Weeks 3-4)
1. Refactor node components
2. Refactor panel components
3. Create additional primitives as needed
4. Update AGENTS.md

### Long Term (Month 2+)
1. Refactor all remaining components
2. Remove legacy CSS files
3. Optimize bundle size
4. Add visual regression tests

## FAQs

**Q: When should I create a new primitive vs. using MUI directly?**

A: Create a primitive when:
- The component needs semantic state props (changed, invalid)
- Visual logic is complex or reused
- You want consistent behavior across the app
- The component needs context-aware styling

Use MUI directly for:
- One-off components
- Simple wrappers with no state logic
- Prototyping (refactor to primitive later)

**Q: Can I extend primitives?**

A: Yes! Primitives accept all base MUI props via spread:

```tsx
<Switch 
  changed={changed}
  color="secondary"  // MUI prop
  disabled={disabled}
  sx={{ ml: 2 }}     // Additional styling
/>
```

**Q: How do I handle animations?**

A: Use theme transitions:

```tsx
sx={{
  transition: theme.transitions.create(['color', 'background-color'], {
    duration: theme.transitions.duration.short
  })
}}
```

**Q: What about mobile/responsive?**

A: Primitives support density for different contexts. For responsive layouts, use MUI's responsive sx props:

```tsx
<Primitive
  density={{ xs: 'compact', md: 'normal' }}
  sx={{
    width: { xs: '100%', md: 'auto' }
  }}
/>
```

## Resources

- [MUI Theme Documentation](https://mui.com/material-ui/customization/theming/)
- [MUI sx prop](https://mui.com/system/getting-started/the-sx-prop/)
- [UI Primitives README](../web/src/components/ui_primitives/README.md)
- [Component AGENTS.md](../web/src/components/AGENTS.md)

## Contributing

When contributing to this refactoring:

1. Follow the established patterns
2. Document your changes
3. Add tests for new primitives
4. Update this guide if needed
5. Get code review before merging

---

*Last Updated: 2026-01-02*
*Author: GitHub Copilot Agent*
