# Timeline Component

The timeline editor (`/timeline/:sequenceId`) is a generation-aware media
sequencing surface. Tracks hold imported or AI-generated clips; each clip
remembers how it was made and can be re-generated, versioned, and exported.

## Asset Drag-and-Drop

### From AssetExplorer → TrackLane (supported)

Drag any image, video, or audio asset from the `AssetExplorer` panel and drop
it onto a compatible track lane:

| Asset type | Valid track types |
|-----------|-------------------|
| `image/*` | `video`, `overlay` |
| `video/*` | `video`, `overlay` |
| `audio/*` | `audio` |

A clip is created at the drop position with:
- `sourceType = "imported"` and `status = "generated"` (the asset *is* its output).
- `durationMs` derived from `asset.duration` (× 1 000 to convert seconds → ms),
  falling back to 4 000 ms for assets without duration metadata.
- `currentAssetId` pointing to the dragged asset.

Dropping onto an incompatible track (e.g. audio onto a video lane) shows a
brief warning banner and does **not** create a clip.

### From OS file system → Timeline (out of scope)

Dragging a file directly from the operating system's file explorer into the
timeline is **not** supported. The recommended workflow is:

1. Drop the file onto the `Dropzone` in the `AssetExplorer` panel.
   The file is uploaded and appears as a new asset in your library.
2. Once the upload completes, drag the resulting asset from `AssetExplorer`
   onto the desired track lane in the timeline.

This keeps the upload and clip-creation paths separate, ensures assets are
persisted in the database before being referenced by a clip, and avoids
partial-upload states in the timeline document.

## Persistence

Every `TimelineStore` mutation (clip add, move, trim, split, delete) is
observed by the autosave hook, which PATCHes the sequence document via the
timeline REST API (NOD-299). Changes survive a page refresh. Concurrent
edits from another tab are out of scope (last-write-wins via `updated_at`).
