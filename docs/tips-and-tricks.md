---
layout: page
title: "Tips and Tricks"
description: "Shortcuts and efficiency tips for NodeTool."
---

Shortcuts, hidden features, and workflow efficiency tips.

---

## Essential Shortcuts

| Shortcut | Action |
|----------|--------|
| `Space` | Open node menu |
| `Ctrl/⌘ + Enter` | Run workflow |
| `Esc` | Stop workflow |
| `Ctrl/⌘ + S` | Save |
| `F` | Fit view |
| `Ctrl/⌘ + Z` | Undo |
| `Ctrl/⌘ + K` | Command menu |
| `Ctrl/⌘ + /` | Show all keyboard shortcuts |

---

## Quick Node Actions

### Adding Nodes Faster

- **Search by typing**: Press `Space`, then just type what you need ("agent", "image", "whisper")
- **Smart connect**: Drag a connection to empty space → get compatible node suggestions
- **Duplicate quickly**: `Ctrl/⌘ + D` copies selected nodes horizontally

### Model Selection

- **Recommended Models**: Click the "Recommended Models" button on AI nodes to see compatible options
- **Quick switch**: Use the Model dropdown to change models without rewiring

### Node Organization

- **Drag from header**: Move nodes by grabbing the header bar (top of node)
- **Group related nodes**: Select multiple, press `Ctrl/⌘ + G`
- **Align selection**: Press `A` to align, `Shift + A` to align with even spacing
- **Collapse a node**: Press `C`
- **Disable a node**: Press `B`
- **Select connected nodes**: `Shift + C` (all), `Shift + I` (inputs), `Shift + O` (outputs)
- **Duplicate vertically**: `Ctrl/⌘ + Shift + D`

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

### Making Connections

- **Type matching**: Colors show compatible connections
- **Quick connect**: Drop on empty space for auto-suggestions
- **Multi-output**: One output can connect to multiple inputs

### Connection Tips

- **Preview intermediate data**: Add Preview nodes between connections
- **Disconnect**: Right-click connection or drag it away
- **Re-route**: Delete and recreate, or drag to a new target

---

## Workflow Management

### Organization

- **Save often**: `Ctrl/⌘ + S` – autosave is on by default, and each manual save also creates a version (**Settings → General → Autosave**)
- **Use descriptive names**: Rename workflows and nodes for clarity
- **Examples**: Open the Examples page from the sidebar menu to start from a working graph

### History & Undo

| Action | Shortcut |
|--------|----------|
| Undo | `Ctrl/⌘ + Z` |
| Redo | `Ctrl/⌘ + Shift + Z` |
| Saved versions | Created on each manual save |

### Layout Recovery

- **Auto layout**: Click the Auto Layout button (or use the command menu) to tidy up

---

## Debugging Workflows

### Finding Problems

1. **Add Preview nodes** between steps to see data at each stage
2. **Check node errors** – red borders or icons indicate issues
3. **Verify connections** – ensure types match
4. **Test incrementally** – run partial workflows first
5. **Disable nodes** – select and press `B`, or right-click → Disable Node, to exclude suspicious nodes and their connections from the run

### Disabling Nodes for Debugging

- **Isolate issues**: Disable a failing branch to run a smaller graph
- **Keep unfinished work**: Leave nodes on the canvas without executing them
- **Skip slow steps**: Temporarily disable heavy processing during testing

### Common Fixes

| Problem | Solution |
|---------|----------|
| A node reports a missing model | Use the model picker's Recommended Models list or Model Manager to install it |
| Wrong output | Check input data and node settings |
| Workflow won't run | Look for disconnected required inputs |
| Slow execution | Try cloud providers for heavy tasks |
| Node causing errors | Disable its branch and run the remaining graph |

---

## Power User Features

### Command Menu

Press `Ctrl/⌘ + K` to open the command menu – the fastest way to:
- Open any workflow by name
- Switch views and panels
- Access settings
- Search for anything

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

## AI Model Tips

### Choosing Models

- **Local for privacy**: Use local models for sensitive data
- **Cloud for speed**: API models are faster
- **Mix both**: Local preprocessing → cloud generation → local post-processing

### Performance

- **Smaller models first**: Test with fast models, upgrade for quality
- **Quantized models**: Smaller files, similar quality (Q4, Q8)
- **Streaming nodes**: See progress during execution

---

## Asset Management

### Working with Files

- **Drag and drop**: Drop files directly onto the canvas
- **Asset panel**: Press `2` to open (or click the Assets icon)
- **Preview**: Click any asset to preview it

### Organizing

- **Create folders**: Keep projects organized
- **Name clearly**: Descriptive names save time later
- **Clean up**: Delete unused assets to save space

---

## Collaboration Tips

### Sharing Workflows

1. **Export workflow**: Use the workflow export feature
2. **Mini-Apps**: Share as simplified interfaces
3. **Screenshots**: Document your workflows visually

### Working with Teams

- **Consistent naming**: Agree on conventions
- **Document**: Add comment nodes to explain complex sections
- **Template library**: Build shared templates

---

## Troubleshooting

### Quick Fixes

| Issue | Try This |
|-------|----------|
| Node menu won't open | Refresh page, check for modals |
| Connection won't attach | Check type compatibility |
| Workflow stuck | Press `Esc` to stop, check error messages |

### Getting Help

- **Node info**: Select a node and press `Ctrl/⌘ + I`
- **Discord**: Ask the community
- **GitHub Issues**: Report bugs

---

## Cheat Sheet

### Most Used Shortcuts

| Windows/Linux | Mac | Action |
|--------------|-----|--------|
| `Space` | `Space` | Node menu |
| `Ctrl + Enter` | `⌘ + Enter` | Run workflow |
| `Ctrl + S` | `⌘ + S` | Save |
| `Ctrl + Z` | `⌘ + Z` | Undo |
| `Ctrl + D` | `⌘ + D` | Duplicate |
| `F` | `F` | Fit to screen |
| `A` | `A` | Align nodes |
| `Ctrl + K` | `⌘ + K` | Command menu |
| `i` | `i` | Toggle Inspector |

---

## Next Steps

- **[Workflow Editor](workflow-editor.md)** – Full editor documentation
- **[Sketch Editor](sketch-editor.md)** – Image editing guide
- **[Game Editor](game-editor.md)** – Build, play, and export 2D and 3D games
- **[Cookbook](cookbook.md)** – Workflow patterns
- **[Keyboard Shortcuts](user-interface.md#keyboard-shortcuts)** – Complete list
