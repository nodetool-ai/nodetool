# Quick Keyboard Shortcuts Overlay

A beautiful, instant-access overlay for viewing all available keyboard shortcuts in NodeTool.

## Features

- **Instant Access**: Press `?` key anywhere in the workflow editor to open
- **Search**: Quickly find shortcuts by typing keywords
- **Category Filtering**: Filter by Editor, Workflow, Panels, or Assets categories
- **Responsive UI**: Modern glassmorphism design with smooth animations
- **Cross-Platform**: Shows correct key combinations for Mac/Windows/Linux

## Usage

### Opening the Overlay

While in the workflow editor, simply press the `?` key to open the Quick Shortcuts Overlay.

### Searching for Shortcuts

1. Open the overlay with `?`
2. Type in the search box to filter shortcuts by name, description, or key combination
3. Press `Esc` or click outside to close

### Filtering by Category

Click on any category chip to filter shortcuts:
- **All**: Show all available shortcuts
- **Node Editor**: Shortcuts for node manipulation, alignment, and selection
- **Workflows**: Shortcuts for workflow management and navigation
- **Panels**: Shortcuts for toggling UI panels
- **Asset Viewer**: Shortcuts for asset management

## Implementation Details

### Component Location

`web/src/components/ui/QuickShortcutsOverlay.tsx`

### Integration

The component is integrated into the `NodeEditor` component and uses the existing keyboard shortcuts configuration from `web/src/config/shortcuts.ts`.

### Key Bindings

- **?** - Opens the Quick Shortcuts Overlay
- **Esc** - Closes the overlay
- Search box is automatically focused when opened

### Styling

The overlay uses Material-UI components with custom styling that matches NodeTool's theme:
- Glassmorphism backdrop with blur effect
- Animated transitions with Fade effect
- Hover effects on shortcut rows
- Custom scrollbar styling
- Keyboard key visualization with 3D effect

## Related Components

- **Help Dialog**: Full help system with keyboard visualization (opened from top-right corner)
- **KeyboardShortcutsView**: Interactive keyboard layout showing all shortcuts
- **CommandMenu**: Quick action palette (Ctrl/Cmd + K)

## Future Enhancements

- Add "Recently Used" shortcuts section
- Show shortcuts in context (change based on selected nodes/tools)
- Allow customization of keyboard shortcuts
- Export shortcuts as printable cheat sheet
- Add tooltips to show shortcuts on UI elements
