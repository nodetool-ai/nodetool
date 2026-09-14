# Marketing Site

This directory contains the Next.js marketing site, generated catalogs, recipe
guides, and public production media. Follow the repository
[development standards](../docs/DEVELOPMENT_STANDARDS.md),
[writing style](../docs/WRITING_STYLE.md), and
[brand guidelines](../docs/BRAND.md).

## Recipe Sources

- Edit recipe presentation and accepted-run metadata in
  `scripts/recipes.mjs`.
- Edit guided steps in `scripts/recipe-guides.mjs`.
- Treat `src/data/recipeEntries.generated.ts` as generated output. Run
  `npm run gen:recipes` from this directory after changing either source file.
  Verify drift with `npm run gen:recipes -- --check`.
- Keep public files under `public/recipes/runs/<run-id>/`. Keep source prompts,
  intermediate renders, evidence, and editable masters under
  `recipe-assets/<run-id>/` when the production record needs them.
- Record only measured media facts. Read dimensions, duration, frame rate,
  codecs, and audio channels from the final files before updating claims.

## Guided Step Images

Every recipe step must have an image that explains that step. Prefer a real
NodeTool screen showing the named stage, entity, storyboard, rendered clip,
review state, or timeline. A finished beauty shot alone does not explain how
the project was made.

- Place the image in the active step panel, below the step navigation and
  before the short instruction. The image should occupy the panel area that
  would otherwise be empty.
- Use one image per step and give it an accurate alt text and a short caption.
- Store the exact intrinsic width and height in the guide data.
- Use landscape UI captures around 1960 pixels wide when possible. Preserve
  enough of the NodeTool chrome to identify the product and stage.
- Do not display a full 9:16 screenshot at unrestricted height. Use a bounded
  presentation or a crop that keeps the relevant UI readable.
- Keep each step description to one or two short sentences and each action to
  one direct verb phrase. Move production history into the example note.
- Add an end-to-end assertion that opens every step, finds its image, and
  checks that `naturalWidth` is greater than zero.

## Production Media

Use a stable, accepted render as the source for published media. Keep the
public set small: card or hero image, proof image when needed, poster, and final
video. Do not publish contact sheets, transcripts, extracted audio, prompts, or
temporary alignment files unless the page links to them.

Upscale photographic stills and final videos only after the edit is approved.
Do not apply generative upscalers to NodeTool UI screenshots because they can
alter labels, icons, and graph details.

For AtlasCloud enhancement:

- Use `atlascloud/image-upscaler` with `outscale: 2` and preserve the intended
  output format.
- Use `atlascloud/video-upscaler` with `target_resolution: "2k"` for an
  accepted 1080p master.
- AtlasCloud image jobs accept data URLs. The video upscaler may reject an
  inline video data URL, so pass a stable public HTTPS source URL when needed.
- Prefer the registered NodeTool AtlasCloud node or node-run harness. If the
  local registry does not expose the node, use the shared AtlasCloud transport
  helpers rather than implementing a second HTTP client.
- Download to a temporary directory first. Inspect the output before replacing
  public files.
- Inspect representative video frames from the beginning, middle, and end.
  Check faces, hands, product geometry, lettering, edges, and motion continuity.
- Decode the full video with FFmpeg. Confirm duration, resolution, frame rate,
  video codec, audio codec, and channel count with FFprobe.
- Update `scripts/recipes.mjs` with the actual enhanced dimensions and measured
  media facts, then regenerate the recipe catalog.

## Product Commercial Direction

Build product commercials around a short sequence of consequential actions.
Each shot must change the scene or advance the subject. A polished still with
minor camera movement is not enough when the shot is meant to sell taste,
texture, use, or intent.

- Lock the product from its reference image. Describe its identity once, then
  direct the action without adding shape, lid, material, colour, or branding
  details that could cause the video model to redesign it.
- Write physical changes in observable terms. For a pour, state that the liquid
  level rises against the inner wall, the stream stops before overflow, and the
  final level remains visible. Do not rely on words such as `realistic` or
  `cinematic` to supply the physics.
- Give food and drink shots sensory evidence: fresh steam, surface movement,
  condensation, controlled highlights, close sound, and a clear serving action.
  Keep the product clean and plausible rather than exaggerating the effect.
- State screen direction and body orientation for entrances and exits. For a
  departure, identify where the camera is, which way the subject faces, what
  crosses the threshold first, and where the subject ends the shot. Check the
  last frame as well as the first.
- Keep an approved shot's source, in and out points, framing, speed, and order
  fixed while replacing other shots. Normal export encoding may change pixels,
  so describe the footage as preserved only when those editorial choices match.
- Direct one primary action per shot. Let it complete before the cut. Use the
  sequence to create appetite or desire: preparation, human response, then the
  product continuing into the subject's day.
- Treat image quality and shot effectiveness as separate reviews. Inspect the
  reference for detail and consistency, then inspect the video for believable
  motion, cause and effect, hand contact, gaze, and narrative direction.
- Plan sound per shot before assembly. Keep useful native sound, balance it
  across cuts, and add short fades at joins. Add music, narration, and titles
  only when the brief calls for them.

## Local Development and Verification

The development server and a production build both write `marketing/.next`.
Do not run them concurrently. Stop one before starting the other, or use an
isolated output directory, because mixed artifacts can produce missing-module
and corrupted-cache failures.

For recipe-only changes, run:

```bash
npm run gen:recipes -- --check
npm run typecheck
npm run lint
```

Also run the focused Playwright recipe smoke test when the production server is
available. Verify the live page at desktop width, click every step, and inspect
the actual rendered composition. A successful asset request does not prove the
image is visible or appropriately sized.

Run the repository-level checks required by the root
[AGENTS.md](../AGENTS.md#mandatory-post-change-verification) before delivery.
If an unrelated working-tree change expands `test:affected` to the full suite,
report that scope and rerun any isolated failure before attributing it to the
marketing change.
