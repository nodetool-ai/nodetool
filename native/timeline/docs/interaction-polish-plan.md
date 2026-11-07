# Native timeline interaction polish plan

Question: which small interactions are missing or incomplete in the native C++/Qt editor, and what should be implemented?

Source audit: `feat/native-timeline` at `3df7fc227bba42a325f15b2668d62d87a20ba0b5`. The findings combine source inspection and reported Windows behavior. No new interactive reproduction run was performed.

**Code** means a gap or incomplete behavior in the inspected implementation. **Reported** means the user observed it, but its runtime cause still needs reproduction. **Check** means existing behavior needs validation, not a new feature. Implementation details below are recommendations for the native editor.

## First: pointer feedback, tooltips and safe input

| ID | Gap and evidence | Implementation and acceptance |
| --- | --- | --- |
| F1 | **Reported: resize cursor disappears or loses meaning during scaling.** [Gizmo] already sets hover cursors. Their absence is a regression to reproduce, not an absent cursor implementation. | Make the active gesture own its cursor until release/cancel. Hover leave must not clear it during a grab. Verify every handle, leaving the preview, and returning without a stuck cursor. |
| F2 | **Code: resize cursors ignore rotation.** [Gizmo] maps fixed handle names to fixed cursor shapes. | Derive direction from the transformed handle axis in screen coordinates, including rotated/flipped clips. Use the same hit result for hover, cursor and drag. |
| F3 | **Code + reported: trim-edge hover is hard to see.** [ClipBody] paints both edges with `actionPressed` when the whole clip is hovered/selected. | Highlight the actual hovered edge with a contrasting stroke and small grip. Distinguish hover, active trim and locked states. Match the visible affordance to the hit area, without changing clip geometry. |
| F4 | **Code: small targets become unusable.** [Clip] removes trim areas below 28 logical pixels. [Gizmo] uses an 8-pixel handle-sized hit box. | Separate painted size from hit tolerance. Choose between competing start/end/body targets by nearest edge and active tool. Scale hit tolerance with UI settings. A short clip must remain trimmable without accidentally moving it. |
| F5 | **Code + reported: tooltip repeats its title.** [InspectorHeader] assigns the same label to `accessibleName` and `description`; [SectionTitle] does likewise. [EditorButton] concatenates them. | Remove redundant descriptions and omit a description equal to the title. Show title, current shortcut, and genuinely additional help once. Test both inspector action buttons and section actions. |
| F6 | **Reported: tooltip appears in the wrong place.** [Tooltip] maps a trigger to the overlay, but its binding does not explicitly observe ancestor scrolling/reparenting. This is a cause to test. | Recompute the anchor on show and relevant geometry changes, or dismiss during movement. Clamp/flip inside the correct window using logical coordinates. Test dock movement, nested scrolling and mixed-DPI monitors. [Qt tooltip positioning][qt-tooltip]. |
| F7 | **Code: tooltip ownership and dismissal are inconsistent.** Custom [EditorButton] tips coexist with attached `ToolTip` call sites. Focus alone can keep a custom tip visible. | Use one tooltip policy across controls. Hide stale tips on press, drag, scrolling, menu open and trigger disappearance. Keep keyboard help available without leaving multiple tips on screen. Attached Qt tips share an instance; custom instances do not. [Qt][qt-tooltip]. |
| F8 | **Code: editing tools lack matching pointer previews.** [Clip] uses move/resize cursors regardless of razor, ripple, roll, slip or stretch mode. | Drive cursor and preview from active tool plus hit region. Razor hover should show the exact cut position and affected linked clips. Show unavailable feedback for locked/invalid targets. |
| F9 | **Code: transform cancellation differs from timeline cancellation.** [Gizmo] calls `end()` on mouse ungrab and has no Escape branch in `handleKey`; [Gestures] cancels on ungrab. | Define one transaction contract: release commits once, Escape/unexpected grab loss restores the press state. Clear cursor/overlays and prevent autosaving canceled previews. Test the mounted viewer and window-level key routing. |
| F10 | **Code: native Edit-menu dispatch overrides the editing context.** [ShellMenus] forces focus to the editor before synthesizing a shortcut. | Route Cut/Copy/Paste/Select All/Undo/Delete to the actual focused text editor or panel. Menu and keyboard invocation must target the same selection. Test while typing an inspector value and renaming media. |

## Next: precise timeline editing

| ID | Gap and evidence | Implementation and acceptance |
| --- | --- | --- |
| F11 | **Code: no live trim/move measurement near the gesture.** [Gestures] exposes position and a snap line, but the inspected clip UI has no edit readout. | Show signed frame/time delta and resulting duration while trimming. Include position for moves, percentage for stretch, and fade duration for fades. Keep the readout clear of the pointer and within the viewport. |
| F12 | **Code: source limits are enforced without clear visual explanation.** [Gestures] clamps trim operations. | Show available source extent while trimming and a distinct stop indicator at the media boundary. Identify whether the limit is source length, minimum duration, lock or neighboring clip. Do not imply more footage is available. |
| F13 | **Code: edge autoscroll covers horizontal clip moves only.** [Gestures] `updatePolish()` returns for other gesture kinds. | Extend continuous edge scrolling to trim, slip/slide, marquee and track reorder where applicable, including vertical travel. Reuse viewport coordinates and recompute the drag after scrolling. Stop on release/cancel. |
| F14 | **Code: library drops do not preview their actual placement.** [AssetDrop] highlights the viewport and says “Drop onto this track”; `dropAllowed` is not reflected in that feedback. | Draw a duration-sized ghost at the proposed track/time. Show insert/overwrite/overlap consequences and linked destinations. Invalid targets need a reason and forbidden feedback. Use the same placement result for preview and commit. |
| F15 | **Code: snapping feedback and live modifiers are incomplete.** [Tracks] draws a line without target identity. [Gestures] captures `alt` at press time. | Label the winning target, such as playhead, marker or clip edge. Update bypass state during a held drag without canceling or jumping. Preserve the original timeline time on near-vertical track moves. Keep the existing snap engine and Alt convention. |
| F16 | **Code: inspector keyframes are edited one at a time.** [KeyframeLane] stores one `fromMs`/`toMs` drag and no selected-key set. | Add additive selection and marquee, then move selected keys by one frame-snapped delta while preserving offsets. Delete and nudge the set in one undo step. Keep selection styling separate from the playhead indicator. |
| F17 | **Code: keyframe glyphs do not communicate easing.** [KeyframeLane] offers easing choices but always draws the same diamond. | Derive glyph/tooltip from authoritative interpolation state, including hold. Update after menu changes, presets, undo and redo. Hover should identify property, time and value. |
| F18 | **Code: transport timecode is read-only.** [Preview] renders `transportTimecode` as `Ui.Text`. | Click to type a frame/timecode and drag to scrub in frame increments. Enter commits, Escape restores, invalid text never seeks. Formatting followed by unchanged Enter must preserve the exact frame at fractional rates. |
| F19 | **Code: timeline zoom lacks selection framing and previous-view recall.** [ViewState] has pointer/playhead anchoring and fit, but no selection/previous-view command. | Add Zoom to Selection and a Fit/Previous toggle storing scale and scroll together. Keep existing pointer-anchored wheel and playhead-anchored button behavior. |
| F20 | **Code: number-drag modifiers can change the whole accumulated delta.** [PillInput] multiplies displacement from the original press by the current modifier factor. | Re-anchor when the precision modifier changes so the value stays continuous. Preserve existing Shift-coarse/Alt-fine behavior, typing and cancellation. Show unit and precision hints. Verify a mid-drag modifier change causes no jump. |

## Then: viewer and workspace details

| ID | Gap and evidence | Implementation and acceptance |
| --- | --- | --- |
| F21 | **Code: viewer navigation is limited to fitting the image.** [Preview] sizes the frame to its container; there is no viewer zoom/pan control or transform-overlay toggle. | Add Fit/100%/percentage zoom, temporary pan, and Show Controls. Keep view navigation separate from document transforms and undo. Preserve handle hit testing after zoom/pan. |
| F22 | **Code: viewer transforms lack alignment feedback.** [GizmoMath] snaps rotation and anchor positions, but body movement has no canvas-edge/center guide snap. | Offer optional center/edge guides, a visible snapped state, and temporary bypass. Show position/scale/angle during dragging. Keep tolerances in screen space and distinguish guides from selection bounds. |
| F23 | **Code: the track-name column has a fixed width.** [Tracks] binds a read-only `headerWidth` to a metric. Track-height resizing already exists. | Add a discoverable vertical splitter with hover line and horizontal resize cursor. Persist width, enforce usable minima, and provide reset. Keep ruler, lanes and drop coordinates aligned. |
| F24 | **Code: truncated names lack consistent reveal.** [DockTabs], [TrackHeader] and [AssetItem] elide labels without full-name tooltips. Source-viewer names already have one. | Show full text on hover/focus only when truncated. Include path/location where duplicate asset names need disambiguation. Retain the existing dock overflow menu. |
| F25 | **Code: Speed/Duration has no dialog-wide default action.** [SpeedDialog] wires Apply to a click; its numeric field consumes Enter to finish editing. | Commit/validate the active field, then apply once on Enter. Escape cancels the dialog draft. Keep validation visible and restore focus to the invoking control. Test Enter from each field, not only from the Apply button. |
| F26 | **Code: disabled actions often provide no reason.** [InspectorHeader] disables actions without passing `disabledReason`; [Preview] disables frame stepping during playback without explaining it. | Wire short contextual reasons through the existing primitive: stop playback, select a clip, unlock track, or select one item. Explain disabled commands without making them actionable. Verify hover and keyboard accessibility. [Native design][native-design]. |

## Reproduce before adding more work

These regression checks are **not established NodeTool defects**. Add an implementation task only when the mounted editor fails the check.

| ID | Check and acceptance | Starting point |
| --- | --- | --- |
| F27 | Pointer capture survives leaving a panel/window. Release outside commits once. Escape and lost capture restore state. Test clip/fade/transition/keyframe/gizmo drags separately. | [Gestures], [Gizmo], [KeyframeLane]. |
| F28 | Text fields retain caret keys, clipboard and IME input. Tab/Shift+Tab follows visual order. Completing rename or explicitly opening Source restores focus to the intended panel. | [SourceViewer], [PillInput]. |
| F29 | Popups near every window edge remain reachable. Opening press cannot immediately dismiss them. Menu arrows/Enter/Escape cannot trigger underlying playback or edits. Test narrow windows and enlarged UI/text. | [Popover], [Dialog]. |
| F30 | Right-click preserves an existing multi-selection. The menu targets the same set as shortcuts. One drag produces one undo entry, while separate toggles/dropdown choices remain separately undoable. | [Clip], [Gestures], inspector controllers. |
| F31 | Scrolled-out rows and clipped gizmos never intercept visible controls. At the playhead, trim/fade/transition handles retain their intended priority. Verify short clips, overlapping handles and UI scaling. | [Tracks], [Clip], [Gizmo], `Playhead.qml` passthrough rules. |
| F32 | Shortcuts in tooltips/help match the selected preset and platform. Loop, snap, link and lock states remain visually distinct from hover and expose checked state to assistive technology. | [EditorButton], `ToolToggle.qml`, [Preview]. |
| F33 | Playback does not fight scrubbing. Manual navigation and follow-playhead have a clear ownership policy. Source and program transport commands act on the focused viewer at fractional frame rates. | [ViewState], [SourceViewer], `Playhead.qml`, playback clock. |
| F34 | Multi-selection trim has explicit semantics. If only one edge is editable, highlight that edge rather than suggesting the whole selection will trim. If group trim is added, clamp one common delta to every source limit. | [Gestures] currently trims a primary clip plus linked behavior. |

## Implementation boundaries

Use the existing [native primitives][native-design] and controller transactions. Keep hit testing, cursor choice and the advertised action consistent. Add real pointer/key tests through mounted QML, not only tests that call edit commands directly.

The first acceptance pass should cover light/dark themes, 100%/150%/200% Windows scaling, a small window, long labels, locked clips, narrow clips, and moving between monitors. These are proposed test conditions, not claimed passing results.

Do not reimplement already-present features: basic snapping and bypass, keyboard presets, move/trim undo, track reorder/height resize, source marks, frame stepping, keyframe retiming, dock overflow, or pointer/playhead-anchored timeline zoom. The older [gap backlog](gaps-backlog.md) is a lead for investigation, not proof a feature remains absent.

[Gizmo]: ../src/preview/gizmo/TransformGizmoController.cpp
[GizmoMath]: ../src/preview/gizmo/GizmoMath.cpp
[Clip]: ../qml/Tracks/Clip.qml
[ClipBody]: ../qml/Tracks/ClipBody.qml
[Gestures]: ../src/edit/ClipGestureController.cpp
[Tracks]: ../qml/Tracks/TracksRegion.qml
[TrackHeader]: ../qml/Tracks/TrackHeader.qml
[ViewState]: ../src/ui/TimelineViewState.cpp
[Preview]: ../qml/preview/PreviewArea.qml
[SourceViewer]: ../qml/SourceViewerPanel.qml
[KeyframeLane]: ../qml/Inspector/KeyframeLane.qml
[PillInput]: ../qml/Inspector/primitives/InspectorPillInput.qml
[InspectorHeader]: ../qml/Inspector/primitives/InspectorHeader.qml
[SectionTitle]: ../qml/Inspector/primitives/InspectorSectionTitle.qml
[SpeedDialog]: ../qml/Inspector/SpeedDurationDialog.qml
[AssetDrop]: ../qml/assets/AssetDropOverlay.qml
[AssetItem]: ../qml/assets/AssetItem.qml
[DockTabs]: ../qml/dock/DockTabStrip.qml
[ShellMenus]: ../src/app/Menus/ShellMenus.cpp
[EditorButton]: ../../ui_primitives/qml/EditorButton.qml
[Tooltip]: ../../ui_primitives/qml/Tooltip.qml
[Popover]: ../../ui_primitives/qml/Popover.qml
[Dialog]: ../../ui_primitives/qml/Dialog.qml
[native-design]: ../../ui_primitives/DESIGN.md
[qt-tooltip]: https://doc.qt.io/qt-6/qml-qtquick-controls-tooltip.html
