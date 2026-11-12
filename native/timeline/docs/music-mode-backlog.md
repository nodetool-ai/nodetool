# Music mode backlog

Open P2 findings from the review of the music mode branch. The design is
[MUSIC-MODE.md](MUSIC-MODE.md). Only P0 and P1 findings block a merge. A P2
listed here stays open until a change fixes it and moves it to
[Closed](#closed) with the commit.

Review codes: R1 is the audio loop and engine rate, R2 the native job module,
edits and clean-up, R3 the server provider and handler, R4 musical time, the
planner and the audio math. Paths starting with `src/`, `qml/` or `docs/` are
relative to `native/timeline/`.

## Open

| ID | Source | Location | Finding |
|---|---|---|---|
| M1 | R4 F1 | `packages/timeline/src/music/plan.ts:193`, `src/music/MusicPlan.cpp:100` | Generate places segment `i` at `i * L`, and `beat_phase_frames` covers only the window start. When the target is not a whole number of beats (an Alt-placed range), surplus takes start off the beat grid by up to half a beat, and one alignment offset per candidate cannot correct them. Start each segment on the same beat phase, or plan one segment when `L` is not a multiple of the beat. |
| M2 | R4 F4 | `packages/websocket/src/session/music-generation.ts:304` | Repaint and lego takes measure tempo on the cut region only. On 2–4 s regions, onset jitter of 4–8 ms gave false drift badges in 2 to 4 of 12 runs. Measure the whole candidate window and scale the error to the region. |
| M3 | R4 F5 | `packages/timeline/src/music/align.ts:250` | `measureAlignment` runs synchronously in the handler: 1.0 s for a 64 s window, 4.9 s for 300 s, so a 600 s request with four candidates stalls the server process for about 40 s. Run it in a worker thread or yield between candidates. |
| M4 | R3 F7 | `packages/runtime/src/providers/acestep-provider.ts:329` | A remote `ace-server` started with the default `--max-batch 1` returns one candidate when four are asked, with only a log line. Read the limit from `GET /props`, or render the rest through `synth_batch_size`. |
| M5 | R3 F8 | `acestep-provider.ts:480`, `music-generation.ts:471` | A 600 s window is 230 MB per candidate as float WAV, and the multipart body, its parts and the handler's decode, gain, cut and encode copies all coexist: about 2 GB resident for four candidates. Use `subarray` views and drop each candidate after its takes are stored. |
| M6 | R3 F11 | `music-generation.ts:498` | The record keeps the audio codes and seed only. Without a project key, `/lm` fills `keyscale` and can rewrite the caption, so a replay with the stored codes and the original caption conditions the DiT differently. Store the enriched caption and key in the record. |
| M7 | R3 F10 | `packages/runtime/tests/url-egress-inventory.ts:674` | The inventory calls the acestep server URL and binary path operator input, but they are per-user settings. On a multi-user server any user can point the server's requests at an internal host or name the executable to spawn. Read these settings at server scope. |
| M8 | R1 F3 | `src/audio/AudioEngine.cpp:727` | After an edit, the old-plan wrap session stays claimable while the new one is built. A mute or delete just before the loop end sounds again from the loop start for about one worker pass. Refuse a wrap session whose plan is older than the playing session's, or document the trade-off in section 14.2. |
| M9 | R2 F4 | `src/music/MusicJobs.cpp:1149` | The job record drops its takes when `applyResult` runs, before the autosave. A crash inside the save debounce leaves the placeholder queued and the takes unreachable. Keep the takes until the save is acknowledged, or look the request up again on restore. |
| M10 | R2 F5 | `src/music/MusicJobs.cpp:970` | The "two lookups with no row" rule keys on `recovered`. A recovered job sent in this session can be resubmitted while its first request still loads context, and a request lost in the current session is never detected. Clear `recovered` on send and apply the rule to requests sent before the current connection. |
| M11 | R2 F9 | `src/music/MusicCleanup.cpp:225` | Pending deletions live only in memory, so quitting between the removal edit and the deletion leaves the audio on the server with nothing naming it. Clean-up also scans only the open sequence, not version snapshots or other timelines. |
| M12 | R2 F10 | `src/music/MusicBounce.cpp:111` | The bounce destructor joins on the GUI thread and the upload does not check for interruption, so Cancel, a document switch or quitting freezes the UI until an upload of up to 230 MB ends. |
| M13 | F (jobs) | `src/audio/AudioEngine.cpp` | A take placed under a playing playhead counts one underrun: the engine publishes new voices before they hold PCM. A placeholder has no audio, so nothing is audible, but `underruns` is no longer 0 (AU-3). |
| M14 | I2 | `--ui-bench` | The 32-track, 500-clip music fixture measured 13.5 and 15.8 ms GUI p95 on the Linux machine against the 8 ms budget (PF-2). The existing 200-track fixture fails the same budget there at 37.5 ms. Measure on the reference Mac. |

## Closed

| ID | Source | Fixed by | Finding |
|---|---|---|---|
