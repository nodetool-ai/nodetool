# Native timeline interaction polish

Question: which small interactions are missing or incomplete in the native C++/Qt editor, and what should be implemented?

Source audit: `feat/native-timeline` at `3df7fc227bba42a325f15b2668d62d87a20ba0b5`. Compared production QML/controllers with official Resolve guides and open and closed Filmcraft/EffectCraft issues. This is source research plus the user's Windows observations, not a new interactive reproduction run.

**Code** means a gap or incomplete behavior in the inspected implementation. **Reported** means the user observed it, but its runtime cause still needs reproduction. **Check** means existing behavior needs validation, not a new feature. Implementation details below are NodeTool recommendations, not claims that another editor implements them identically.

## First: pointer feedback, tooltips and safe input

| ID | Gap and evidence | Implementation and acceptance |
| --- | --- | --- |
| F1 | **Reported: resize cursor disappears or loses meaning during scaling.** [Gizmo] already sets hover cursors. Their absence is a regression to reproduce, not an absent cursor implementation. | Make the active gesture own its cursor until release/cancel. Hover leave must not clear it during a grab. Verify every handle, leaving the preview, and returning without a stuck cursor. [FC#2263 closed, fix #2313][fc2263], [EC#2584 closed, fix #2624][ec2584]. |
| F2 | **Code: resize cursors ignore rotation.** [Gizmo] maps fixed handle names to fixed cursor shapes. | Derive direction from the transformed handle axis in screen coordinates, including rotated/flipped clips. Use the same hit result for hover, cursor and drag. [EC#393 closed, fix #436][ec393]. |
| F3 | **Code + reported: trim-edge hover is hard to see.** [ClipBody] paints both edges with `actionPressed` when the whole clip is hovered/selected. | Highlight the actual hovered edge with a contrasting stroke and small grip. Distinguish hover, active trim and locked states. Match the visible affordance to the hit area, without changing clip geometry. Resolve documents contextual trim pointers [E pp.86–90][resolve-e], not this specific highlight design. |
| F4 | **Code: small targets become unusable.** [Clip] removes trim areas below 28 logical pixels. [Gizmo] uses an 8-pixel handle-sized hit box. | Separate painted size from hit tolerance. Resolve competing start/end/body targets by nearest edge and active tool. Scale hit tolerance with UI settings. A short clip must remain trimmable without accidentally moving it. [FC#374, open umbrella][fc374]. |
| F5 | **Code + reported: tooltip repeats its title.** [InspectorHeader] assigns the same label to `accessibleName` and `description`; [SectionTitle] does likewise. [EditorButton] concatenates them. | Remove redundant descriptions and omit a description equal to the title. Show title, current shortcut, and genuinely additional help once. Test both inspector action buttons and section actions. |
| F6 | **Reported: tooltip appears in the wrong place.** [Tooltip] maps a trigger to the overlay, but its binding does not explicitly observe ancestor scrolling/reparenting. This is a cause to test. | Recompute the anchor on show and relevant geometry changes, or dismiss during movement. Clamp/flip inside the correct window using logical coordinates. Test dock movement, nested scrolling and mixed-DPI monitors. [Qt tooltip positioning][qt-tooltip], [EC#1071, open hypothesis][ec1071]. |
| F7 | **Code: tooltip ownership and dismissal are inconsistent.** Custom [EditorButton] tips coexist with attached `ToolTip` call sites. Focus alone can keep a custom tip visible. | Use one tooltip policy across controls. Hide stale tips on press, drag, scrolling, menu open and trigger disappearance. Keep keyboard help available without leaving multiple tips on screen. Attached Qt tips share an instance; custom instances do not. [Qt][qt-tooltip]. |
| F8 | **Code: editing tools lack matching pointer previews.** [Clip] uses move/resize cursors regardless of razor, ripple, roll, slip or stretch mode. | Drive cursor and preview from active tool plus hit region. Razor hover should show the exact cut position and affected linked clips. Show unavailable feedback for locked/invalid targets. [FC#1596, open][fc1596], [E pp.86,90,97][resolve-e]. |
| F9 | **Code: transform cancellation differs from timeline cancellation.** [Gizmo] calls `end()` on mouse ungrab and has no Escape branch in `handleKey`; [Gestures] cancels on ungrab. | Define one transaction contract: release commits once, Escape/unexpected grab loss restores the press state. Clear cursor/overlays and prevent autosaving canceled previews. Test the mounted viewer and window-level key routing. [EC#2584][ec2584], [EC#2152 closed, fix #2655][ec2152]. |
| F10 | **Code: native Edit-menu dispatch overrides the editing context.** [ShellMenus] forces focus to the editor before synthesizing a shortcut. | Route Cut/Copy/Paste/Select All/Undo/Delete to the actual focused text editor or panel. Menu and keyboard invocation must target the same selection. Test while typing an inspector value and renaming media. [EC#2227 closed, fix #2263][ec2227], [FC#404, open][fc404]. |

## Next: precise timeline editing

| ID | Gap and evidence | Implementation and acceptance |
| --- | --- | --- |
| F11 | **Code: no live trim/move measurement near the gesture.** [Gestures] exposes position and a snap line, but the inspected clip UI has no edit readout. | Show signed frame/time delta and resulting duration while trimming. Include position for moves, percentage for stretch, and fade duration for fades. Keep the readout clear of the pointer and within the viewport. [E pp.72,84,87][resolve-e]. |
| F12 | **Code: source limits are enforced without clear visual explanation.** [Gestures] clamps trim operations. | Show available source extent while trimming and a distinct stop indicator at the media boundary. Identify whether the limit is source length, minimum duration, lock or neighboring clip. Do not imply more footage is available. [E pp.85,91][resolve-e], [N20 p.45][resolve-n20]. |
| F13 | **Code: edge autoscroll covers horizontal clip moves only.** [Gestures] `updatePolish()` returns for other gesture kinds. | Extend continuous edge scrolling to trim, slip/slide, marquee and track reorder where applicable, including vertical travel. Reuse viewport coordinates and recompute the drag after scrolling. Stop on release/cancel. [EC#999 closed, fix #2616][ec999]. |
| F14 | **Code: library drops do not preview their actual placement.** [AssetDrop] highlights the viewport and says “Drop onto this track”; `dropAllowed` is not reflected in that feedback. | Draw a duration-sized ghost at the proposed track/time. Show insert/overwrite/overlap consequences and linked destinations. Invalid targets need a reason and forbidden feedback. Use the same placement result for preview and commit. [FC#519 closed, partial fix #517][fc519]. |
| F15 | **Code: snapping feedback and live modifiers are incomplete.** [Tracks] draws a line without target identity. [Gestures] captures `alt` at press time. | Label the winning target, such as playhead, marker or clip edge. Update bypass state during a held drag without canceling or jumping. Preserve the original timeline time on near-vertical track moves. Keep the existing snap engine and Alt convention. [E p.85][resolve-e], [FC#1893, open][fc1893]. |
| F16 | **Code: inspector keyframes are edited one at a time.** [KeyframeLane] stores one `fromMs`/`toMs` drag and no selected-key set. | Add additive selection and marquee, then move selected keys by one frame-snapped delta while preserving offsets. Delete and nudge the set in one undo step. Keep selection styling separate from the playhead indicator. [FC#967 closed, fix #1159][fc967]. |
| F17 | **Code: keyframe glyphs do not communicate easing.** [KeyframeLane] offers easing choices but always draws the same diamond. | Derive glyph/tooltip from authoritative interpolation state, including hold. Update after menu changes, presets, undo and redo. Hover should identify property, time and value. [EC#2465, open][ec2465], [N20 p.17][resolve-n20]. |
| F18 | **Code: transport timecode is read-only.** [Preview] renders `transportTimecode` as `Ui.Text`. | Click to type a frame/timecode and drag to scrub in frame increments. Enter commits, Escape restores, invalid text never seeks. Formatting followed by unchanged Enter must preserve the exact frame at fractional rates. [FC#554 closed, fix #576][fc554]. |
| F19 | **Code: timeline zoom lacks selection framing and previous-view recall.** [ViewState] has pointer/playhead anchoring and fit, but no selection/previous-view command. | Add Zoom to Selection and a Fit/Previous toggle storing scale and scroll together. Keep existing pointer-anchored wheel and playhead-anchored button behavior. [E pp.35–36][resolve-e] documents fit/previous behavior; selection framing is our extension. |
| F20 | **Code: number-drag modifiers can change the whole accumulated delta.** [PillInput] multiplies displacement from the original press by the current modifier factor. | Re-anchor when the precision modifier changes so the value stays continuous. Preserve existing Shift-coarse/Alt-fine behavior, typing and cancellation. Show unit and precision hints. Verify a mid-drag modifier change causes no jump. [EC#2769, open][ec2769]. |

## Then: viewer and workspace details

| ID | Gap and evidence | Implementation and acceptance |
| --- | --- | --- |
| F21 | **Code: viewer navigation is limited to fitting the image.** [Preview] sizes the frame to its container; there is no viewer zoom/pan control or transform-overlay toggle. | Add Fit/100%/percentage zoom, temporary pan, and Show Controls. Keep view navigation separate from document transforms and undo. Preserve handle hit testing after zoom/pan. [B pp.99–101][resolve-b]. |
| F22 | **Code: viewer transforms lack alignment feedback.** [GizmoMath] snaps rotation and anchor positions, but body movement has no canvas-edge/center guide snap. | Offer optional center/edge guides, a visible snapped state, and temporary bypass. Show position/scale/angle during dragging. Keep tolerances in screen space and distinguish guides from selection bounds. [N21 p.15][resolve-n21]. |
| F23 | **Code: the track-name column has a fixed width.** [Tracks] binds a read-only `headerWidth` to a metric. Track-height resizing already exists. | Add a discoverable vertical splitter with hover line and horizontal resize cursor. Persist width, enforce usable minima, and provide reset. Keep ruler, lanes and drop coordinates aligned. [EC#2008, open][ec2008]. |
| F24 | **Code: truncated names lack consistent reveal.** [DockTabs], [TrackHeader] and [AssetItem] elide labels without full-name tooltips. Source-viewer names already have one. | Show full text on hover/focus only when truncated. Include path/location where duplicate asset names need disambiguation. Retain the existing dock overflow menu. [EC#2651, open][ec2651]. |
| F25 | **Code: Speed/Duration has no dialog-wide default action.** [SpeedDialog] wires Apply to a click; its numeric field consumes Enter to finish editing. | Commit/validate the active field, then apply once on Enter. Escape cancels the dialog draft. Keep validation visible and restore focus to the invoking control. Test Enter from each field, not only from the Apply button. [FC#2659, open][fc2659]. |
| F26 | **Code: disabled actions often provide no reason.** [InspectorHeader] disables actions without passing `disabledReason`; [Preview] disables frame stepping during playback without explaining it. | Wire short contextual reasons through the existing primitive: stop playback, select a clip, unlock track, or select one item. Explain disabled commands without making them actionable. Verify hover and keyboard accessibility. [Native design][native-design]. |

## Reproduce before adding more work

These are regression checks inspired by the issue history. They are **not established NodeTool defects**. Add an implementation task only when the mounted editor fails the check.

| ID | Check and acceptance | Evidence / starting point |
| --- | --- | --- |
| F27 | Pointer capture survives leaving a panel/window. Release outside commits once. Escape and lost capture restore state. Test clip/fade/transition/keyframe/gizmo drags separately. | [EC#2584][ec2584]. [Gestures], [Gizmo], [KeyframeLane]. |
| F28 | Text fields retain caret keys, clipboard and IME input. Tab/Shift+Tab follows visual order. Completing rename or explicitly opening Source restores focus to the intended panel. | [FC#3372 closed, fix #3481][fc3372], [FC#3669 closed, fix #3749][fc3669], [EC#361 closed, fix #436][ec361]. [SourceViewer], [PillInput]. |
| F29 | Popups near every window edge remain reachable. Opening press cannot immediately dismiss them. Menu arrows/Enter/Escape cannot trigger underlying playback or edits. Test narrow windows and enlarged UI/text. | [EC#269 closed, fix #277][ec269], [EC#1476 closed, fix #1496][ec1476], [EC#279 closed, fixes #391/#277][ec279]. [Popover], [Dialog]. |
| F30 | Right-click preserves an existing multi-selection. The menu targets the same set as shortcuts. One drag produces one undo entry, while separate toggles/dropdown choices remain separately undoable. | [EC#878 closed, fix #893][ec878], [EC#2152][ec2152]. [Clip], [Gestures], inspector controllers. |
| F31 | Scrolled-out rows and clipped gizmos never intercept visible controls. At the playhead, trim/fade/transition handles retain their intended priority. Verify short clips, overlapping handles and UI scaling. | [FC#2978, open][fc2978]. [Tracks], [Clip], [Gizmo], `Playhead.qml` passthrough rules. |
| F32 | Shortcuts in tooltips/help match the selected preset and platform. Loop, snap, link and lock states remain visually distinct from hover and expose checked state to assistive technology. | [FC#2511 closed, fix #2513][fc2511], [FC#276 closed, fix #270][fc276], [FC#2286, open][fc2286]. [EditorButton], `ToolToggle.qml`, [Preview]. |
| F33 | Playback does not fight scrubbing. Manual navigation and follow-playhead have a clear ownership policy. Source and program transport commands act on the focused viewer at fractional frame rates. | [FC#2521, open and playback-specific][fc2521]. [ViewState], [SourceViewer], `Playhead.qml`, playback clock. |
| F34 | Multi-selection trim has explicit semantics. If only one edge is editable, highlight that edge rather than suggesting the whole selection will trim. If group trim is added, clamp one common delta to every source limit. | [FC#3044, open][fc3044], [EC#965 closed, fix #950][ec965]. [Gestures] currently trims a primary clip plus linked behavior. |

## Implementation boundaries

Use the existing [native primitives][native-design] and controller transactions. Keep hit testing, cursor choice and the advertised action consistent. Add real pointer/key tests through mounted QML, not only tests that call edit commands directly.

The first acceptance pass should cover light/dark themes, 100%/150%/200% Windows scaling, a small window, long labels, locked clips, narrow clips, and moving between monitors. These are proposed test conditions, not claimed passing results.

Do not reimplement already-present features: basic snapping and bypass, keyboard presets, move/trim undo, track reorder/height resize, source marks, frame stepping, keyframe retiming, dock overflow, or pointer/playhead-anchored timeline zoom. The older [gap backlog](gaps-backlog.md) is a lead for investigation, not proof a feature remains absent.

## Source notes

Resolve references use **printed page numbers**: [E: Editor's Guide 20][resolve-e], [B: Beginner's Guide 20][resolve-b], [N20: New Features 20][resolve-n20], [N21: New Features 20.1][resolve-n21]. Hover-edge styling, tooltip deduplication and cancellation policy are our recommendations, not requirements attributed to Resolve.

Issue states are a research snapshot. A “closed, fix” label above is backed by a linked merged PR or maintainer fix confirmation. Open proposals are inspiration, not validated implementations. FC#519 explicitly excludes accurate-duration ghosts from its completed fix. EC#1071 is a windowing-stack hypothesis and supplies a test scenario only. Neither issue search established the user's exact duplicate/misplaced-tooltip symptoms in those applications.

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
[resolve-e]: https://documents.blackmagicdesign.com/UserManuals/DaVinci-Resolve-20-Editors-Guide.pdf
[resolve-b]: https://documents.blackmagicdesign.com/UserManuals/DaVinci-Resolve-20-Beginners-Guide.pdf
[resolve-n20]: https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_20_New_Features_Guide.pdf
[resolve-n21]: https://documents.blackmagicdesign.com/SupportNotes/DaVinci_Resolve_20.1_New_Features_Guide.pdf
[fc2263]: https://github.com/storytold/filmcraft/issues/2263
[fc374]: https://github.com/storytold/filmcraft/issues/374
[fc1596]: https://github.com/storytold/filmcraft/issues/1596
[fc404]: https://github.com/storytold/filmcraft/issues/404
[fc519]: https://github.com/storytold/filmcraft/issues/519
[fc1893]: https://github.com/storytold/filmcraft/issues/1893
[fc967]: https://github.com/storytold/filmcraft/issues/967
[fc554]: https://github.com/storytold/filmcraft/issues/554
[fc2659]: https://github.com/storytold/filmcraft/issues/2659
[fc3372]: https://github.com/storytold/filmcraft/issues/3372
[fc3669]: https://github.com/storytold/filmcraft/issues/3669
[fc2978]: https://github.com/storytold/filmcraft/issues/2978
[fc2511]: https://github.com/storytold/filmcraft/issues/2511
[fc276]: https://github.com/storytold/filmcraft/issues/276
[fc2286]: https://github.com/storytold/filmcraft/issues/2286
[fc2521]: https://github.com/storytold/filmcraft/issues/2521
[fc3044]: https://github.com/storytold/filmcraft/issues/3044
[ec2584]: https://github.com/storytold/effectcraft/issues/2584
[ec393]: https://github.com/storytold/effectcraft/issues/393
[ec1071]: https://github.com/storytold/effectcraft/issues/1071
[ec2152]: https://github.com/storytold/effectcraft/issues/2152
[ec2227]: https://github.com/storytold/effectcraft/issues/2227
[ec999]: https://github.com/storytold/effectcraft/issues/999
[ec2465]: https://github.com/storytold/effectcraft/issues/2465
[ec2769]: https://github.com/storytold/effectcraft/issues/2769
[ec2008]: https://github.com/storytold/effectcraft/issues/2008
[ec2651]: https://github.com/storytold/effectcraft/issues/2651
[ec361]: https://github.com/storytold/effectcraft/issues/361
[ec269]: https://github.com/storytold/effectcraft/issues/269
[ec1476]: https://github.com/storytold/effectcraft/issues/1476
[ec279]: https://github.com/storytold/effectcraft/issues/279
[ec878]: https://github.com/storytold/effectcraft/issues/878
[ec965]: https://github.com/storytold/effectcraft/issues/965
