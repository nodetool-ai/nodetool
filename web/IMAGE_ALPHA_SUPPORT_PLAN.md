# Image Alpha Support Plan

Goal: support transparent images consistently across the web app so alpha is preserved and clearly previewed in node outputs, asset browsing, property inputs, compare views, and editing flows.

## Success Criteria

- [ ] Transparent PNG/WebP/SVG images are visually identifiable everywhere they are previewed.
- [ ] Shared image preview components use a consistent transparency-aware surface instead of arbitrary solid backgrounds.
- [ ] Property editors for single and multiple images preview alpha correctly.
- [ ] Asset browser thumbnails and fullscreen viewer preserve and communicate transparency.
- [ ] Compare flows show transparent regions correctly for both images.
- [ ] Image editing keeps alpha intact on load, preview, and save.
- [ ] Upload and frontend preview pipelines do not accidentally flatten or mislabel alpha-capable assets.

## Phase 1: Shared Visual Foundation

- [x] Decide on the common transparency treatment:
  - Decision: use a subtle checkerboard-style alpha background for app-owned image preview surfaces.
  - Decision: do not add a user-facing toggle in the first pass.
  - Decision: keep the treatment visually quiet so opaque images still look normal.
- [x] Add a shared reusable wrapper or styling primitive for image surfaces.
  - Added `web/src/styles/AlphaSurface.ts` with `alphaSurfaceBg` (plain object) and `alphaSurfaceCss` (Emotion block).
- [x] Keep the visual treatment subtle enough to work in dark UI while still making transparency obvious.
  - Uses two low-contrast dark tones (`#1e1e1e` / `#2a2a2a`) with 12px tiles.
- [x] Verify the shared treatment works for both `object-fit: contain` and `object-fit: cover` layouts.
  - Verified: the tiled background renders independently of image sizing.

## Phase 2: Core Output And Preview Surfaces

- [ ] Update `web/src/components/node/ImageView.tsx` to render on the shared transparency-aware surface.
- [ ] Update `web/src/components/node/PreviewNode/PreviewNode.tsx` to ensure node previews do not visually flatten transparent content.
- [ ] Update `web/src/components/node/ResultOverlay.tsx` to use the same behavior as node previews.
- [ ] Verify `web/src/components/node/OutputRenderer.tsx` routes image outputs through alpha-aware renderers consistently.
- [ ] Verify `web/src/components/node/output/ChunkRenderer.tsx` image chunks inherit the same rendering behavior.
- [ ] Update `web/src/components/node/ThreadMessageList.tsx` so image messages do not bypass the shared image preview path.
- [ ] Verify `web/src/components/chat/message/MessageContentRenderer.tsx` still renders images through the shared image preview path.

## Phase 3: Property Input Previews

- [ ] Update `web/src/components/properties/ImageProperty.tsx` single-image preview behavior through the shared alpha-aware surface.
- [ ] Update `web/src/components/properties/PropertyDropzone.tsx` to show transparent images clearly during property editing.
- [ ] Update `web/src/components/properties/ImageListProperty.tsx` multi-image tiles so transparency is visible and not misleading.
- [ ] Update `ImageListProperty` thumbnails to prefer `contain` in the first pass so transparent margins and edges remain visible.
- [ ] Confirm drag-drop, picker, and replace flows still behave correctly after preview changes.

## Phase 4: Asset Browser And Fullscreen Viewer

- [ ] Update `web/src/components/assets/AssetItem.tsx` thumbnail rendering to support transparent assets clearly.
- [ ] Confirm `thumb_url` and `get_url` image paths both render correctly in asset grid items.
- [ ] Update `web/src/components/assets/AssetViewer.tsx` fullscreen layout so alpha remains visible against the viewer background.
- [ ] Update `web/src/components/asset_viewer/ImageViewer.tsx` zoom/pan viewer to use an alpha-aware background.
- [ ] Check thumbnail strips and navigation previews inside `AssetViewer` for consistency.

## Phase 5: Grid And Comparison Views

- [ ] Update `web/src/components/node/PreviewImageGrid.tsx` tile backgrounds for transparent images.
- [ ] Keep dense gallery-style grids on `cover` in the first pass to avoid layout churn, but render them on the shared alpha-aware surface.
- [ ] Update `web/src/components/widgets/ImageComparer.tsx` so both compared layers are shown over a transparency-aware surface.
- [ ] Verify `web/src/components/node/output/ImageComparisonRenderer.tsx` inherits the updated comparer behavior.
- [ ] Verify `web/src/components/node/CompareImagesNode/CompareImagesNode.tsx` matches the updated compare behavior on-canvas.

## Phase 6: Upload, Clipboard, And Thumbnail Pipeline

- [ ] Review `web/src/utils/imageUploadValidation.ts` to ensure alpha-capable formats are preserved and correctly typed.
- [ ] Review `web/src/stores/AssetStore.ts` upload flow to confirm no MIME normalization accidentally strips alpha support.
- [ ] Review `web/src/utils/clipboardUtils.ts` to confirm copy-to-clipboard preserves alpha where Electron supports it.
- [ ] Review `web/src/utils/getAssetThumbUrl.ts` and all `thumb_url` consumers to confirm the frontend handles both flat JPEG thumbs and original alpha-preserving image URLs correctly.

### Verified Backend Behavior

- [x] For current planning, treat the TypeScript backend as the source of truth and ignore `nodetool-core`.

- [x] TypeScript backend behavior:
  - `nodetool/packages/websocket/src/http-api.ts`
  - `handleAssetThumbnail()` serves `{id}_thumb.jpg` as `image/jpeg` if present
  - if no thumbnail exists and the asset is an image, it falls back to the original file with `Content-Type: asset.content_type`
  - this fallback can preserve alpha for original PNG/WebP images

- [x] Conclusion:
  - frontend preview work is still needed everywhere
  - flat JPEG thumbnails are acceptable for now
  - the first pass should make full-size previews, property previews, compare views, and editor surfaces alpha-aware without requiring backend thumbnail changes

## Phase 7: Image Editor

- [ ] Update `web/src/components/node/image_editor/ImageEditorCanvas.tsx` so the editor canvas previews transparency clearly.
- [ ] Update `web/src/components/node/image_editor/canvasUtils.ts` to avoid misleading opaque background assumptions in image display helpers.
- [ ] Verify erase, draw, shape, fill, crop, and text operations behave correctly with transparent areas.
- [ ] Verify canvas export helpers still default to alpha-preserving formats where appropriate.
- [ ] Confirm saving edited transparent images preserves alpha end-to-end.

## Phase 8: Secondary Surfaces

- [ ] Review markdown-rendered images for alpha visibility in chat or documentation-style views.
- [ ] Review workflow thumbnails and cards for transparent image readability.
- [ ] Review small asset info panels and node info previews for consistency.
- [ ] Review composer or attachment previews for transparent images if those surfaces are user-facing.

## Testing Checklist

- [ ] Test with transparent PNG containing soft shadows.
- [ ] Test with transparent PNG containing large empty margins.
- [ ] Test with WebP that includes alpha.
- [ ] Test with SVG that uses transparency.
- [ ] Test a fully opaque JPEG to ensure the new background treatment does not look broken.
- [ ] Test image outputs inside node preview, result overlay, and asset viewer.
- [ ] Test single-image property previews.
- [ ] Test multi-image property previews.
- [ ] Test asset grid thumbnails and fullscreen viewer.
- [ ] Test compare mode with two transparent images.
- [ ] Test image editor load, erase, and save with transparency.
- [ ] Test clipboard copy for transparent images in Electron.

## Decisions

- [x] Transparency treatment:
      Use a subtle checkerboard-style alpha background on app-owned image preview surfaces. This gives a clear signal without making the UI feel noisy.

- [x] Scope for first pass:
      Apply the alpha-aware treatment to real image preview surfaces in the app, not every incidental or decorative image. No user-facing toggle in the first run.

- [x] Layout behavior:
      Keep existing fit behavior where density matters, and only change it where transparency readability is more important:
  - single-image previews, viewer, compare, and editor: prefer `contain`
  - dense asset/grid thumbnails: keep `cover` for now
  - property image lists: switch to `contain` so transparent edges are not hidden

- [x] Reuse strategy:
      Do not build a large global abstraction. Use one small shared alpha-surface primitive or styling helper, then keep per-surface layout behavior local and understandable.

- [x] Backend dependency:
      Assume the TypeScript backend path. Flat JPEG thumbnails are acceptable in the first pass. Do not scope work around `nodetool-core`, and do not require backend thumbnail changes for the initial rollout.
