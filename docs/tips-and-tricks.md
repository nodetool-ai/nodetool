---
layout: page
title: "Tips and Tricks"
description: "Editor techniques: adding and arranging nodes, canvas navigation, debugging with Preview and disable, and panel keys."
---

Editor techniques that save steps. The full key list is in [Keyboard Shortcuts](keyboard-shortcuts.md).

---

## Adding and arranging nodes

- Press `Space` and type a name ("agent", "image", "whisper"). Double-clicking empty canvas does the same.
- Drag a connection onto empty canvas to get a menu of nodes that match the type.
- `Ctrl/⌘ + D` duplicates selected nodes horizontally. `Ctrl/⌘ + Shift + D` duplicates vertically.
- `Ctrl/⌘ + G` groups the selection. `A` aligns, `Shift + A` aligns with even spacing. `C` collapses a node.
- `Shift + C` selects all connected nodes, `Shift + I` the nodes connected into the selection, `Shift + O` the nodes that receive its output.
- On AI nodes, **Recommended Models** lists compatible models, and the Model dropdown switches models without rewiring.

---

## Canvas Navigation

| Action | How |
|--------|-----|
| **Pan around** | Left-drag on empty canvas (Windows/Linux default) or right/middle-drag (macOS default). Change it in **Settings → General → Canvas → Left-Click Drag** |
| **Zoom** | Scroll wheel (Windows/Linux), pinch or `Ctrl/⌘` + scroll (macOS, where plain scroll pans) |
| **Fit to screen** | Press `F` |
| **Focus on selection** | Select nodes, then press `F` |
| **Reset zoom** | `Ctrl/⌘ + 0` |
| **Zoom in / out** | `Ctrl/⌘ + =` / `Ctrl/⌘ + -` |
| **Snap to grid** | Enable in the desktop View menu, the command menu, or **Settings → General → Canvas** |

---

## Connections

- One output can feed many inputs. An input takes one line.
- Right-click a connection or drag it away to disconnect.
- Add Preview nodes between steps to inspect intermediate data.

---

## Saving and layout

- Autosave is on by default, and each manual save (`Ctrl/⌘ + S`) creates a version. Configure it in **Settings → General → Autosave**.
- Open the Examples page from the sidebar menu to start from a working graph.
- Undo is `Ctrl/⌘ + Z` and redo is `Ctrl/⌘ + Shift + Z`.
- The Auto Layout button (or the command menu) tidies a graph.

---

## Debugging

1. Add Preview nodes between steps.
2. Look for red borders or icons on failed nodes.
3. Run part of the graph. Select a node and press `B` (or right-click → Disable Node) to exclude it and its connections from the run.

| Problem | Fix |
|---------|-----|
| A node reports a missing model | Install it from the model picker's Recommended Models list or Model Manager |
| Run will not start | Look for disconnected required inputs |
| Node menu will not open | Close any open modal, then refresh the page |

More in [Troubleshooting](troubleshooting.md).

---

## Command menu, tabs, and panels

### Command Menu

`Ctrl/⌘ + K` opens any workflow by name, switches views and panels, and opens settings.

### Multi-Tab Workflow

- **Multiple workflows**: Open in tabs, switch with `Ctrl/⌘ + 1-9`
- **Reference between**: Copy nodes from one workflow to another
- **Reorder**: Drag tabs to change their order

### Keyboard Navigation

| Shortcut | Action |
|----------|--------|
| `1` / `2` | Toggle Workflows / Assets panel |
| `i` | Toggle Inspector (right panel) |
| `w` | Toggle Workflow Settings panel |
| `o` | Toggle Operator panel |
| `Ctrl/⌘ + F` | Search nodes on canvas by label |
| `Arrow keys` | Nudge selected nodes |
| `Ctrl/⌘ + Alt + N` / `P` | Move focus to next / previous node |

---

## Files

- Drop files onto the canvas to add them as assets.
- Press `2` to open the Assets panel.
- Add Comment nodes to explain sections of a shared workflow.
- Press `Ctrl/⌘ + I` on a selected node for its info panel.

---

## Next Steps

- **[Workflow Editor](workflow-editor.md)** – Full editor documentation
- **[Sketch Editor](sketch-editor.md)** – Image editing guide
- **[Game Editor](game-editor.md)** – Build, play, and export 2D and 3D games
- **[Cookbook](cookbook.md)** – Workflow patterns
- **[Keyboard Shortcuts](keyboard-shortcuts.md)**
