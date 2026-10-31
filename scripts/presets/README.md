# Preset previews

Run from the repository root after `npm run build:packages`.

```bash
node scripts/presets/render-previews.mjs --ids camera.arc --dry-run
node scripts/presets/render-previews.mjs --ids camera.arc
node scripts/presets/render-previews.mjs
node scripts/presets/publish-previews.mjs --dry-run
node scripts/presets/publish-previews.mjs
```

Add `--final` to both rendering and publishing for the final Seedance model.
The default model is Dreamina Seedance 2.5 draft at 480p. Rendering is sequential.
`--ids camera.arc,camera.orbit` limits either script. `--output-dir /absolute/path`
changes the media directory from `~/.cache/nodetool/preset-previews`. Media output
inside the repository is rejected. Dry runs require neither Chrome nor credentials.

Before rendering, connect the NodeTool Chrome extension and open
<https://dreamina.capcut.com> in Chrome. Sign in, bring that tab to the front,
and keep Chrome available throughout the batch. Rendering spends Dreamina credits.
The preflight checks the native extension bridge and attaches to the Dreamina tab.
The provider checks authentication before submitting.

Publishing requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and
`PRESET_PREVIEWS_BUCKET` in the environment. Create that bucket as public first.
The script uses the storage adapter to upload a muted MP4 of up to three seconds
and a PNG poster, updates the preset JSON, and regenerates the catalogue. Set
`--final` when publishing final renders. Review every clip before publishing.
MP4 looping is controlled by the player.

Run records live at `packages/presets/runs/<id>.json`. Completed records matching
the prompt, model, graph, source hash and seed are skipped. Interrupted records
are retried on the next invocation. Dreamina’s existing pending-job ledger uses
the same prompt, inputs and seed to collect the earlier submission. Keep that
ledger intact when restarting after a tab stall. A completed record preserves its output path even on another machine.
Copy the output there before publishing. Keep records alongside preset changes.
Credits and USD cost remain null when the runner does not report them. Never
interpret null as zero or use Dreamina records as BYOK price evidence.

`source.png` is an original geometric scene drawn programmatically for this
pipeline, dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). It contains no external
photography. Its SHA-256 is included in every workflow identity.

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
