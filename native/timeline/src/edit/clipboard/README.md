# Clipboard and group edits

[Package F](../../../docs/PLAN-GAPS.md#f-clipboard-and-structure-f6) registers edits through
[EditRegistry](../../../src/app/README.md). Each document change is one
`TimelineModel::applyEdit` call and one undo entry. Copy changes only the
process-wide clipboard, which is shared between timeline tabs.

| Edit | Payload |
| --- | --- |
| `copy`, `cut` | `selectedIds` |
| `paste`, `pasteInsert` | `atMs`, `mode` for ordinary paste |
| `duplicateSelected`, `duplicate` | `selectedIds`, optional `offsetMs` |
| `duplicateWithGap` | `selectedIds`, with the web's extra 1000 ms gap |
| `altDragCopy` | `clipId`, `selectedIds`, `deltaMs`, optional `toTrackId`, `mode` |
| `pasteClipAttributes`, `pasteAttributes` | `selectedIds`, `groups`, optional `source` (otherwise the first clipboard clip) |
| `groupClips`, `ungroupClips` | `selectedIds` |
| `closeGapAt` | `trackId`, `timeMs` |

Pass the current `linked` selection flag on moves and grouping. Paste and
ripple operations accept `untargetedTrackIds` and `syncLockOffTrackIds` arrays
in the payload, falling back to arrays on the input object. These are UI
policy inputs, not new document fields.

`altDragCopy` produces the completed drag result: fresh copies stay at the
original positions, the original clips move, and the drop settles using
`mode` (default `overlap`). Invoke it once on release against the gesture's
initial document, with the final delta and drop mode. For live feedback,
clone in place once when the drag threshold is crossed, then preview moves
of the originals. Commit the completed result as one command. Ctrl/Cmd
release chooses `insert`. Cancellation restores the initial document. Alt
held at pointerdown duplicates while retaining snapping. Alt first pressed
later in the gesture only bypasses snapping.

Pure C++ APIs in [ClipboardOps.h](ClipboardOps.h) expose clipboard queries,
cloning, attribute patches and marquee selection. `findGap` in `ClipOps.h`
returns gap bounds. [GroupOps.h](../groups/GroupOps.h) exposes descendant
spans for the bracket. Selection state stays outside the document.

The web's `deleteSelected` removes selected groups and releases their direct
children. It does not delete descendants. `ungroupClips` follows the web's
sequence of `deleteClip` calls and releases direct children in place.

The speed group requires the `setClipSpeed` registry edit with payload
`{clipId, speed}` to perform the store's retime. There is no field-patch
substitute. The existing `ClipOps` animation-curve refusals also apply to
group trims until package L supplies curve slicing.

## UI integration

- A1: `ClipGestureController` must dispatch copy, cut, paste, pasteInsert,
  pasteAttributes, duplicate, duplicateWithGap, groupClips and ungroupClips,
  and include them in `availableActions`. Its Alt move gesture must use the
  initial-document contract above. Clipboard reads and the pure selection
  helpers need QML-callable accessors in the controller.
- A2: `TrackLane.qml` must snapshot clips and row bounds for marquee drags,
  union with the pointerdown selection for Shift, and select a gap only on
  an unlocked lane with a plain click within the web's 3 px slop. Both delete
  actions close a selected gap at its start when no clips are selected, then
  clear the selected gap. Draw it with primary colour at alpha 0.18 and a
  1 px primary border.
- A3: `TracksRegion.qml` must host `RubberBandOverlay` in content coordinates
  across all lanes, bind its `bandRect`, and clear it on release or cancel.
- A4: `TimelineEditor.qml` must open `PasteAttributesDialog` with the first
  clipboard clip and selected target clips. Apply its `groupsChosen` through
  `pasteAttributes` and update selection after paste, duplicate and grouping.
- A5: `ClipBody.qml` must render `GroupBracket` for group media instead of a
  filmstrip. Pass `clipId`, `startMs`, `durationMs`, `widthPx`, `spanStartMs`
  and `spanEndMs`. Supply spans through `Clip.qml` or a model/controller
  accessor that changes only with document edits, never the playhead.
