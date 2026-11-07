# Image comparison parity proposal

This proposal covers the image-comparison renderer within F31. The
[inventory](parity-inventory.md) remains the acceptance record. The gaps in the
table below are closed by `ImageComparisonOutput.qml` and covered by
`tests/ui/ImageComparisonTest.cpp`, except hardware touch and pen input, which
need a physical device. Vertical mode accepts drags in both axes, because a
Qt drag handler that claims only the y axis ignores movement that is mostly
horizontal and the native host scrolls vertically only.

## Source contract

The F31 entry point is
[ImageComparisonRenderer.tsx](../../../web/src/components/node/output/ImageComparisonRenderer.tsx),
which resolves the two image values and passes URLs, labels, `showLabels=true`,
`showMetadata=true` and `initialMode="horizontal"` to
[ImageComparer.tsx](../../../web/src/components/widgets/ImageComparer.tsx).
The renderer does not pass optional byte-size metadata or provide download,
viewer, zoom, pan, swap-image, difference, blend or side-by-side controls.

| Behavior | Actual web | Current native gap |
| --- | --- | --- |
| Modes | Horizontal means A revealed from the left over full B, with a vertical divider. Vertical means A revealed from the top, with a horizontal divider. Initial position is 50 percent. Toggle resets it to 50 percent | Both wipe axes and toggle reset exist |
| Mouse | Every pointer move updates the wipe, including hover without a pressed button. Position clamps to the viewport. Mouse leave hides the divider and recenters | Native updates only during press/drag, always paints the divider and does not recenter on leave |
| Touch and pen | Pointer movement updates position. Leaving hides the divider but retains position for non-mouse pointers. Touch claims the comparison axis and allows perpendicular page scrolling (`pan-y` for horizontal, `pan-x` for vertical) | MouseArea does not explicitly preserve this device/scroll contract |
| Mode keyboard | The mode button has normal button focus/activation. The comparer implements no divider arrows, Home/End, slider keyboard handling or image-viewer shortcuts | Native advertises an Accessible.Slider without implementing slider keyboard/value semantics |
| Fit | Both layers occupy the same full viewport. Each image is centered, constrained to viewport width/height, and keeps its aspect ratio. Small images retain intrinsic size because CSS uses max dimensions without an explicit image size. Only A's complete layer is clipped | MediaPreview PreserveAspectFit can upscale a small image. Labels occupy a separate header instead of the viewport |
| Labels | Defaults are A and B. Horizontal: top-left A and top-right B. Vertical: top-left A and bottom-left B. Labels use a dark scrim and white text | Defaults are Image A/Image B, in a header row |
| Metadata | Natural width/height are loaded independently and shown as `width × height`. Horizontal metadata is bottom-left/bottom-right, with room for the toggle. Vertical metadata sits below A and above B. The reusable widget can also format supplied byte sizes, but F31 supplies none | Native comparison has no dimensions |
| Toggle | Icon button in the viewport's lower-right corner, named Switch to vertical or Switch to horizontal | Native has a text toggle in the header |
| Background | The fixed dark alpha checker from AlphaSurface.ts remains behind both images in both themes | Native comparison has no dedicated alpha checker |
| Missing data | Renderer shows Missing image data for comparison if either image URL cannot be formed | Native builds two preview subtrees even for incomplete input |

The web pointer contract has direct
[tests](../../../web/src/components/widgets/__tests__/ImageComparer.test.tsx)
for touch movement, retention after touch lift, mouse-leave reset and axis toggle.
No browser or web test execution is proposed for this native slice.

## Proposed decisions

1. D1: Keep exactly the two wipe modes. Replace the comparison header with
   viewport overlays and a mode icon button. Preserve the existing native root,
   mode-toggle and pointer-surface object names so the real output-host fixture
   remains usable. Toggle resets position once and has its existing button
   keyboard route. Remove the misleading slider accessibility role. Do not
   invent divider shortcuts absent from the web in this parity change.
2. D2: Track hover separately from dragging and retain pointer-device identity.
   Mouse hover updates the divider without a button. Mouse leave recenters.
   Touch/pen release or leave retains the last position. Qt pointer handlers
   claim only the active comparison axis, letting the surrounding Flickable
   consume perpendicular touch scrolling. Test both axes through the actual
   scroll host, including gesture cancellation and release outside the viewport.
3. D3: Resolve both sides through the existing authenticated MediaResolver and
   render dedicated comparison image layers. Do not send raw asset identifiers
   to Image.source or enable MediaPreview's independent viewer hit targets.
   A and B use the same viewport coordinates, independently centered fitted
   image rectangles and no upscaling. Resize recomputes image fit without changing
   the percentage. A's clipping rectangle never resizes or refits its image.
4. D4: Use existing native primitives, feature-owned named measurements and
   media scrim/checker roles. The viewport minimum follows the web's 200 logical
   pixels. Existing swapHoriz icon data can be rotated for the vertical symbol,
   without a shared icon or primitive change. Labels and dimensions reserve the
   toggle area, elide within their side's available space and retain complete
   accessible descriptions. Narrow output panes keep the action visible.
5. D5: Derive dimensions from each decoded image's natural size, independently.
   Do not make asset-metadata requests or invent byte sizes. Keep labeled A/B
   loading and decode/resolver failure states with Retry through the existing
   resolver. Missing input has the web's explicit missing-data message. These
   states must never masquerade as a successful comparison of two images.
6. D6: Give each side an instance/generation-specific request key. On source
   replacement, scope teardown, resolver clear or destruction, clear Image.source,
   cancel requests and release URL leases before reuse. Ignore late signals from
   previous keys. A failed/replaced side cannot erase another comparison or an
   unrelated gallery's lease. Reset interaction state when the pair changes,
   while unrelated output arrivals retain an existing comparison's position.
7. D7: Keep download, metadata inspection beyond dimensions, standalone viewer,
   zoom/pan and file dialogs in their existing asset/gallery surfaces. The web
   comparison renderer has none of these actions. This proposal neither adds
   them to comparison nor disables those existing surfaces.

## Proposed ownership and interfaces

| File | Proposed responsibility |
| --- | --- |
| [ImageComparisonOutput.qml](../qml/ImageComparisonOutput.qml) | Two local resolver-backed image layers, pointer/device state, exact wipe fit, overlays, dimensions and mode button |
| `tests/ui/ImageComparisonTest.cpp` | New focused native image, pointer, touch, keyboard, scope, error and layout fixture |
| [RichOutputHostTest.cpp](../tests/ui/RichOutputHostTest.cpp) | Extend the actual EditorWindow comparison case with metadata and pointer expectations while retaining document/undo assertions |
| This document | Reviewed behavior and verification boundaries |

Parent owns future CMake test/resource registration and shared parity docs.
No MediaPreview, MediaResolver, shared primitive, run-output model or document
API change is proposed. The component can use local image-layer components in
its existing QML file, avoiding a new production resource. Panel/card hosts
already destroy rich delegates when their run/account scope disappears, and
MediaResolver.cleared provides a second immediate reset boundary. Tests must
verify that lifecycle rather than assume a source string is a sufficient scope.
If a concrete retained-delegate case needs an explicit scopeKey from RichOutput,
request that narrow host interface before editing it.

## Native fixtures and acceptance

1. A1: Opaque, asymmetric red/blue fixture images prove the A/B reveal with pixel
   samples at 0, 25, 50, 75 and 100 percent on both axes. Use images large enough
   to fill the viewport and labels that distinguish each side. Prove current
   hover/leave/metadata behavior fails before the implementation is changed.
2. A2: A landscape/portrait pair proves each image is fitted independently in
   the same viewport. A small image proves no upscaling, and a transparent image
   proves the checker remains visible. Resize preserves percentage and geometry.
3. A3: Real mouse movement without press updates the wipe. Leaving recenters
   and hides the line. Reentry shows the current divider. Both mode changes
   reset to half. Pointer motion over overlays does not accidentally activate
   another image surface.
4. A4: Real native touch events move each axis, retain the value after lift and
   leave, and scroll the surrounding Flickable on the perpendicular axis. Pen
   input retains position on leave. A canceled touch gesture cannot leave a
   stuck pointer grab. Platform hardware touch remains a separate acceptance.
5. A5: Tab reaches the mode button. Enter/Space toggle it and retain focus.
   Accessible names state the target mode and describe A/B and dimensions.
   Divider arrow/Home/End shortcuts are not claimed because the web has none.
6. A6: Separate native resolver fixtures cover inline PNG bytes/data URI,
   authenticated asset/package/API references, delayed side replacement, one-side
   failure/retry, missing data and corrupted image decoding. Clear/account/run
   changes and destruction cannot display a late image or retain a URL lease.
   Repeated comparison instances resolving the same asset stay independent.
7. A7: The real EditorWindow output panel and rich card use the shared comparison
   renderer. Unrelated output arrivals retain its local interaction state.
   Comparison interactions leave the workflow document and undo history intact.
   Use native-created PNGs and fake-server replies, without external network,
   ffmpeg or browser tooling.
8. A8: Capture whole editor plus focused comparison images in dark/light at
   1280×720 and 960×1000, and with a narrow inspector/output viewport. Inspect
   labels, dimension text, toggle bounds, fitted images and loading/error/retry
   states. Fail tests on relevant QML TypeError, binding-loop and rearrange
   warnings while allowing offscreen platform capability warnings.

After review, use the existing parent-scheduled native build. The proposed target
is `node_editor_image_comparison`, with the existing `node_editor_rich_output_host`
and media-resolver checks for shared lifecycle behavior. No new build directory,
npm/web suite, commit or push is part of this proposal. Native event injection
and captures do not prove physical-device, platform-compositor or IME behavior,
and this slice cannot establish complete F31 parity.
