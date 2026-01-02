# UI Primitives

This directory contains reusable, themeable UI primitive components that form the foundation of the NodeTool interface.

## Design Principles

1. **Self-Contained**: Each primitive handles its own styling via `sx` prop or scoped styles
2. **Semantic Props**: Use explicit props (e.g., `changed`, `invalid`, `disabled`, `density`) instead of CSS classes
3. **Theme-Driven**: All visual values reference `useTheme()` for consistency
4. **Prop Contract**: Clear, documented interfaces for interchangeable usage
5. **Zero DOM Reach-In**: No descendant selectors or parent-managed styling

## Available Primitives

### Buttons
- `BaseButton` - Foundation button component
- `IconButton` - Icon-only button
- `ToggleButton` - Toggle/switch button

### Inputs
- `TextField` - Single-line text input
- `TextArea` - Multi-line text input
- `NumberField` - Numeric input with optional slider

### Controls
- `Switch` - Toggle switch (boolean)
- `Checkbox` - Checkbox input
- `Radio` - Radio button input
- `Slider` - Range slider component

### Selectors
- `Select` - Dropdown selector
- `ComboBox` - Searchable dropdown

## Usage Example

```tsx
import { TextField } from '@/components/ui_primitives';

<TextField
  value={value}
  onChange={setValue}
  changed={value !== defaultValue}
  invalid={!isValid}
  disabled={isDisabled}
  density="compact"
  label="Property Name"
/>
```

## Semantic Props

All primitives support these semantic state props:

- `changed?: boolean` - Indicates value differs from default
- `invalid?: boolean` - Indicates validation error
- `disabled?: boolean` - Disables interaction
- `density?: 'compact' | 'normal' | 'comfortable'` - Controls spacing/sizing
- `variant?: string` - Component-specific visual variants

## Theming

Primitives use `theme.vars` for all colors, spacing, and dimensions:

```tsx
sx={{
  color: theme.vars.palette.text.primary,
  backgroundColor: theme.vars.palette.grey[800],
  padding: theme.spacing(1),
  borderRadius: theme.rounded.buttonSmall
}}
```

## Testing

Each primitive includes comprehensive unit tests covering:
- Default rendering
- State props (changed, invalid, disabled)
- User interactions
- Theme integration
- Accessibility
