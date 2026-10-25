# Gap plan backlog

Only P0 and P1 review findings block a merge in the gap run. Every P2 finding
still open in a package's last Codex review is listed here when the package
merges. A package or a later fix round closes an entry and moves it to
[Closed](#closed) with the commit that fixed it.

Review reports are in `/home/mg/Projects/nodetool-gaps/reviews/` on the Linux
run machine. "Package P1" and "package P2" are plan packages, not severities.

## Open

| ID | Severity | Source | Location | Finding | Owner |
|---|---|---|---|---|---|
| B1 | P2 | S1-r6 F1 | `qml/Tracks/TracksRegion.qml:187` | The add-track "+" button has no click handler or insertion hook. Package C owns `AddTrackButton.qml`, but nothing instantiates it, and `TracksRegion.qml` has no owner. | Package C, once `TracksRegion.qml` gets an owner or a hook |
| B2 | P2 | S1-r6 F2 | `src/audio/Mixer.cpp:168` | Audio processing has no effect hook. `VoicePlan` and `mixBlock` write samples after gain, fade and pan, so package P1's effects in `src/audio/effects/` cannot run without editing shared mixer code. | Package P1, once the mixer gets a hook or an owner |
| B3 | P2 | fix-decode-r3 F1 | `tests/tst_vulkaninterop.cpp:289` | The teardown test checks a retention counter, not image lifetime. Removing only `o.images = {}` and `o.memory = {}` from the destructor still passes. | V |
| B4 | P2 | fix-ui-r3 F1 | `src/ui/MediaPreviews.cpp:162` | An abandoned local-preview helper blocks a healthy replacement file at the same path. The replacement gets a cached failure for 30 seconds. | V |
| B5 | P2 | L-r2 F1 | `src/preview/hw/VulkanInterop.cpp:393` | A readback that Qt drops (staging buffer allocation failure) never runs its callback. Its completion mark stays recorded, blocks removal of later marks and leaks at teardown. The attempt in `gaps/L` 1dd43e7620 was rejected (L-r3 F1, use-after-free). | V |

## Closed

| ID | Closed by | Commit |
|---|---|---|
