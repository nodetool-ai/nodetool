# Editor UI Primitives

This folder contains editor-specific UI components and utilities for building node properties, inspector fields, and other editor UI elements.

## Why This Exists

The editor UI has specific styling needs that differ from the global MUI theme:
- Compact, dense controls that work well inside ReactFlow nodes
- Consistent interaction patterns (nodrag, nowheel behavior)
- Token-based styling that adapts to different contexts (node vs inspector)

## Usage

### Provider Setup

Wrap your editor context with `EditorUiProvider` to set the styling scope:

```tsx
import { EditorUiProvider } from "../editor_ui";

// In NodeEditor (default "node" scope)
<EditorUiProvider>
  <NodeProperties />
</EditorUiProvider>

// In Inspector
<EditorUiProvider scope="inspector">
  <PropertyField />
</EditorUiProvider>
```

### Using Primitives

Replace raw MUI components with editor primitives:

```tsx
import { NodeTextField, NodeSwitch, NodeSelect, NodeMenuItem } from "../editor_ui";

// Text input
<NodeTextField
  value={value}
  onChange={(e) => onChange(e.target.value)}
  multiline
/>

// Boolean switch
<NodeSwitch
  checked={isEnabled}
  onChange={(e) => onChange(e.target.checked)}
/>

// Select dropdown
<NodeSelect value={selected} onChange={(e) => onChange(e.target.value)}>
  <NodeMenuItem value="option1">Option 1</NodeMenuItem>
  <NodeMenuItem value="option2">Option 2</NodeMenuItem>
</NodeSelect>
```

### Utilities

For custom components, use the shared utilities:

```tsx
import { editorClassNames, cn, stopPropagationHandlers } from "../editor_ui";

// Add nodrag class to prevent ReactFlow drag
<div className={cn(editorClassNames.nodrag, myClassName)}>

// Add nowheel when focused to prevent zoom capture
<textarea className={cn(editorClassNames.nodrag, isFocused && editorClassNames.nowheel)}>

// Stop event propagation for interactive containers
<div {...stopPropagationHandlers}>
  <MyInput />
</div>
```

### Accessing Tokens Directly

For custom styling, access tokens via hook:

```tsx
import { useEditorTokens } from "../editor_ui";

const MyComponent = () => {
  const tokens = useEditorTokens();

  return (
    <Box sx={{
      borderRadius: tokens.radii.control,
      backgroundColor: tokens.surface.controlBg,
      fontSize: tokens.text.controlSize
    }}>
      Custom content
    </Box>
  );
};
```

## Guidelines

### Do

- Use editor primitives (`NodeTextField`, `NodeSwitch`, `NodeSelect`) for consistency
- Use `editorClassNames.nodrag` on interactive elements inside nodes
- Use `useEditorTokens()` for custom component styling
- Test in both node and inspector contexts

### Don't

- Add global `.Mui*` selector overrides for editor components
- Create new `styled()` components - use `sx` or Emotion `css` instead
- Import from `node_styles/` - that layer is deprecated
- Modify global theme for editor-specific needs

## File Structure

```
editor_ui/
├── index.ts              # Re-exports all primitives and utilities
├── editorTokens.ts       # Token definitions and getEditorTokens()
├── EditorUiContext.tsx   # Provider and useEditorTokens() hook
├── editorUtils.ts        # Class names and utility functions
├── NodeTextField.tsx     # TextField primitive
├── NodeSwitch.tsx        # Switch primitive
├── NodeSelect.tsx        # Select and MenuItem primitives
└── README.md             # This file
```

## Token Reference

### Radii
- `radii.control` - Small radius for inputs (6px)
- `radii.panel` - Panel/popup radius (8px)
- `radii.node` - Node body radius (from theme)

### Spacing
- `space.xs|sm|md` - Editor spacing scale
- `control.heightSm` - Compact control height (28/32px)
- `control.padX|padY` - Control padding

### Colors
- `border.color|colorHover|colorFocus` - Border states
- `surface.controlBg|menuBg` - Background colors
- `text.controlSize|labelSize|color` - Typography

### Effects
- `focus.ring` - Focus ring shadow
- `transition.fast|normal` - Animation durations
- `shadow.menu|popover` - Elevation shadows
