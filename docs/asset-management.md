---
layout: page
title: "Asset Management"
description: "Organize, browse, and use files in your NodeTool workflows."
---

NodeTool lets you store and organize files used in your workflows. Assets can be images, audio clips, videos, PDFs, 3D models, or any other resources referenced by nodes.

---

## Asset Explorer

The **Asset Explorer** is the central hub for managing your files. Open it from the left sidebar.

### Views

- **Grid view** -- Thumbnails with previews, best for visual assets like images and videos
- **List view** -- Compact rows with metadata columns, best for large libraries

Switch between views using the toggle in the toolbar.

### Navigation

- **Folder tree** -- Browse your directory hierarchy in the left panel
- **Search** -- Full-text search across file names, tags, and metadata
- **Infinite scrolling** -- Large libraries load progressively for performance

### Uploading Files

- **Drag and drop** files directly into the Asset Explorer
- Use the **Upload** button in the toolbar
- Drop files onto a workflow node to create an input node automatically

### Working with Assets in Workflows

Drag any asset from the Asset Explorer directly into the workflow canvas. NodeTool automatically creates the appropriate input node based on the file type (image input, audio input, etc.).

---

## Asset Viewers

NodeTool includes specialized viewers for common file types:

| File Type | Viewer Features |
|-----------|----------------|
| **Images** | Zoom, pan, pixel inspection |
| **Audio** | Waveform display, playback controls, scrubbing |
| **Video** | Frame-by-frame playback, timeline scrubbing |
| **PDF** | Page navigation, text selection, zoom |
| **Text** | Syntax highlighting, line numbers, copy excerpts |
| **3D Models** | Interactive 3D preview with rotation and zoom |

Open any asset in its viewer by double-clicking it in the Asset Explorer. Use the toolbar within the viewer to zoom, scrub, or copy content.

---

## Collections

![Collections Explorer](assets/screenshots/collections-explorer.png)

Collections group related assets for use in RAG (Retrieval-Augmented Generation) workflows and organized project management.

### Creating Collections

1. Open the **Collections** panel from the left sidebar
2. Click **New Collection** and give it a name
3. Drag assets from the Asset Explorer into the collection

### Using Collections in Workflows

Collections integrate with document indexing and vector search nodes. When you connect a collection to an indexing node, all assets in the collection are processed and made searchable.

---

## Metadata and Tags

- Assets automatically track metadata: file size, type, dimensions (for images/video), duration (for audio/video)
- **Tag files** to make searching easier as projects grow
- Tags are searchable from the Asset Explorer search bar

---

## Document Indexing

Text-based assets (PDFs, text files, documents) can be indexed for vector search:

1. Add documents to a **Collection**
2. Connect the collection to an **Index** node in your workflow
3. Use **Vector Search** nodes to query the indexed documents
4. Combine with language models for Retrieval-Augmented Generation (RAG)

See [Indexing](indexing.md) for detailed setup instructions.

---

## Storage

Assets are stored locally in your user directory (`~/.nodetool/`) by default. You keep full control of your data.

For deployed instances, assets can be stored in:
- **S3-compatible storage** -- AWS S3, MinIO, or compatible services
- **Supabase Storage** -- Integrated with Supabase auth

See [Storage](storage.md) for backend configuration.

---

## Next Steps

- [Indexing](indexing.md) -- Set up document indexing for RAG workflows
- [Storage](storage.md) -- Configure storage backends
- [Workflow Editor](workflow-editor.md) -- Use assets in your workflows
- [Example: Chat with Docs](workflows/chat-with-docs.md) -- Build a RAG workflow with your documents
