---
layout: page
title: "Text and SVG Documents"
permalink: /text-and-svg-documents
description: "Create text files and SVG drawings from the New menu, then edit them in the code editor, the table editor, and the live SVG preview."
---

The **New** menu in the workspace tab bar creates blank documents. Two of them are plain files you edit directly: **Text** (Markdown, JSON, YAML, CSV, TSV, or plain text) and **SVG**. Both are stored as project assets, open in a tab, and save back to the same asset.

> **Quick Access:** Click **+ New** in the tab bar. Under **Blank documents**, choose **New text file…** or **New SVG**.

---

## What the New menu offers

The menu has a **Guided flows** section and a **Blank documents** section. Blank documents are created in the project you have open, and each one opens in a new tab.

| Menu item | Creates | More |
|---|---|---|
| **New workflow** | An empty workflow, opened in edit mode | [Workflow Editor](workflow-editor.md) |
| **New chat** | A chat thread | [Chat](global-chat.md) |
| **New text file…** | A text file from a template. Opens a submenu | [Text files](#text-files) below |
| **New sketch** | A blank 1024 by 1024 white image, opened in the sketch editor | [Sketch Editor](sketch-editor.md) |
| **New SVG** | A blank SVG drawing | [SVG documents](#svg-documents) below |
| **New timeline** | An empty timeline named "Untitled timeline" | [Video Editor](video-editor.md) |
| **New storyboard…** | A blank storyboard, or an example storyboard with stills included. Opens a submenu | |
| **New app** | An empty mini app named "Untitled app" | [App Builder](app-builder.md) |
| **New script** | A script document named "Untitled script" | |
| **New JS script** | A JavaScript script document named "Untitled JS script" | [JavaScript Sandbox](javascript-sandbox.md) |
| **New skill** | A skill with a generated name and a starter body | [Skills](skills.md) |
| **New 3D model** | A model containing a single box | [3D Editor](3d-editor.md) |

Items marked with an ellipsis open a second list. Use **Back** at the top of that list to return. If creating a document fails, a notification names what could not be created and why.

Games are not in this menu. See [Game Editor](game-editor.md) for how to start one.

---

## Text files

**New text file…** opens a list of six templates. Choosing one creates an asset with the starter content shown and opens it in **Edit** mode.

| Template | File name | Starts with |
|---|---|---|
| Markdown (.md) | `Untitled.md` | `# Untitled` |
| JSON (.json) | `Untitled.json` | `{}` |
| YAML (.yaml) | `Untitled.yaml` | `---` |
| CSV (.csv) | `Untitled.csv` | A single column named `Column 1` |
| TSV (.tsv) | `Untitled.tsv` | A single column named `Column 1` |
| Plain text (.txt) | `Untitled.txt` | Empty |

The file extension decides how the document is shown and highlighted.

### View and Edit

A text tab has a **View** and **Edit** toggle at the right of the tab bar.

| Mode | Markdown | CSV and TSV | Everything else |
|---|---|---|---|
| **View** | Rendered Markdown | A read-only table. The first 2000 rows are shown | Read-only code with syntax highlighting |
| **Edit** | Code editor | An editable table | Code editor |

The view header shows the file name, the detected language, and a copy button that copies the whole text.

### The code editor

Edit mode uses the Monaco editor, the same editor as VS Code, with a minimap and word wrap on by default. The language comes from the file extension, for example `.json` as JSON, `.py` as Python, `.ts` as TypeScript, `.sql` as SQL, `.html` as HTML, and `.sh` as shell. Files with no known extension but a `text/` content type are treated as plain text.

The toolbar above the editor has:

- **Undo** and **Redo**
- **Toggle Word Wrap**
- **Save**, with a dot beside it while there are unsaved changes

Press Ctrl+S (Cmd+S on macOS) inside the editor to save. The buttons for Find & Replace and Format as Code Block appear in the toolbar but are not wired up in this editor.

### The table editor

CSV and TSV files open in a table instead of text. You edit cells directly, and the file is re-serialized with the right delimiter (comma for `.csv`, tab for `.tsv`) when you save. **Save** sits in the table toolbar.

---

## SVG documents

**New SVG** creates `Untitled.svg` containing an empty 512 by 512 drawing:

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
</svg>
```

An SVG is both a picture and a text file, so it has its own tab type.

### View and Edit

| Mode | What you see |
|---|---|
| **View** | The drawing, centered on a checkerboard so transparent areas read as transparent |
| **Edit** | The SVG markup in a code editor on the left and a live preview on the right |

The preview renders the markup as you type, before you save. If the markup has no `<svg>` element, the preview shows "No `<svg>` element to render".

The markup is XML, so the editor highlights it as XML. There is no drawing canvas. You write or paste the markup and watch the preview.

### Saving

The toolbar shows the file name, a dot while there are unsaved changes, and a **Save** button. Ctrl+S (Cmd+S on macOS) also saves. **Save** is disabled until you change something. A notification confirms the save or shows the error. Saving writes the markup back to the asset with its original content type, `image/svg+xml` by default.

### What the preview removes

The preview shows sanitized markup. It drops `<script>` elements, `<foreignObject>`, and the `onload`, `onerror`, and `onclick` attributes, and keeps the drawing elements: shapes, paths, text, gradients, filters, masks, and symbols. Your saved file is not changed by this, so the preview can look different from the raw file if you rely on scripts or embedded HTML.

---

## Related

- [Workspaces](workspaces.md) for tabs, projects, and the View / Edit toggle
- [Asset Management](asset-management.md) for the assets these documents are stored as
- [Sketch Editor](sketch-editor.md) for raster painting
