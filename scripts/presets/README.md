# Preset previews

Run from the repository root after `npm run build:packages`.

```bash
node scripts/presets/render-previews.mjs --ids camera.arc --dry-run
node scripts/presets/render-previews.mjs --ids camera.arc
node scripts/presets/render-previews.mjs
node scripts/presets/publish-previews.mjs --dry-run
node scripts/presets/publish-previews.mjs
```

Add `--final` to both rendering and publishing for the final Seedance model at
1080p. The default model is Dreamina Seedance 2.5 draft at 480p. `--resolution`
overrides the resolution for either script, so a clip rendered at another
resolution can still be published. Rendering is sequential.
`--ids camera.arc,camera.orbit` limits either script. `--output-dir /absolute/path`
changes the media directory from `~/.cache/nodetool/preset-previews`. Media output
inside the repository is rejected. Dry runs require neither Chrome nor credentials.

Before rendering, connect the NodeTool Chrome extension and open
<https://dreamina.capcut.com> in Chrome. Sign in, bring that tab to the front,
and keep Chrome available throughout the batch. Rendering spends Dreamina credits.
The preflight checks the native extension bridge and attaches to the Dreamina tab.
The provider checks authentication before submitting. When Dreamina refuses one
output, for example `OutputAudioCopyright`, the run record is marked `rejected`,
the batch continues, and the script exits non-zero so a rerun retries it.

Publishing requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`PRESET_PREVIEWS_BUCKET` in the environment. Create that bucket as public first.
The shipped previews live in the public `preset-previews` bucket of the NodeTool
Supabase project.
The script uses the storage adapter to upload a muted MP4 of up to three seconds
and a PNG poster, updates the preset JSON, and regenerates the catalogue. Set
`--final` when publishing final renders. Review every clip before publishing.
MP4 looping is controlled by the player.

A preset that only edits images renders the edited still on
`dreamina_gpt_image_2_5_sunburst` instead of a clip. Image edits take no seed, so
its run record has `seed: null`. Publishing turns the still into a three-second
loop that crossfades from the source still to the edit.

Dreamina has no video-to-video mode, so a video restyle (`video_edit`) renders as
Seedance reference-to-video with the published `camera.dolly-in` preview as its
reference video. Its run record holds that clip's URL as `source_url`. The graph
in the record is the reference-to-video graph that rendered it, not the
`VideoToVideo` graph that eject builds.

Run records live at `packages/presets/runs/<id>.json`. Completed records matching
the prompt, model, graph, source hash and seed are skipped. Interrupted records
are retried on the next invocation. Dreamina’s existing pending-job ledger uses
the same prompt, inputs and seed to collect the earlier submission. Keep that
ledger intact when restarting after a tab stall. A completed record preserves its output path even on another machine.
Copy the output there before publishing. Keep records alongside preset changes.
Credits and USD cost remain null when the runner does not report them. Never
interpret null as zero or use Dreamina records as BYOK price evidence.

`source.jpg` was generated on Dreamina with GPT Image 2.5 Sunburst by
`node scripts/presets/source-stills.mjs`, which records the prompt and seed.
It contains no people, text or logos, and no external photography. Its SHA-256 is included in every workflow identity.

## Effects Gallery template

```bash
node scripts/presets/sync-effects-template.mjs
node scripts/presets/sync-effects-template.mjs --check
```

The script rewrites the Effect Preset options and the effect count in the
description of `Effects Gallery.json` from the built catalogue. Run
`npm run build --workspace=packages/presets` first. `--check` exits 1 when the
template differs, and `packages/presets/tests/effects-template.test.ts` runs it.
After a change, refresh the marketing copies with
`node marketing/scripts/generate-template-entries.mjs` and
`node marketing/scripts/generate-template-catalog.mjs`.
