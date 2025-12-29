# Editor UI Primitives

This folder contains editor-specific UI components and utilities for building node properties, inspector fields, and other editor UI elements.

## Why This Exists

The editor UI has specific styling needs:
- Compact, dense controls that work well inside ReactFlow nodes
- Consistent interaction patterns (nodrag, nowheel behavior)
- Portal-safe menu styling (no reliance on global `.Mui*` CSS)

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

### Theme-driven styling

Editor visuals are owned by the MUI theme and are applied via **marker classes**
added by the editor primitives.

For custom editor components:
- Prefer layout-only `sx`/Emotion.
- Avoid duplicating hover/focus/selected rules; put shared interaction rules in the theme slice.

## Guidelines

### Do

- Use editor primitives (`NodeTextField`, `NodeSwitch`, `NodeSelect`) for consistency
- Use `editorClassNames.nodrag` on interactive elements inside nodes
- Test in both node and inspector contexts

### Don't

- Add global `.Mui*` selector overrides for editor components
- Create new `styled()` components - use `sx` or Emotion `css` instead
- Import from `node_styles/` - that layer is deprecated
- Add editor-specific inline `sx` state styling in many places (prefer theme slice + marker classes)

## File Structure

```
editor_ui/
├── index.ts              # Re-exports all primitives and utilities
├── EditorUiContext.tsx   # Provider and useEditorScope() hook
├── editorUtils.ts        # Class names and utility functions
├── NodeTextField.tsx     # TextField primitive
├── NodeSwitch.tsx        # Switch primitive
├── NodeSelect.tsx        # Select and MenuItem primitives
└── README.md             # This file
```
