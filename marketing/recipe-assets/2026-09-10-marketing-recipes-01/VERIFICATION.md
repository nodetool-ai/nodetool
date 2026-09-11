# Marketing recipe asset verification

Overall status: **partial**. All four recipe plans were executed with Codex GPT-5.6-Sol agents and FAL media providers. Required production and capture gaps remain, so none of the packages is accepted or ready for page use under MASTERPLAN M12.

## Verified

- All JSON files parse.
- All four manifests contain the M10 required fields and use `partial` status.
- All 241 manifest asset paths, byte counts and SHA-256 values pass.
- All exported document paths and SHA-256 values pass.
- All 53 recorded media-generation calls use the FAL provider (`fal` or `fal_ai`).
- All 183 manifested image, audio and video assets return successful full-decode exit status.
- D1 and D2 checksum ledgers pass.
- D3 catalogue ZIP integrity passes; its corrupt motion poster was deterministically regenerated from the accepted motion master at 2.0 seconds and reverified.
- Only `marketing/recipe-assets/2026-09-10-marketing-recipes-01/` is new in the scoped git status. No marketing page, recipe data, generator or public-delivery path was changed.

## Remaining gaps

- **D1 Product ad variants:** completed FAL media, three 15-second editable timelines, masters and web encodes; missing all AD-C0–AD-C11 live captures and the walkthrough.
- **D2 Multilingual dubber:** completed FAL source, transcription, Spanish voiceover/lip-sync outputs and seven live captures; missing five required capture states, raw/step derivatives, walkthrough, stable project/document IDs and human full-playback acceptance.
- **D3 Ecommerce catalogue:** completed shared product, cutout, three stills, motion, upscale, listing copy and full guide sequence; missing verified project identity, direct accepted-take attachment, true-PNG target-resolution captures and a constant-30-fps walkthrough.
- **D4 Storyboard trailer:** completed real guided setup, six server-side stills, reviewed screenplay, four entities and three FAL voice takes. The CLI repaired all six keyframe assets, then hit a Node heap OOM before provider submission. Six clips, score, timeline, masters, later captures, walkthrough and finishing evidence remain missing.

## Decode warnings

Seven WebM files decode with exit status 0 but ffmpeg 8.0 emits `Error parsing Opus packet header`: D1 `web/ad-a.webm`, `ad-b.webm`, `ad-c.webm`; D2 `web/source-en.webm`, `dub-es-voiceover.webm`, `dub-es-lipsync.webm`, and `language-comparison.webm`. Treat these as compatibility warnings until checked in target browsers.

No marketing pages were built or published.
