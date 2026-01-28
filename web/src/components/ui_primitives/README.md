# UI Primitives

This folder contains reusable UI primitives that follow semantic design principles across the entire application, not just the editor. These primitives are the foundation for building consistent, maintainable, and accessible user interfaces.

## Why This Exists

The UI primitives provide:
- **Semantic props**: Explicit state communication (e.g., `changed`, `invalid`, `density`)
- **Theme-driven styling**: All visuals reference `useTheme()` for consistency
- **No DOM reach-in**: Components manage their own styles without descendant selectors
- **Reusable & modular**: Each primitive handles its own visuals via `sx` or scoped styles
- **Context-aware**: Components can adapt to different contexts (node vs inspector) when needed

## Available Primitives

### Input Controls

- **NodeTextField** - Text input field with semantic props
- **NodeNumberInput** - Number input field with min/max/step support
- **NodeSwitch** - Boolean toggle switch
- **NodeSelect** / **NodeSelectPrimitive** - Dropdown select with options
- **NodeMenuItem** - Menu item for use with NodeSelect
- **NodeSlider** - Range slider with visual feedback

### Dialogs

- **Dialog** - Standardized modal dialog with consistent styling and optional action buttons
- **DialogActionButtons** - Standardized confirm/cancel button pairs for dialogs

### Buttons

- **EditorButton** - Button with density variants
- **ToolbarIconButton** - Icon button with tooltip for toolbar actions
- **NavButton** - Navigation button with icon and optional label
- **CreateFab** - Extended FAB for create/add actions
- **PlaybackButton** - Audio/video playback controls (play/pause/stop)
- **RunWorkflowButton** - Run/stop workflow actions
- **ExpandCollapseButton** - Toggle button for expand/collapse content
- **RefreshButton** - Refresh/reset button with loading state
- **SelectionControls** - Bulk selection controls (select all/clear)
- **ViewModeToggle** - Toggle button group for view mode switching

### State & Toggle Buttons (New)

- **StateIconButton** - Versatile icon button with loading, active, and disabled states
- **LabeledToggle** - Toggle button with icon, label, and expand/collapse indicator
- **CircularActionButton** - Circular action button for primary actions and FABs
- **ActionButtonGroup** - Flexible container for grouping action buttons with consistent spacing

### Menus

- **EditorMenu** - Context menu with consistent styling
- **EditorMenuItem** - Menu item for EditorMenu

## Usage

### Provider Setup

Wrap your component tree with `EditorUiProvider` to set the styling scope:

```tsx
import { EditorUiProvider } from "../ui_primitives";

// Default "node" scope (compact density)
<EditorUiProvider>
  <YourComponent />
</EditorUiProvider>

// Inspector scope (normal density)
<EditorUiProvider scope="inspector">
  <YourComponent />
</EditorUiProvider>
```

### Using Primitives

```tsx
import {
  NodeTextField,
  NodeNumberInput,
  NodeSwitch,
  NodeSelectPrimitive,
  NodeMenuItem,
  NodeSlider,
  EditorButton
} from "../ui_primitives";

// Text input with semantic props
<NodeTextField
  value={value}
  onChange={(e) => onChange(e.target.value)}
  changed={hasChanged}  // Shows visual indicator
  invalid={hasError}    // Shows error state
  multiline
/>

// Number input with bounds
<NodeNumberInput
  value={count}
  onChange={(e) => onChange(Number(e.target.value))}
  min={0}
  max={100}
  step={1}
  changed={hasChanged}
/>

// Boolean switch
<NodeSwitch
  checked={isEnabled}
  onChange={(e) => onChange(e.target.checked)}
  changed={hasChanged}
/>

// Select dropdown
<NodeSelectPrimitive
  value={selected}
  onChange={(e) => onChange(e.target.value)}
  changed={hasChanged}
>
  <NodeMenuItem value="opt1">Option 1</NodeMenuItem>
  <NodeMenuItem value="opt2">Option 2</NodeMenuItem>
</NodeSelectPrimitive>

// Slider
<NodeSlider
  value={volume}
  onChange={(e, val) => onChange(val)}
  min={0}
  max={100}
  changed={hasChanged}
/>

// Button
<EditorButton
  onClick={handleClick}
  density="compact"
>
  Click me
</EditorButton>

// Dialog with auto-generated action buttons
<Dialog
  open={isOpen}
  onClose={handleClose}
  title="Confirm Action"
  onConfirm={handleConfirm}
  confirmText="Save"
  cancelText="Cancel"
>
  <DialogContent>
    Are you sure you want to continue?
  </DialogContent>
</Dialog>

// Dialog with manual content and no action buttons
<Dialog
  open={isOpen}
  onClose={handleClose}
  title="Information"
>
  <DialogContent>
    <Typography>Custom dialog content</Typography>
  </DialogContent>
  <DialogActions>
    <Button onClick={handleClose}>Close</Button>
  </DialogActions>
</Dialog>

// Dialog with destructive action
<Dialog
  open={isOpen}
  onClose={handleClose}
  title="Delete Item"
  onConfirm={handleDelete}
  confirmText="Delete"
  destructive={true}
>
  <DialogContent>
    This action cannot be undone.
  </DialogContent>
</Dialog>
```

### Utilities

For custom components, use the shared utilities:

```tsx
import {
  editorClassNames,
  reactFlowClasses,
  cn,
  stopPropagationHandlers
} from "../ui_primitives";

// Prevent ReactFlow drag
<div className={cn(reactFlowClasses.nodrag, myClassName)}>

// Add nowheel when focused to prevent zoom capture
<textarea className={cn(reactFlowClasses.nodrag, isFocused && reactFlowClasses.nowheel)}>

// Stop event propagation for interactive containers
<div {...stopPropagationHandlers}>
  <MyInput />
</div>
```

## Semantic Props

All primitives support semantic props for state-based styling:

### `changed?: boolean`
Shows a visual indicator (typically a right border in primary color) when the value differs from the default. This helps users identify modified values.

### `invalid?: boolean`
Shows an error state (typically a red border) when validation fails. This provides immediate feedback for invalid input.

### `density?: "compact" | "normal"`
Controls the size and spacing of the component:
- `"compact"`: Tighter spacing, smaller fonts (default for node scope)
- `"normal"`: More generous spacing, larger fonts (default for inspector scope)

## Design Principles

### 1. Theme-Driven

All visuals reference `useTheme()` for colors, typography, spacing, and dimensions:

```tsx
const theme = useTheme();
sx={{
  fontSize: theme.fontSizeSmall,
  backgroundColor: theme.vars.palette.background.paper,
  borderColor: theme.vars.palette.primary.main
}}
```

### 2. No DOM Reach-In

Components manage their own styles without relying on descendant selectors or parent overrides:

```tsx
// ✅ Good - component owns its styling
<NodeTextField
  sx={{ height: 24 }}
  changed={hasChanged}
/>

// ❌ Bad - parent reaching into component
<div sx={{ "& fieldset": { border: "none" } }}>
  <TextField />
</div>
```

### 3. Modular & Reusable

Each primitive is self-contained and can be used interchangeably:

```tsx
// Can swap implementations without changing parent
<NodeTextField {...commonProps} />
<NodeNumberInput {...commonProps} />
<NodeSelect {...commonProps} />
```

### 4. Context-Aware (When Needed)

Primitives can adapt to context but keep context dependence minimal:

```tsx
const scope = useEditorScope(); // "node" or "inspector"
const fontSize = scope === "inspector"
  ? theme.fontSizeSmall
  : theme.fontSizeTiny;
```

## Guidelines

### Do

- Use primitives for all input controls across the application
- Use semantic props (`changed`, `invalid`, `density`) to communicate state
- Reference `useTheme()` for all visual values
- Use `reactFlowClasses.nodrag` on interactive elements inside nodes
- Test primitives in both node and inspector contexts

### Don't

- Add global `.Mui*` selector overrides for primitives
- Use descendant selectors (e.g., `fieldset`, `.MuiInputBase-root`) to style primitives
- Create new `styled()` components - use `sx` or Emotion `css` instead
- Duplicate hover/focus/selected rules - use semantic props instead
- Add context-specific styling inline - use the context provider

## File Structure

```
ui_primitives/
├── index.ts                    # Re-exports all primitives and utilities
├── NodeTextField.tsx           # (via editor_ui) Text input primitive
├── NodeNumberInput.tsx         # Number input primitive
├── NodeSwitch.tsx              # (via editor_ui) Switch primitive
├── NodeSelectPrimitive.tsx     # Select and MenuItem primitives
├── NodeSlider.tsx              # Slider primitive
├── EditorButton.tsx            # (via editor_ui) Button primitive
└── README.md                   # This file
```

## Migration Guide

When migrating existing components to use primitives:

1. **Replace raw MUI components** with primitives:
   ```tsx
   // Before
   <TextField />
   
   // After
   <NodeTextField />
   ```

2. **Replace inline styles** with semantic props:
   ```tsx
   // Before
   <TextField
     sx={{
       "& fieldset": {
         borderRightWidth: 2,
         borderRightColor: theme.vars.palette.primary.main
       }
     }}
   />
   
   // After
   <NodeTextField changed={hasChanged} />
   ```

3. **Remove DOM reach-in patterns**:
   ```tsx
   // Before
   <Box sx={{ "& .MuiInputBase-root": { height: 24 } }}>
     <TextField />
   </Box>
   
   // After
   <NodeTextField sx={{ "& .MuiInputBase-root": { height: 24 } }} />
   ```

4. **Add context provider** at the component tree root if needed:
   ```tsx
   // Before
   <MyComponent />
   
   // After
   <EditorUiProvider scope="inspector">
     <MyComponent />
   </EditorUiProvider>
   ```

## Testing

All primitives should have comprehensive tests:

```tsx
import { render, screen } from "@testing-library/react";
import { NodeTextField } from "../ui_primitives";

describe("NodeTextField", () => {
  it("shows changed indicator when changed prop is true", () => {
    const { container } = render(
      <NodeTextField value="test" changed={true} />
    );
    // Assert changed styling
  });
});
```

## Related Documentation

- [Editor UI README](../editor_ui/README.md) - Editor-specific primitives
- [Components AGENTS.md](../AGENTS.md) - Component architecture guide
- [Stores AGENTS.md](../../stores/AGENTS.md) - State management patterns
