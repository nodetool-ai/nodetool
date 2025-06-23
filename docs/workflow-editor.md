---
layout: default
title: Workflow Editor
---

The workflow editor is where you design and run AI pipelines. Nodes represent tasks and edges define how data flows between them.

### Creating nodes

- Press the **Space** key or double‑click the canvas to open the node menu.
- Search or browse the namespaces tree on the left side to find the node you need.
- Click or Drag nodes onto the canvas and connect their inputs and outputs.

### Managing the graph

- Use the toolbar to **save** your workflow or arrange nodes automatically with **Auto Layout**.
- Undo and redo changes using <kbd>Ctrl/⌘+Z</kbd> / <kbd>Ctrl/⌘+Shift+Z</kbd>.
- Right‑click to open context menus for nodes, input + output handles, and the canvas.

### Running workflows

- Click the **Run** button or press <kbd>Ctrl/⌘+Enter</kbd> to execute the workflow.
- Click the **Stop** button or press <kbd>ESC</kbd> to cancel the execution.
- Status updates and results stream back in real time.
- Workflows can run locally or dispatch jobs to remote workers.

### Tabs and panels

- Multiple workflows can be open in tabs at once.
- Panel icons on the left provide access to Chat, Workflows, Assets, RAG Collections and Packs.
- The right panel shows the Inspector <kbd>i</kbd> that offers an alternative way to change the parameters of a selected node.

### Node menu

- Press **Space** or double‑click the canvas to open the floating menu.
- Search by just starting to type or browse the namespace tree on the left. The menu is draggable.
- Filter nodes by their input or output types by clicking the filter icon.
- Press **Esc** or click outside to close the menu.

### Keyboard shortcuts

- <kbd>F</kbd> fits the graph to the window or focuses on the selection.
- <kbd>Ctrl/⌘+C</kbd>, <kbd>Ctrl/⌘+V</kbd> and <kbd>Ctrl/⌘+X</kbd> copy, paste or cut nodes.
- <kbd>Ctrl/⌘+S</kbd> to save the current workflow.
- <kbd>Ctrl/⌘+D</kbd> duplicates nodes horizontally; <kbd>Ctrl/⌘+Shift+D</kbd> stacks them vertically.
- <kbd>Ctrl/⌘+G</kbd> groups the current selection.
- <kbd>A</kbd> to align selected nodes, <kbd>Shift+A</kbd> to align and evenly arrange nodes.
- <kbd>Arrow keys</kbd> nudge nodes in any direction.
- <kbd>Ctrl/⌘+Z</kbd> / <kbd>Ctrl/⌘+Shift+Z</kbd> undo and redo.
- <kbd>Ctrl/⌘+1</kbd>…<kbd>Ctrl/⌘+9</kbd> jump directly between open tabs.
- <kbd>Key 1</kbd>…<kbd>Key 5</kbd> opens the left panel menus.
- <kbd>Key i</kbd> toggles the Inspector on the right side.

### Context menus

- Right‑click on node headers, node parameters, input + output handles, or the canvas for extra options.
- Release a connection on empty space to open a connection helper menu with auto-create options and to show compatible nodes.

### Documentation and help

- Hover a node in the Node Menu to see its description, inputs and outputs.
- Hover the ? at the bottom-right of a node on the canvas

For a quick introduction see the [Getting Started guide](getting-started.md).
