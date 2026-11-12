# Output image viewer parity

This contract closes F29/F30 for native output images. The reference is
[`ImageView`](../../../web/src/components/node/ImageView.tsx),
[`PreviewImageGrid`](../../../web/src/components/node/PreviewImageGrid.tsx),
[`AssetViewer`](../../../web/src/components/assets/AssetViewer.tsx), and
[`ImageViewer`](../../../web/src/components/asset_viewer/ImageViewer.tsx).

## Interaction contract

- A1. Double-click or the Open action opens an image in a modal viewer. Grid
  tiles also support Enter and Space. Raster canvas images expose the same viewer
  through an explicit node action, preserving global canvas Space/catalog keys.
  This follows ImageView's toolbar button rather than adding keys to its image.
  Single click focuses a tile. Non-image items keep inline activation. The output
  panel, single-image output, and canvas gallery use the same viewer.
- A2. Viewer navigation follows image occurrences in source order, including
  repeated locators. Each occurrence retains its item key. Navigation has bounded
  previous/next controls and a position label. Activation selects the inline occurrence. Modal navigation does not change that
  inline selection.
- A3. Images initially fit the viewport. Wheel zoom and double-click zoom range
  from 1 to 16. Pointer drag pans. Right-click and Fit restore centered fit.
  Navigation resets the image transform. Dimensions remain visible.
- A4. Download reuses MediaPreview's save dialog and MediaResolver.saveResolved,
  preserving original bytes. Locators pass through the authenticated resolver.
  No locator is used as an Image source and no presentation URL is synthesized.
- A5. Escape, Close, and window close dismiss the modal, cancel/release its
  requests, close its save dialog, and return focus to its surviving trigger.
  The modal window blocks its owning editor and is transient to its native window.
  Other top-level windows retain shortcuts. A standalone Quick
  host uses its own window. Bypass and read-only state permit viewing authorized
  existing media without document mutation.
- A6. Account/session resolver clear, workflow/run/source scope changes, removal
  or replacement of the viewed occurrence, and host release close the viewer.
  Appended outputs and unrelated logs retain the viewed occurrence, transform,
  inline selection, and playing inline media. Late replies cannot repopulate a
  closed viewer. Every modal instance uses its own resolver key.

## Acceptance evidence

Native UI tests must first reproduce the missing modal, then cover pointer and
keyboard activation, duplicate occurrence navigation, zoom/pan/reset, modal
close/focus return, exact export, and scope cancellation. Host tests must retain
existing media playback and geometry checks. Inspect wide/narrow dark/light
captures. Tests use deterministic local media and no paid calls.

Asset library editing, metadata and transformation actions are outside this
output-image contract. The viewer adds Copy (decoded pixels) and, with two or
more images, Compare with another image, matching `AssetViewer`. The native viewer uses compact text
navigation instead of the web library filmstrip. SC2 embedded 3D and SC3
PDF/sandboxed HTML remain excluded.
