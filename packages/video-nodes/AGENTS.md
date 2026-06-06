# video-nodes — Video Editing & Assembly

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **video-nodes**

> Read [packages/AGENTS.md](../AGENTS.md) first (media-ref rules apply). This overlay covers video-specific correctness.

## Reading input media

- **Read input audio/video bytes with the async, context-aware resolver**
  (`await audioBytesAsync(this.audio, context)` / `videoBytesAsync`), never the
  sync `audioBytes`. `AddAudio` used the sync inline-only reader, so audio supplied
  as an asset/`file://`/`http` URI yielded empty bytes and the node silently
  returned the video with no audio.

## ffmpeg numbered sequences

- **Number frame files with a contiguous counter incremented only on a successful
  write — never the loop index.** When a frame is skipped, a filename based on
  `i + 1` leaves a gap, and ffmpeg's `image2` demuxer stops at the first missing
  number, dropping every frame after the gap. Keep a separate `written` counter
  (`frame_000001.png`, `frame_000002.png`, …).
- **Handle the zero-frames case explicitly** — emit an empty
  `videoRef(new Uint8Array())` rather than invoking ffmpeg on nothing.

Construct outputs with the `videoRef` helper (raw base64 `data`, `type: "video"`)
— see [packages/AGENTS.md § Media refs](../AGENTS.md#media-refs-imageref--videoref--audioref--model3dref).
