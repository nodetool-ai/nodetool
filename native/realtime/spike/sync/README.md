# WP04 recording analyzer

Record a repeated click and flash with a camera that captures both sound and
picture. Keep the flash region unobscured and include dark/silent lead-in.
Use a fixed exposure, document the camera frame rate and speaker distance, and
record the camera's own A/V calibration separately. This analyzer does not
subtract acoustic propagation or camera skew.

Save a configuration such as:

```json
{
  "roi": [100, 100, 200, 200],
  "audioThreshold": 0.5,
  "flashThreshold": 0.7,
  "gapSec": 0.4,
  "maximumOffsetSec": 0.2
}
```

`roi` is `[x, y, width, height]` in the decoded, oriented video. Thresholds are
normalized amplitude and mean RGB brightness. The gap suppresses ringing.
Choose the pairing window below half the interval between clicks, then review
the detected onsets against the recording. Incorrect thresholds can identify
background sounds or exposure changes.

```sh
node native/realtime/spike/sync/analyze.mjs recording.mov config.json result.json
node --test native/realtime/spike/sync/analyze.test.mjs
```

The repository runtime decodes in process. Audio samples retain frame PTS and
video retains presentation timestamps, including differences between stream
start times. The analyzer rejects missing, ambiguous or unequal onset sequences.
It needs at least three pairs. Positive offsets mean picture follows sound at
the camera. The largest observed video-frame interval is reported as a sampling
limit, not as a calibrated uncertainty bound.

The synthetic test verifies a known stream offset through actual media encoding
and decoding. It is not a physical sync measurement. The combined producer,
Mac hardware recording and measured-budget update remain outstanding.
