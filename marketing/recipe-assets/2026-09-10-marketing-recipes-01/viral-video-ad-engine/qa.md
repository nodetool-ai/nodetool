# D1 QA

Status: partial. Production assets and AD-C0 through AD-C11 are complete; the walkthrough is missing.

| Check | Result | Evidence |
| --- | --- | --- |
| V1 / AD-Q2 | Pass | All three clean and captioned masters are H.264/AAC, 1080×1920, 30 fps, and exactly 15.000 seconds. MP4/WebM deliveries and stills decode; `evidence/ffprobe.json` and `evidence/sha256.txt`. |
| V2 / AD-Q3 | Pass | Timeline exports and `evidence/variant-reuse.json` map A/B/C to distinct openings and the same S2, S3, S4 and shared speech assets. |
| V3 / AD-Q6 | Partial | AD-C0 through AD-C11 are present as lossless 3200×2000 PNG captures and match `capture-log.json`; the guided walkthrough is absent. |
| V4 | Partial | Technical full-file decode passed. Final normal-speed picture and headphone review remains with the coordinator. |
| V5 / AD-Q1 | Pass | Full-size still review rejected initial AD-S4 and AD-S1C. Targeted FAL retries `aaeb7dceaabe46eabd65309c8d0f5de1` and `b33d24ef33da499197d62af85c95edc2` passed the one-cup, no-artifact, lid/body-geometry check; `evidence/product-consistency.webp`. |
| V6 | Pass | Exact script copy and cue timing are retained in three scripts, six original FAL speech assets, 48 kHz stems, and matching VTT files. B's 3.160-second hook cue matches its measured take. |
| V7 / AD-Q4 | Pass with limitation | All three server timelines validate at 15000 ms with 3 tracks and 9 clips. Direct clips are timeline assets, not storyboard-attached clips; speech is attached to timeline Voice tracks rather than script-line takes. |
| V8 | Pass with review note | Delivery dimensions/aspect/audio metadata match the masters. Final side-by-side subjective encode review remains pending. |
| V9 / AD-Q7 | Pass | Claims in `asset-manifest.json` are factual, scoped to this run, and contain no sales, speed, virality, price, or performance claims. |
| V10 | Pass | AD-C0 through AD-C11 show document editors and project navigation without exposing the node graph. |

The stopped 3,909,353,472-byte invalid WAV was removed. No package file exceeds 100 MB. All media-generation, edit, video, and TTS calls used provider `fal_ai`; actual provider cost was unavailable and is recorded as `null`.
