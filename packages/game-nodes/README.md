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
checked grid and accept sampling and pivot settings. A sheet may also set
`sheet: {cols, rows, baseline?}` when its grid matches the checked spritesheet.
The node decodes the
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

The `generate_game_asset` agent tool also prepares imported or generated images:

- `sheet: {cols, rows, baseline?}` produces an atlas with equal-sized frames.
  Each pose is centered horizontally by its alpha bounds and shifted so its
  lowest opaque row lies at `baseline`, a zero-based cell row. The default is
  the last row of the cell. A grid that would discard pixels or a baseline
  that would clip a pose is rejected. Empty cells stay transparent. The tool
  returns `frames` and bindings named `<slot>.frame.<index>` sharing one atlas.
- `tileset: {tileWidth?, tileHeight?, edges?, highlight?, shadow?}` resizes a
  source texture to one tile and bakes a 4×4 atlas of exposed-edge variants.
  Defaults are 32×32 tiles, a two-pixel edge, highlight 1.16 and shadow 0.72.
  The mask bits are top `1`, right `2`, bottom `4` and left `8`. Mask zero is
  the interior. The tool returns `tiles` and `<slot>.tile.<mask>` bindings.
- `lut: {size?, brightness?, contrast?, saturation?, lift?, gain?, gamma?}`
  creates an opaque `size² × size` color cube directly, without an image model.
  Size defaults to 16. The default grade is identity. It applies saturation,
  contrast and brightness, then channel lift, gamma and gain. It packs red
  within a blue slice on the horizontal axis and green on the vertical axis,
  matching the game's LUT renderer.

These modes cannot be combined with each other or with trimming, resizing or
mirror tiling. Bind the returned frame bindings in one `edit_native_game`
operation batch or pass them to the game builder's `registerAssets` helper.
The generated atlas is installed once. Frame bindings reuse its full asset ID.

`generate_game_asset` accepts `input_file` as an owned asset URI, including a
unique 12-character ID prefix, or a workspace-relative path. `font` imports
TrueType and OpenType files. `sfx` imports WAV, Ogg or MP3 audio, or runs an
explicit registered sound-effect `node_type` with its `params` forwarded as
node inputs. Use `search_nodes` and `get_node_info` to select the node and its
inputs. Sound-effect node generation is synchronous. Speech remains `audio`.
