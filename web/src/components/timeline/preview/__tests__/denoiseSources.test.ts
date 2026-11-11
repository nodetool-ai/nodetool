import { makeClip } from "@nodetool-ai/timeline";
import {
  denoiseSourceClip,
  denoiseSlotId,
  isDenoiseSourceClip,
  previewClipSourceTimeSec
} from "../denoiseSources";
import {
  bindVideoSlots,
  videoSlotKey,
  type VideoSlotBinding
} from "../videoSlotPool";
it("uses independent bounded source slots without changing the document", () => {
  const clip = makeClip({
    id: "c",
    trackId: "v",
    startMs: 1000,
    durationMs: 1000,
    inPointMs: 200,
    mediaType: "video"
  });
  const before = denoiseSourceClip(clip, "before"),
    after = denoiseSourceClip(clip, "after");
  expect(isDenoiseSourceClip(before)).toBe(true);
  expect(isDenoiseSourceClip(clip)).toBe(false);
  expect(previewClipSourceTimeSec(before, 1000)).toBe(0.2);
  expect(previewClipSourceTimeSec(after, 1999)).toBeCloseTo(1.199999);
  expect(previewClipSourceTimeSec(before, 1500)).toBeCloseTo(0.7 - 1 / 30);
  expect(previewClipSourceTimeSec(after, 1500)).toBeCloseTo(0.7 + 1 / 30);
  expect(clip.id).toBe("c");
  expect(clip.inPointMs).toBe(200);
  const slots = [clip, before, after].map((c) => ({
    clipId: c.id,
    assetUrl: "source"
  }));
  const bindings = new Map<string, VideoSlotBinding>();
  bindVideoSlots(slots, bindings, 3);
  expect(
    new Set([...bindings.values()].map((binding) => binding.index)).size
  ).toBe(3);
  bindVideoSlots(slots.slice(0, 1), bindings, 3);
  expect(bindings.size).toBe(1);
  expect(
    bindings.has(videoSlotKey(denoiseSlotId(clip.id, "before"), "source"))
  ).toBe(false);
});

it("follows reverse remaps identically after backward seeks", () => {
  const clip = makeClip({
    id: "r",
    trackId: "v",
    startMs: 0,
    durationMs: 1000,
    mediaType: "video",
    timeRemap: {
      keyframes: [
        { t: 0, sourceMs: 1200 },
        { t: 1, sourceMs: 200 }
      ]
    }
  });
  const before = denoiseSourceClip(clip, "before"),
    after = denoiseSourceClip(clip, "after");
  for (const time of [500, 900, 100, 500]) {
    expect(previewClipSourceTimeSec(before, time)).toBeCloseTo(
      (1200 - time) / 1000 - 1 / 30
    );
    expect(previewClipSourceTimeSec(after, time)).toBeCloseTo(
      (1200 - time) / 1000 + 1 / 30
    );
  }
});
