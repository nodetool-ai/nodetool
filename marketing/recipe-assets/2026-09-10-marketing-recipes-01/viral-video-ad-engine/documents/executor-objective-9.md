Execute immediately. Do not search, inspect schemas, read docs, or use run_search. No browser/UI/CUA and no generation calls. Use only `get_timeline`, `set_timeline_document`, and `validate_timeline`.

Update these three existing editable 1080x1920, 30fps, 15000ms timeline documents in place, preserving their current names, ids, dates, dimensions, fps, and existing video-track clip order. Read each first, mutate the returned document, write it back with `set_timeline_document`, then validate it.

Timelines:
- A `ecaf4b138411428e83d8071bc2a7cdcb`
- B `58d280ee969c41448fcb09b6891ee0ab`
- C `c80736b7dff447d4bb21789f95a438ea`

Video asset changes:
- In all three timelines, clip named `AD-S4` must have currentAssetId `4c0fb8f4afb94d9d8825eaeb60170fd0` and explicit inPointMs 0, outPointMs 4000.
- In timeline C only, clip named `AD-S1C` must have currentAssetId `6766c8ae46b94aca8f93b7f218ba99a9` and explicit inPointMs 0, outPointMs 3000.
- Preserve every other existing video currentAssetId, startMs and durationMs. Add explicit inPointMs 0 and outPointMs equal to durationMs where absent.

Each full document must also contain exactly one audio track named `Voice` and exactly one overlay track named `End card`. Replace any pre-existing tracks with those names rather than duplicating them. Give all clips unique deterministic ids and required bookkeeping fields (`sourceType`: `imported`, `status`: `generated`, `locked`: false, `versions`: []).

Voice clips, placed on the Voice track:
- At 0ms: A asset `189f8e05afec4e0ba5a9c0afc40d5fd2`, duration 2560ms, name `AD-L1 A`; B asset `d4a67b2fa36c453d85ed8acbdf789e1f`, duration 3000ms, name `AD-L1 B`; C asset `a7083f34b1f74387b15dc52ef488cca8`, duration 2920ms, name `AD-L1 C`.
- At 3200ms: asset `70faf487d76145a8861320aa1bf8296e`, duration 1680ms, name `AD-L2`.
- At 7000ms: asset `00e4538ee63a4321a6d79d962576d4c6`, duration 2240ms, name `AD-L3`.
- At 11000ms: asset `fa37af2c8f3346cf928b3657bc7db268`, duration 1440ms, name `AD-L4`.
Every audio clip has mediaType `audio`, inPointMs 0, outPointMs equal to its duration, volumeDb 0, and script provenance: A script `58f7b179a7d74d989a650f52a3ce8ff5`; B `c487fa64f3504e1abf56b3408603db46`; C `5f1a06467b01420591e2d3c4d31d6fea`; scriptLineId equal to AD-L1/2/3/4.

The End card track must contain exactly one editable text clip from 11000ms for 4000ms named and text `Take it with you.` with mediaType `text`, sourceType `imported`, status `generated`, locked false, versions empty. Text style: Inter, fontSizePx 74, fontWeight 600, color `#FFFFFF`, align center, maxWidthFrac 0.72, shadow color `#00000099`, blurPx 14, offsetX 0, offsetY 4. Give it transform position x 0 y -480, scale x 1 y 1, rotation 0, anchor x 0.5 y 0.5.

Print each timeline id, updated revision, duration, track/clip counts and validation result. No other changes.
