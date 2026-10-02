import { beforeEach, describe, expect, it } from "@jest/globals";
import { makeClip, makeTrack } from "@nodetool-ai/timeline";
import {
  buildPastedClips,
  clearClipClipboard,
  copyClipsToClipboard
} from "../clipboardOps";

describe("cross-timeline MIDI paste", () => {
  beforeEach(() => {
    clearClipClipboard();
    const source = makeTrack({ type: "midi", name: "Source MIDI" });
    copyClipsToClipboard([
      makeClip({
        trackId: source.id,
        name: "Melody",
        mediaType: "midi",
        startMs: 0,
        durationMs: 1000
      })
    ]);
  });

  it("pastes onto the target MIDI track when it is the only track", () => {
    const target = makeTrack({ type: "midi", name: "Target MIDI" });
    const pasted = buildPastedClips([target], 2000);
    expect(pasted).toHaveLength(1);
    expect(pasted[0]).toMatchObject({
      trackId: target.id,
      mediaType: "midi",
      startMs: 2000
    });
  });

  it("chooses a MIDI track even when visual and audio tracks come first", () => {
    const video = makeTrack({ type: "video", name: "Video" });
    const overlay = makeTrack({ type: "overlay", name: "Overlay" });
    const audio = makeTrack({ type: "audio", name: "Audio" });
    const midi = makeTrack({ type: "midi", name: "MIDI" });
    const pasted = buildPastedClips([video, overlay, audio, midi], 0);
    expect(pasted).toHaveLength(1);
    expect(pasted[0].trackId).toBe(midi.id);
  });

  it("skips MIDI clips when no MIDI track exists", () => {
    const video = makeTrack({ type: "video", name: "Video" });
    const overlay = makeTrack({ type: "overlay", name: "Overlay" });
    const audio = makeTrack({ type: "audio", name: "Audio" });
    expect(buildPastedClips([video, overlay, audio], 0)).toEqual([]);
  });
});
