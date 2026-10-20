import type { TimelineClip } from "@nodetool-ai/timeline";
import { clipEnabledPatch, isClipDisabled } from "../clipEnabled";

type MediaType = TimelineClip["mediaType"];

const SOUND_ONLY: MediaType[] = ["audio", "midi"];
const PICTURE: MediaType[] = [
  "video",
  "image",
  "overlay",
  "text",
  "shape",
  "group",
  "adjustment"
];
const FLAGS = [undefined, true, false];

describe("isClipDisabled", () => {
  it.each(
    SOUND_ONLY.flatMap((mediaType) =>
      FLAGS.flatMap((hidden) => FLAGS.map((muted) => ({ mediaType, hidden, muted })))
    )
  )("sound-only $mediaType follows muted (hidden=$hidden, muted=$muted)", (clip) => {
    expect(isClipDisabled(clip)).toBe(clip.muted === true);
  });

  it.each(
    PICTURE.flatMap((mediaType) =>
      FLAGS.flatMap((hidden) => FLAGS.map((muted) => ({ mediaType, hidden, muted })))
    )
  )("picture $mediaType follows hidden (hidden=$hidden, muted=$muted)", (clip) => {
    expect(isClipDisabled(clip)).toBe(clip.hidden === true);
  });
});

describe("clipEnabledPatch", () => {
  it.each(SOUND_ONLY)("%s touches only muted", (mediaType) => {
    expect(clipEnabledPatch({ mediaType }, false)).toEqual({ muted: true });
    expect(clipEnabledPatch({ mediaType }, true)).toEqual({ muted: false });
  });

  it.each(PICTURE)("%s sets hidden and muted together", (mediaType) => {
    expect(clipEnabledPatch({ mediaType }, false)).toEqual({
      hidden: true,
      muted: true
    });
    expect(clipEnabledPatch({ mediaType }, true)).toEqual({
      hidden: false,
      muted: false
    });
  });

  it.each([...SOUND_ONLY, ...PICTURE])(
    "%s reads as disabled after disabling and enabled after enabling",
    (mediaType) => {
      const clip = { mediaType, hidden: undefined, muted: undefined };
      expect(isClipDisabled({ ...clip, ...clipEnabledPatch(clip, false) })).toBe(true);
      expect(isClipDisabled({ ...clip, ...clipEnabledPatch(clip, true) })).toBe(false);
    }
  );
});
