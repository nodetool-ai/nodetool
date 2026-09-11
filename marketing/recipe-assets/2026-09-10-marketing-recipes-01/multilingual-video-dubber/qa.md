# QA

- V1: PARTIAL. DU-C3 through DU-C8 exist, hash-match `capture-log.json` and `asset-manifest.json`, and decode as lossless 3200×2000 PNGs captured from a 1600×1000 live UI viewport at 2× density. DU-C9 remains the supplied 1045×768 JPEG bitstream under its legacy `.png` path. The remaining required captures and walkthrough are absent. Existing media/document inventory and probes remain in `evidence/`.
- V2: PARTIAL. Source and target segment mapping is in both timeline exports and `documents/line-map.json`. The captured native flow uses FAL Kokoro Spanish `ef_dora` and a 16.3-second timeline, while the separately produced delivery assets use `felipe_es` and the measured source-segment timing; the captures do not prove those delivery files came from the captured timeline.
- V3: PARTIAL. DU-C3 through DU-C9 show the real Script setup, voicing, revoice, SRT export action, and timeline handoff in order. DU-C0, DU-C1, DU-C2, DU-C10, and DU-C11 remain missing.
- V4: PARTIAL. Decode and duration probes passed. Full normal-speed human viewing and headphone review are pending.
- V5: PARTIAL. Presenter reference is full resolution; full frame-by-frame face inspection is pending.
- V6: PASS. FAL ASR matched all spoken words; subtitles use measured target take timings.
- V7: PARTIAL. Editable JSON exports and a native editable timeline capture exist, but the exact required project rename, project/script/timeline IDs, app revision, and successful reopen were not verified. The native preview returned `Unable to play media`.
- V8: PARTIAL. Decode and geometry probes passed; human side-by-side encode review remains pending.
- V9: PASS for the narrowly scoped capture claims in `asset-manifest.json`. Do not turn them into playback-quality, project-persistence, or end-to-end delivery claims.
- V10: PASS for produced media. No graph was created or shown.

Capture observations:

- DU-C3: accepted Spanish appears in the imported-words panel, kept word for word.
- DU-C4: Voiceover narration, custom 23 seconds, and GPT-5.6-Sol codex are visible.
- DU-C5: all three accepted Narrator lines and 44-word review are visible.
- DU-C6: Spanish, Normal pace, FAL Kokoro Spanish, `ef_dora`, and a loaded six-second audition are visible; listening is not proven.
- DU-C7: `Voiced 3 lines`, all three editable lines, and 16.3 seconds are visible.
- DU-C8: line 2 keeps its approved words, its direction is revised, and the session revoiced it to Takes (2) and exported SRT. The still does not show an export confirmation dialog.
- DU-C9: the editable three-clip voiceover timeline displays `00:00:16:08` (about 16.3 seconds at the shown 24 fps). Preview failed with `Unable to play media` and the frame area shows `No media at 0s`.

Recipe acceptance status: partial. DU-C0, DU-C1, DU-C2, DU-C10, DU-C11, DU-A16, exact project/document identity, successful native playback, and human visual/audio acceptance remain open.
