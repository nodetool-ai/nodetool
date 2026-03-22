# Image Alpha Support Plan

Goal: support transparent images consistently across the web app so alpha is preserved and clearly previewed in node outputs, asset browsing, property inputs, compare views, and editing flows.

## Success Criteria

- [ ] Transparent PNG/WebP/SVG images are visually identifiable everywhere they are previewed.
- [ ] Shared image preview components use a consistent transparency-aware surface instead of arbitrary solid backgrounds.
- [ ] Property editors for single and multiple images preview alpha correctly.
- [ ] Asset browser thumbnails and fullscreen viewer preserve and communicate transparency.
- [ ] Compare flows show transparent regions correctly for both images.
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
- [x] Keep layout changes minimal in the first pass:
  - no extra padding unless a specific surface truly needs it
  - do not change existing sizing or fit behavior unless a surface is too misleading without it
  - Verified across all phases: all changes are background-only; no sizing, padding, or fit behavior was changed.

## Phase 2: Core Output And Preview Surfaces

- [x] Update `web/src/components/node/ImageView.tsx` to render on the shared transparency-aware surface.
  - Applied `alphaSurfaceBg` to the container style with matching `borderRadius` and `overflow: hidden` so the checkerboard is visible through transparent regions and clipped at corners.
- [x] Update `web/src/components/node/PreviewNode/PreviewNode.tsx` to ensure node previews do not visually flatten transparent content.
  - Verified: PreviewNode renders via `OutputRenderer` → `ImageView`. The content area has `backgroundColor: "transparent"`, so the alpha surface on `ImageView` shows through with no changes needed.
- [x] Update `web/src/components/node/ResultOverlay.tsx` to use the same behavior as node previews.
  - Verified: ResultOverlay renders via `OutputRenderer` → `ImageView`. The overlay content area has no opaque background, so the alpha surface on `ImageView` shows through with no changes needed.
- [x] Verify `web/src/components/node/OutputRenderer.tsx` routes image outputs through alpha-aware renderers consistently.
  - Verified: `type === "image"` routes to `ImageView` for single images and data arrays. Array-of-image objects route to `AssetGrid` (phase 4). All paths use `ImageView` as the leaf renderer.
- [x] Verify `web/src/components/node/output/ChunkRenderer.tsx` image chunks inherit the same rendering behavior.
  - Verified: `content_type === "image"` renders `<ImageView source={chunk.content} />`, inheriting the alpha surface.
- [x] Update `web/src/components/node/ThreadMessageList.tsx` so image messages do not bypass the shared image preview path.
  - Replaced raw `<img>` tag with `<ImageView source={c.image?.uri} />` so image messages render through the shared alpha-aware surface.
- [x] Verify `web/src/components/chat/message/MessageContentRenderer.tsx` still renders images through the shared image preview path.
  - Verified: `type === "image_url"` already renders `<ImageView source={imageSource} />`, no changes needed.

## Phase 3: Property Input Previews

- [x] Update `web/src/components/properties/ImageProperty.tsx` single-image preview behavior through the shared alpha-aware surface.
  - Verified: `ImageProperty` delegates rendering to `PropertyDropzone`. No changes needed here.
- [x] Update `web/src/components/properties/PropertyDropzone.tsx` to show transparent images clearly during property editing.
  - Added `.image-preview-surface` class with `alphaSurfaceBg` and wrapped the image preview `<div>` with it. The checkerboard shows through transparent regions while the existing `object-fit: contain` layout is preserved.
- [x] Update `web/src/components/properties/ImageListProperty.tsx` multi-image tiles so transparency is visible and not misleading.
  - Replaced `backgroundColor: "rgba(0 0 0 / 0.2)"` on `.image-item` with `...alphaSurfaceBg`. Tiles now show the checkerboard through transparent regions.
- [x] Confirm drag-drop, picker, and replace flows still behave correctly after preview changes.
  - Verified: All 31 related tests pass. Changes are styling-only; no event handler or data flow modifications.

## Phase 4: Asset Browser And Fullscreen Viewer

- [x] Update `web/src/components/assets/AssetItem.tsx` thumbnail rendering to support transparent assets clearly.
  - Added `.asset.alpha-surface` CSS rule with `...alphaSurfaceBg`. Applied `alpha-surface` class to the `.asset` div only when `isImage` is true.
- [x] Confirm `thumb_url` and `get_url` image paths both render correctly in asset grid items.
  - Verified: The alpha surface sits behind the background-image, so JPEG thumbnails look normal and alpha-preserving fallback images show the checkerboard.
- [x] Update `web/src/components/assets/AssetViewer.tsx` fullscreen layout so alpha remains visible against the viewer background.
  - Verified: `AssetViewer` delegates image rendering to `ImageViewer` via `useAssetDisplay`. The alpha surface is now on `ImageViewer`'s container. No changes needed to `AssetViewer` itself.
- [x] Update `web/src/components/asset_viewer/ImageViewer.tsx` zoom/pan viewer to use an alpha-aware background.
  - Added `...alphaSurfaceBg` to the memoized `containerStyle`. The checkerboard now appears behind the image in the zoom/pan viewer.
- [x] Check thumbnail strips and navigation previews inside `AssetViewer` for consistency.
  - Verified: Navigation thumbnails use `AssetItem`, which now has the alpha surface for image assets.

## Phase 5: Grid And Comparison Views

- [x] Update `web/src/components/node/PreviewImageGrid.tsx` tile backgrounds for transparent images.
  - Replaced `background: theme.vars.palette.background.default` on `.tile` with `...alphaSurfaceBg`. Removed `backgroundColor` from `.img`.
- [x] Keep existing fit behavior in dense gallery-style grids in the first pass to avoid layout churn, but render them on the shared alpha-aware surface.
  - Verified: `object-fit: cover` on `.img` is preserved unchanged; only the background behind it changed.
- [x] Update `web/src/components/widgets/ImageComparer.tsx` so both compared layers are shown over a transparency-aware surface.
  - Replaced `backgroundColor: theme.vars.palette.background.default` with `...alphaSurfaceBg` on the root element.
- [x] Verify `web/src/components/node/output/ImageComparisonRenderer.tsx` inherits the updated comparer behavior.
  - Verified: Renders `<ImageComparer>` directly. The alpha surface change flows through automatically.
- [x] Verify `web/src/components/node/CompareImagesNode/CompareImagesNode.tsx` matches the updated compare behavior on-canvas.
  - Verified: Renders `<ImageComparer>` directly. Same inheritance. No changes needed.

## Phase 6: Upload, Clipboard, And Thumbnail Pipeline

- [x] Review `web/src/utils/imageUploadValidation.ts` to ensure alpha-capable formats are preserved and correctly typed.
  - Verified: `sniffImageMimeType` correctly detects PNG, JPEG, GIF, and WebP. `prepareUploadFile` preserves the sniffed MIME type faithfully. No alpha-stripping normalization.
- [x] Review `web/src/stores/AssetStore.ts` upload flow to confirm no MIME normalization accidentally strips alpha support.
  - Verified: Uses `content_type: preparedFile.finalMime` directly from the validation pipeline. No alpha-stripping.
- [x] Review `web/src/utils/clipboardUtils.ts` to confirm copy-to-clipboard preserves alpha where Electron supports it.
  - Verified: `copyImageToClipboard` fetches the image as a blob and sends it to Electron's `clipboard.writeImage` as a data URL. Electron handles PNG alpha natively.
- [x] Review `web/src/utils/getAssetThumbUrl.ts` and all `thumb_url` consumers to confirm the frontend handles both flat JPEG thumbs and original alpha-preserving image URLs correctly.
  - Verified: Creates blob URLs with `type: "image/png"` from binary data (preserves alpha). Backend serves `_thumb.jpg` (flat JPEG) or falls back to original (preserves alpha). Both paths handled correctly.

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
  - the first pass should make full-size previews, property previews, and compare views alpha-aware without requiring backend thumbnail changes

## Phase 7: Secondary Surfaces

- [x] Review markdown-rendered images for alpha visibility in chat or documentation-style views.
  - Reviewed: Markdown images use standard `<img>` tags outside the app-owned preview path. Per plan decisions, the first pass targets real image preview surfaces only. No changes needed.
- [x] Review small asset info panels for consistency.
  - Reviewed: Asset info panels use `AssetItem`, which now has the alpha surface for image assets. Consistent.
- [x] Review composer or attachment previews for transparent images if those surfaces are user-facing.
  - Reviewed: Image attachments in chat flow through `MessageContentRenderer` → `ImageView`, which has the alpha surface from Phase 2. Consistent.

## Manual Testing Checklist

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
- [ ] Test clipboard copy for transparent images in Electron.

## Decisions

- [x] Transparency treatment:
      Use a subtle checkerboard-style alpha background on app-owned image preview surfaces. This gives a clear signal without making the UI feel noisy.

- [x] Scope for first pass:
      Apply the alpha-aware treatment to real image preview surfaces in the app, not every incidental or decorative image. No user-facing toggle in the first run.

- [x] Layout behavior:
      Prefer minimal layout change in the first pass. Keep existing `contain` / `cover` behavior unless a specific surface proves too misleading without a fit change. Avoid adding extra padding unless it is truly needed for readability.

- [x] Reuse strategy:
      Do not build a large global abstraction. Use one small shared alpha-surface primitive or styling helper, then keep per-surface layout behavior local and understandable.

- [x] Backend dependency:
      Assume the TypeScript backend path. Flat JPEG thumbnails are acceptable in the first pass. Do not scope work around `nodetool-core`, and do not require backend thumbnail changes for the initial rollout.

- [x] Out of scope:
      Exclude the current `ImageEditor` work from this plan because that area will be replaced soon.

## Future Suggestions

- [ ] If some surfaces still feel ambiguous after the first pass, selectively allow fit changes on those specific components instead of changing fit behavior globally.
- [ ] If small previews remain hard to read, consider a slightly stronger checkerboard contrast for tiny thumbnail surfaces only.
- [ ] If users want more control later, consider an optional transparency toggle in fullscreen viewers rather than across the whole app.
- [ ] When the replacement image editor work starts, carry over the same alpha-surface treatment there for consistency.
- [ ] If the TypeScript backend later adds real thumbnail generation, prefer an alpha-preserving format for image thumbnails where useful.
- [ ] If markdown or other secondary surfaces become important, apply the same shared alpha-surface styling there rather than creating one-off implementations.
