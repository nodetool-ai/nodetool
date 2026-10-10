---
layout: page
title: "Keyboard Shortcuts"
permalink: /keyboard-shortcuts
description: "Every keyboard shortcut in the node editor, chat, assets, timeline, sketch editor, 3D model editor, and game editor, with Mac and Windows/Linux keys."
---

This page lists the shortcuts in each part of NodeTool. In the app, press `Ctrl + /` (Windows/Linux) or `⌘ + /` (Mac), or `?`, to open the shortcut sheet for the part you are in.

## Reading the tables

- `Ctrl/⌘` means `Ctrl` on Windows and Linux and `⌘` on Mac. `Alt/⌥` means `Alt` on Windows and Linux and `Option` on Mac.
- Single-letter shortcuts such as `F` or `B` work when focus is on the canvas and not in a text field.
- Shortcuts marked "desktop app" are registered only in the Electron app. The browser leaves `Ctrl + T` and `Ctrl + W` to the browser.
- The node editor list comes from `web/src/config/shortcuts.ts`. The timeline, sketch editor, 3D model editor, and game editor each keep their own keys, listed in their own sections.

## Node editor

### Workflow

| Windows/Linux | Mac | Action |
|---------------|-----|--------|
| `Ctrl + Enter` | `⌘ + Enter` | Run the workflow |
| `Esc` | `Esc` | Stop the running workflow |
| `Ctrl + S` | `⌘ + S` | Save the workflow |
| `Ctrl + T` | `⌘ + T` | New workflow tab (desktop app) |
| `Ctrl + W` | `⌘ + W` | Close the workflow tab (desktop app) |
| `Ctrl + 1` to `9` | `⌘ + 1` to `9` | Switch to workflow tab 1 to 9 |
| `Ctrl + PageUp` / `PageDown` | `⌘ + PageUp` / `PageDown` | Previous or next tab |
| `Ctrl + Shift + [` / `]` | `⌘ + Shift + [` / `]` | Previous or next tab (alternate) |
| `Ctrl + Alt + ←` / `→` | `⌘ + ⌥ + ←` / `→` | Previous or next tab (alternate) |

### Editing nodes

| Windows/Linux | Mac | Action |
|---------------|-----|--------|
| `Ctrl + C` / `X` / `V` | `⌘ + C` / `X` / `V` | Copy, cut, paste nodes |
| `Ctrl + Z` | `⌘ + Z` | Undo |
| `Ctrl + Shift + Z` | `⌘ + Shift + Z` | Redo |
| `Ctrl + A` | `⌘ + A` | Select all nodes |
| `Ctrl + D` | `⌘ + D` | Duplicate selected nodes |
| `Ctrl + Shift + D` | `⌘ + Shift + D` | Duplicate selected nodes vertically |
| `Ctrl + G` | `⌘ + G` | Group selected nodes |
| `Delete` or `Backspace` | `Backspace` | Delete selected nodes |
| `B` | `B` | Disable or enable selected nodes (a disabled node is excluded from runs) |
| `C` | `C` | Collapse or expand selected nodes |
| `Ctrl + I` | `⌘ + I` | Show or hide the node info panel |
| `Ctrl + right-click` | `⌘ + right-click` | Reset a property to its default |
| `← → ↑ ↓` | `← → ↑ ↓` | Nudge selected nodes |
| `Shift + C` | `Shift + C` | Select all connected nodes |
| `Shift + I` | `Shift + I` | Select nodes connected into the selection |
| `Shift + O` | `Shift + O` | Select nodes that receive the selection's output |

### Adding nodes

| Key | Node added at the cursor |
|-----|--------------------------|
| `Space` | Opens the node menu (double-clicking the canvas does the same) |
| `Shift + P` | Prompt |
| `Shift + G` | Text to Image |
| `Shift + V` | Text to Video |
| `Shift + L` | Agent |

### Layout

| Key | Action |
|-----|--------|
| `A` | Align selected nodes |
| `Shift + A` | Align and distribute spacing |
| `Shift + ←` / `→` / `↑` / `↓` | Align to the left, right, top, or bottom edge |
| `Shift + H` | Align centers |
| `Shift + E` | Align middles (vertical center) |
| `Shift + D` | Distribute horizontally |
| `V` | Stack selected nodes in one column |
| `G` | Arrange selected nodes in a grid |

### View and navigation

| Windows/Linux | Mac | Action |
|---------------|-----|--------|
| `F` | `F` | Fit all or selected nodes into view |
| `Ctrl + F` | `⌘ + F` | Find in workflow |
| `Ctrl + 0` | `⌘ + 0` | Reset zoom to 50% |
| `Ctrl + =` / `Ctrl + -` | `⌘ + =` / `⌘ + -` | Zoom in or out by 20% |
| `Ctrl + Alt + 5` / `1` / `2` | `⌘ + ⌥ + 5` / `1` / `2` | Zoom to 50%, 100%, or 200% |
| `Ctrl + Alt + N` / `P` | `⌘ + ⌥ + N` / `P` | Move keyboard focus to the next or previous node |
| `Alt + ← → ↑ ↓` | `⌥ + ← → ↑ ↓` | Move focus to the nearest node in that direction |
| `Enter` | `Enter` | Select the focused node |
| `Ctrl + Alt + B` | `⌘ + ⌥ + B` | Go back to the previously focused node |
| `Esc` | `Esc` | Exit keyboard navigation |

### Panels and app

| Windows/Linux | Mac | Action |
|---------------|-----|--------|
| `1` / `2` | `1` / `2` | Toggle the Workflows or Assets panel |
| `I` | `I` | Show or hide the Inspector |
| `W` | `W` | Show or hide Workflow Settings |
| `O` | `O` | Show or hide the Operator panel |
| `L` | `L` | Toggle the Logs panel (not while editing a timeline) |
| `Ctrl + Shift + T` | `⌘ + Shift + T` | Toggle the Trace panel |
| `Ctrl + K` | `⌘ + K` | Open the command menu (works on every view) |
| `Ctrl + ,` | `⌘ + ,` | Open Settings in a workspace tab |
| `Ctrl + /` or `?` | `⌘ + /` or `?` | Open the keyboard shortcuts panel |

## Chat

| Windows/Linux | Mac | Action |
|---------------|-----|--------|
| `Enter` | `Enter` | Send the message |
| `Shift + Enter` | `Shift + Enter` | Insert a new line |
| `Esc` | `Esc` | Stop a reply in progress, when the message box has focus |
| `Ctrl + Shift + O` | `⌘ + Shift + O` | Start a new conversation in the focused chat |
| `Ctrl + Shift + L` | `⌘ + Shift + L` | Put the cursor in the focused chat's message box |

## Assets

| Windows/Linux | Mac | Action |
|---------------|-----|--------|
| `F2` | `F2` | Rename the selected assets |
| `Shift + click` | `Shift + click` | Extend the selection from the last selected asset |
| `Ctrl + click` | `⌘ + click` | Add or remove an asset from the selection |
| `←` / `→` | `←` / `→` | Previous or next asset in the asset viewer |
| `Ctrl + ←` / `→` | `Control + ←` / `→` | Jump five assets back or forward in the viewer |
| `Ctrl + Backspace` or `Ctrl + Delete` | `⌘ + Backspace` or `⌘ + Delete` | Clear the asset search field |

## Timeline editor

The timeline has three key layouts: NodeTool, Premiere Pro, and Final Cut Pro. Open the shortcut sheet with `?` and pick a layout. The choice is stored in the `timelineKeyboardPreset` setting. The tables below show the NodeTool layout first. On Mac, `Ctrl` in these tables means `⌘`.

| Group | Key | Action |
|-------|-----|--------|
| Tools | `V` | Select tool |
| Tools | `C` | Cut (blade) tool |
| Tools | `N` | Toggle snapping |
| Tools | `Esc` | Clear selection and return to Select |
| Editing | `S` | Split selected clips at the playhead |
| Editing | `Ctrl + Shift + K` | Cut all tracks at the playhead |
| Editing | `Delete` or `Backspace` | Delete selected clips |
| Editing | `Shift + Delete` | Ripple delete (closes the gap) |
| Editing | `Ctrl + D` | Duplicate |
| Editing | `Ctrl + Shift + D` | Duplicate with a 1 second gap |
| Editing | `Ctrl + T` | Cross-fade into selected clips |
| Editing | `Alt + T` | Fade selected clips in and out |
| Editing | `Ctrl + A` | Select all clips |
| Editing | `E` | Extend the selected edit point to the playhead |
| Editing | `Ctrl + Shift + ←` / `→` | Trim the edit point one frame |
| Editing | `Ctrl + Shift + Alt + ←` / `→` | Trim the edit point ten frames |
| Clipboard | `Ctrl + C` / `X` / `V` | Copy, cut, paste at the playhead |
| Move | `←` / `→` | Nudge selected clips one frame |
| Move | `Shift + ←` / `→` | Nudge selected clips one second |
| Playback | `Space` | Play or pause |
| Playback | `Alt + ←` / `→` | Step the playhead one frame |
| Playback | `J` / `K` / `L` | Shuttle back, stop, shuttle forward (press again for faster) |
| Playback | `I` / `O` | Mark in, mark out |
| Playback | `Ctrl + Shift + X` | Clear in and out |
| Playback | `↑` / `↓` | Previous or next cut |
| Playback | `M` | Add a marker at the playhead |
| Playback | `Shift + M` / `Ctrl + Shift + M` | Next or previous marker |
| Keyframes | `Alt + K` | Keyframe the selected clip at the playhead |
| Keyframes | `Alt + Shift + K` / `Ctrl + Alt + Shift + K` | Next or previous keyframe |
| Source | `Shift + E` | Append the source range to the end |
| Source | `W` | Insert the source range at the playhead |
| Source | `D` | Overwrite with the source range at the playhead |
| View | `+` or `=` / `-` | Zoom in or out |
| View | `Shift + Z` | Zoom to fit content |
| History | `Ctrl + Z` | Undo |
| History | `Ctrl + Shift + Z` or `Ctrl + Y` | Redo |
| Mouse | `Ctrl + drag edge` | Roll the cut with its neighbour |
| Mouse | `Alt + drag` | Disable snapping while moving or trimming |
| Mouse | `Ctrl + drag clip` | Insert on drop and push later clips right |

Premiere Pro and Final Cut Pro layouts change these keys:

| Action | Premiere Pro | Final Cut Pro |
|--------|--------------|---------------|
| Select tool | `V` | `A` |
| Cut tool | `C` | `B` |
| Split at playhead | `Ctrl + Alt + K` | `Ctrl + B` |
| Cut all tracks | `Ctrl + Shift + K` | `Ctrl + Shift + B` |
| Delete | `Delete` | `Shift + Delete` |
| Ripple delete | `Shift + Delete` | `Delete` |
| Duplicate | `Alt + D` | `Ctrl + D` |
| Nudge one frame | `Alt + ←` / `→` | `,` / `.` |
| Toggle snapping | `S` | `N` |
| Zoom to fit | `\` | `Shift + Z` |
| Cross-fade into selection | `Ctrl + D` | `Ctrl + T` |
| Insert / overwrite source range | `,` / `.` | `W` / `D` |
| Append source range | `Shift + E` | `E` |

In the Premiere Pro and Final Cut Pro layouts, bare `←` / `→` step the playhead one frame. The NodeTool layout uses `Alt + ←` / `→` for that because bare arrows nudge clips. Shuttle, marking, marker, cut navigation, keyframe, clipboard, and undo keys are the same in all three layouts. See the [Video Editor](video-editor.md#keyboard-shortcuts) guide for the editor itself.

## Sketch editor

The sketch editor reads `Ctrl` as `⌘` on Mac. Holding `Ctrl/⌘` switches temporarily to the Move tool, except while the Crop, Segment, or Transform tool is active. See the [Sketch Editor](sketch-editor.md#keyboard-shortcuts) guide for what each tool does.

| Group | Key | Action |
|-------|-----|--------|
| Tools | `V` `B` `P` `E` `G` `I` | Move, Brush, Pencil, Eraser, Fill, Color Picker |
| Tools | `Q` `S` `J` `T` `F` `C` | Blur, Clone Stamp, Adjustments, Gradient, Transform, Crop |
| Tools | `M` `W` | Rectangle Select, Magic Wand Select |
| Tools | `U` `L` `R` `O` `A` | Shape, Line, Rectangle, Ellipse, Arrow |
| Edit | `Ctrl + Z` | Undo |
| Edit | `Ctrl + Shift + Z` or `Ctrl + Y` | Redo |
| Edit | `Ctrl + C` / `X` / `V` | Copy, cut, paste |
| Edit | `Ctrl + Shift + V` | Paste masked |
| Edit | `Ctrl + T` | Free transform |
| Edit | `Ctrl + Shift + T` | Repeat last transform |
| Edit | `Ctrl + Shift + Alt + T` | Repeat last transform on a copy |
| Edit | `Delete` or `Backspace` | Clear the layer |
| Edit | `Ctrl + Backspace` | Fill with the background color |
| Edit | `Alt + Backspace` | Fill with the foreground color |
| Edit | `Ctrl + I` | Invert colors |
| Edit | `← → ↑ ↓` | Nudge |
| Edit | `Esc` | Cancel or deselect |
| Selection | `Ctrl + A` | Select all |
| Selection | `Ctrl + D` | Deselect |
| Selection | `Ctrl + Shift + D` | Reselect |
| Selection | `Ctrl + Shift + I` | Invert selection |
| Canvas | `Ctrl + 0` | Fit to screen |
| Canvas | `Ctrl + 1` | Zoom to 100% |
| Canvas | `+` or `=` / `-` | Zoom in or out |
| Canvas | `Tab` | Toggle panels |
| Color | `X` | Swap foreground and background colors |
| Color | `D` | Reset colors |
| Paint | `[` / `]` | Decrease or increase brush size |
| Paint | `{` / `}` | Decrease or increase hardness |
| Paint | `0` to `9` | Set the tool opacity preset |
| Layers | `Ctrl + J` | Layer via copy |
| Layers | `Ctrl + Shift + J` | Layer via cut |
| Layers | `Ctrl + ]` / `[` | Move the layer up or down |
| Layers panel | `↑` / `↓` | Previous or next blend mode (when focus is in the Layers panel) |
| Transform tool | `Enter` / `Esc` | Commit or cancel the transform |
| Transform tool | `.` | Reset the transform box |
| Transform tool | `Ctrl + Z` / `Ctrl + Shift + Z` | Undo or redo a transform step |
| Crop tool | `Enter` / `Esc` | Commit or cancel the crop |

Sketches saved from a standalone sketch page also respond to `Ctrl + S` or `⌘ + S`.

## 3D model editor

These keys work only while the 3D model editor is the visible tab.

| Windows/Linux | Mac | Action |
|---------------|-----|--------|
| `G` | `G` | Translate gizmo |
| `R` | `R` | Rotate gizmo |
| `S` | `S` | Scale gizmo |
| `Delete` or `Backspace` | `Delete` or `Backspace` | Delete the selected object and its children |
| `Ctrl + S` | `⌘ + S` | Save the scene to the asset |

See the [3D Editor](3d-editor.md) guide.

## Game editor

The 2D viewport and the scene hierarchy handle keys while they have focus. The editor does not handle these keys while a game is playing.

| Key | Action |
|-----|--------|
| `Ctrl/⌘ + Z` / `Ctrl/⌘ + Shift + Z` | Undo or redo |
| `Ctrl/⌘ + C` / `V` | Copy or paste the selected entities |
| `Ctrl/⌘ + D` | Duplicate the selected entity |
| `Delete` or `Backspace` | Remove the selected entities and their children |
| `← → ↑ ↓` | Nudge the selection by 0.25 units |
| `Shift + ← → ↑ ↓` | Nudge the selection by 2.5 units |
| `F` | Center the 2D camera on the selection |
| `Home` | Reset the camera |
| `G` | Toggle snap to grid (2D viewport) |
| `Space` (held) | Pan with the mouse in the 2D viewport |
| `Alt + ← → ↑ ↓` | Move the selected entity within the scene hierarchy |

The 3D viewport has its own tool keys:

| Key | Action |
|-----|--------|
| `W` | Move tool |
| `E` | Rotate tool |
| `R` | Scale tool |
| `F` | Frame the selection |
| `W` `A` `S` `D`, `R` / `F` | Fly the camera, with `R` and `F` rising and descending (when Fly camera is on) |

While a game is playing, `W`, `A`, `S`, `D`, the arrow keys, and `Space` go to the game. Which keys do what depends on the game's input actions. See the [Game Editor](game-editor.md) guide.

## Desktop app menu

The desktop app menu bar adds accelerators that send the same actions to the editor. `Ctrl/⌘ + S`, `+ T`, `+ W`, `+ D`, `+ Shift + D`, and `+ G` match the editor keys. Two differ from the web editor: **Fit View** is `Ctrl/⌘ + 0` and **Align with Spacing** is `Ctrl/⌘ + Shift + A`. See [Electron Views](electron-views.md) for the full menu.
