# D2 asset handoff

Package: `/Users/mg/workspace/nodetool/marketing/recipe-assets/2026-09-10-marketing-recipes-01/multilingual-video-dubber`

Hero candidate: `web/dub-es-lipsync.mp4`. Playable alternatives: `web/source-en.mp4`, `web/dub-es-voiceover.mp4`, `web/language-comparison.mp4`, with WebM siblings.

Recommended page interaction: individual English, Spanish voiceover and Spanish lip-synced videos. Use `web/language-comparison.mp4` as the standalone proof clip.

Caption: “Synthetic presenter footage created for this demonstration. The Spanish speech and lip sync were produced as separate finishing steps.”

Alt text: “Synthetic presenter in a muted-blue shirt speaking the same short script in English and Spanish.”

The source consists of three straight-cut sentence segments at 0.000, 9.000, 15.500 and 22.625 seconds. The Spanish timeline uses the same picture segments and `felipe_es`, an `es-mx`-capable FAL voice. Human/native-speaker approval is not recorded.

## Captured native Script flow

Use these screenshots in order:

1. `captures/steps/du-c3.png`: the three approved Spanish lines in Script Idea's imported-words panel.
2. `captures/steps/du-c4.png`: Voiceover narration, custom 23 seconds, GPT-5.6-Sol codex.
3. `captures/steps/du-c5.png`: the 44-word, three-line Narrator review with the approved wording intact.
4. `captures/steps/du-c6.png`: Spanish, Normal pace, FAL Kokoro Spanish, voice `ef_dora`, and the loaded target-word audition.
5. `captures/steps/du-c7.png`: `Voiced 3 lines`, editable line structure, and 16.3-second duration.
6. `captures/steps/du-c8.png`: line 2 after its direction was revised and it was revoiced to Takes (2); SRT was exported in this action, though the still does not show an export confirmation dialog.
7. `captures/steps/du-c9.png`: the editable three-clip Voiceover timeline at `00:00:16:08` (about 16.3 seconds at the shown 24 fps).

These captures document a real native Script session. They do not establish that the separately produced `felipe_es` delivery files were exported from that session: the captured voice is Kokoro Spanish `ef_dora`, and the captured timeline is 16.3 seconds. Keep those two provenance chains distinct.

DU-C3 through DU-C8 were recaptured from the live NodeTool UI through Playwright at a 1600×1000 viewport and 2× device pixel ratio. They are lossless 3200×2000 PNGs. DU-C9 remains the supplied 1045×768 JPEG bitstream under its legacy `.png` path because it is not used by the recipe page.

## Open items

- DU-C0, DU-C1, and DU-C2: English source playback, corrected transcript, and translation/back-translation review.
- DU-C10 and DU-C11: separate lip-sync finishing operation and labeled comparison playback.
- DU-A16: 45–60-second walkthrough.
- Project identity: confirm the exact rename `Marketing recipes / multilingual-video-dubber / 2026-09-10-marketing-recipes-01` and record the project, script, timeline, and app revision IDs.
- Playback: the native timeline preview returned `Unable to play media` and showed `No media at 0s`. Resolve it and complete real-time human audio/visual review. The loaded voice audition is visible, but human listening is not recorded.

Generation cost is unknown because the Node CLI returned no cost fields. Do not mark the package accepted until the missing captures, persistent project identity, successful native playback, walkthrough, and human review are completed.
