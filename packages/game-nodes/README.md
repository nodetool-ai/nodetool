# Native game asset nodes

`LoadGameTemplate` lists the slots in a native template. `SlotPrompt` provides
generation prompts and checker properties. `StageGameAssets` validates checked
media and stages content-addressed candidate bindings for a full game ID.

Install candidate bindings through the authorized game revision operation.
Staging does not edit scenes or behaviors.

`StageGameAssets.preparation` maps slot IDs to image settings. Each entry may set
`trimAlpha`, `targetWidth` and `targetHeight`, `cropPolicy` (`cover`, `contain`,
`stretch`), `mirrorX`, `mirrorY`, `pivot`, and `sampling`. Resizing, trimming and
mirror tiling apply to single-image slots. Sheet and tile slots retain their
checked grid and accept sampling and pivot settings. The node decodes the
checked image, verifies its dimensions, writes prepared PNG bytes, then hashes
those bytes. A trimmed binding records its original dimensions and crop offset;
the renderer preserves its anchor. Mirror tiling duplicates reflected edge
pixels, so both repeat boundaries meet. The maximum prepared dimension is
4096 pixels per axis.

`SlotPrompt.reference_images` exposes the selected style image for an
image-to-image generator. The guided graph uses that image as a provider input
when the chosen style has `reference_asset_id`; it records the reference in the
staged binding. `StageGameAssets.fonts` maps logical font IDs to local or asset
URIs for TrueType or OpenType files. Install those bindings through the same
revision operation as images. New preparation and font bindings require a
schema version 2 game document.
