# Command Palette - Visual Design

## Component Structure

```
┌─────────────────────────────────────────────────────┐
│  🔍  Search for commands, workflows, or actions...  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  NAVIGATION                                         │
│  ┌───────────────────────────────────────────────┐ │
│  │ Go to Dashboard                               │ │
│  │ Navigate to the main dashboard                │ │
│  └───────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────┐ │
│  │ Go to Workflows                               │ │
│  │ View all your workflows                       │ │
│  └───────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────┐ │
│  │ Go to Assets                                  │ │
│  │ Manage your assets and files                  │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  WORKFLOW                                           │
│  ┌───────────────────────────────────────────────┐ │
│  │ Create New Workflow                      ⌘N   │ │
│  │ Start a blank workflow                        │ │
│  └───────────────────────────────────────────────┘ │
│  ┌───────────────────────────────────────────────┐ │
│  │ Save Current Workflow                    ⌘S   │ │
│  │ Save your current work                        │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
├─────────────────────────────────────────────────────┤
│ ⌨️  Use ↑↓ to navigate, Enter to select, Esc to... │
└─────────────────────────────────────────────────────┘
```

## With Search Active

When user types "dashboard":

```
┌─────────────────────────────────────────────────────┐
│  🔍  dashboard                                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  NAVIGATION                                         │
│  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓ │
│  ┃ Go to Dashboard                            ┃ │  ← Selected
│  ┃ Navigate to the main dashboard             ┃ │
│  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ │
│                                                     │
├─────────────────────────────────────────────────────┤
│ ⌨️  Use ↑↓ to navigate, Enter to select, Esc to... │
└─────────────────────────────────────────────────────┘
```

## Color Scheme (Dark Theme)

```css
Background:        #1a1a1a (c_editor_bg_color)
Search Box:        #2a2a2a (action.hover)
Text Primary:      #ffffff
Text Secondary:    #aaaaaa
Selected Item:     #0066cc (primary.dark)
Selected Text:     #ffffff
Border:            #333333 (divider)
Category Header:   #888888 (uppercase, smaller)
Shortcut Badge:    #3a3a3a (action.selected)
```

## Spacing & Layout

```
Dialog:
  - Width: 600px (90% on mobile)
  - Max Height: 500px
  - Border Radius: 8px
  - Box Shadow: 0 8px 32px rgba(0,0,0,0.4)

Search Box:
  - Padding: 12px 16px
  - Font Size: 16px
  - Border Bottom: 1px solid divider

Commands List:
  - Max Height: 350px
  - Overflow: auto
  - Padding: 8px

Command Item:
  - Padding: 8px 12px
  - Border Radius: 6px
  - Margin Bottom: 4px
  - Transition: all 0.15s

Category Header:
  - Font Size: 12px
  - Font Weight: 600
  - Padding: 12px 12px 4px
  - Letter Spacing: 0.05em

Keyboard Hint Footer:
  - Padding: 8px 16px
  - Font Size: 12px
  - Border Top: 1px solid divider
  - Background: action.hover
```

## Interaction States

### Default State
```
┌─────────────────────────────────┐
│ Go to Dashboard                 │
│ Navigate to the main dashboard  │
└─────────────────────────────────┘
Background: transparent
Text: #ffffff
```

### Hover State
```
┌─────────────────────────────────┐
│ Go to Dashboard                 │
│ Navigate to the main dashboard  │
└─────────────────────────────────┘
Background: #2a2a2a
Text: #ffffff
Cursor: pointer
```

### Selected State (via keyboard)
```
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ Go to Dashboard                ┃
┃ Navigate to the main dashboard ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
Background: #0066cc (primary)
Text: #ffffff
Border: 2px solid #0066cc
```

## Typography

```
Command Label:
  Font Size: 15px (0.95rem)
  Font Weight: 500
  Color: text.primary

Command Description:
  Font Size: 13.6px (0.85rem)
  Color: text.secondary
  Margin Top: 2px

Category Header:
  Font Size: 12px (0.75rem)
  Font Weight: 600
  Color: text.secondary
  Text Transform: uppercase

Keyboard Shortcut:
  Font Size: 12px (0.75rem)
  Font Family: monospace
  Padding: 2px 6px
  Border Radius: 4px
  Background: action.selected
```

## Animation & Transitions

```css
Dialog Open:
  - Fade In: 200ms
  - Scale: 0.95 → 1.0

Command Item Hover:
  - Background: 150ms ease
  - Transform: translateY(-2px)
  - Box Shadow: 0 4px 12px rgba(0,0,0,0.2)

Selected Command:
  - Background: 150ms ease
  - Border: instant

Search Input:
  - Focus: Blue outline 200ms
```

## Accessibility Features

```
ARIA Labels:
  - Dialog: "Command Palette"
  - Search: "Search for commands"
  - List: "Available commands"
  - Each command: Full label text

Keyboard Support:
  - Tab: Not used (arrow keys instead)
  - Arrow Up/Down: Navigate
  - Enter: Execute
  - Escape: Close
  - Cmd/Ctrl + K: Open/Close

Screen Reader:
  - Announces selected command
  - Announces search results count
  - Announces when no results found
```

## Responsive Design

### Desktop (>600px)
```
Width: 600px
Max Height: 500px
Command Grid: 1 column
Font Size: Normal
```

### Tablet (400-600px)
```
Width: 90%
Max Height: 500px
Command Grid: 1 column
Font Size: Normal
```

### Mobile (<400px)
```
Width: 95%
Max Height: 70vh
Command Grid: 1 column
Font Size: Slightly smaller
Padding: Reduced
```

## Empty State

When no commands match search:

```
┌─────────────────────────────────────────────────────┐
│  🔍  xyz123                                          │
├─────────────────────────────────────────────────────┤
│                                                     │
│                                                     │
│              No commands found.                     │
│         Try a different search term.                │
│                                                     │
│                                                     │
├─────────────────────────────────────────────────────┤
│ ⌨️  Use ↑↓ to navigate, Enter to select, Esc to... │
└─────────────────────────────────────────────────────┘
```

## Loading State

(Currently not implemented, but could be added for async commands)

```
┌─────────────────────────────────────────────────────┐
│  🔍  Search for commands, workflows, or actions...  │
├─────────────────────────────────────────────────────┤
│                                                     │
│                   🔄 Loading...                     │
│                                                     │
├─────────────────────────────────────────────────────┤
│ ⌨️  Use ↑↓ to navigate, Enter to select, Esc to... │
└─────────────────────────────────────────────────────┘
```

## Implementation Notes

### Material-UI Components Used
- `Dialog` - Main container
- `DialogContent` - Content wrapper
- `Box` - Layout containers
- `Typography` - Text elements
- `TextField` - Search input
- `List` / `ListItem` / `ListItemText` - Command list
- `Chip` - Keyboard shortcut badges

### Emotion CSS-in-JS
- Component-scoped styles
- Theme-aware colors
- Responsive utilities
- Hover/focus states

### Custom Features
- Keyboard navigation with visual feedback
- Real-time search filtering
- Category grouping
- Shortcut display
- Auto-focus on open
- Click-outside to close

This design provides a modern, accessible, and intuitive command palette that fits seamlessly into the NodeTool interface.
