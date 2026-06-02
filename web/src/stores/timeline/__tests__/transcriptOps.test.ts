import { makeClip } from "@nodetool-ai/timeline";
import type { TimelineClip, TranscriptLine } from "@nodetool-ai/timeline";

import {
  PLACEHOLDER_BEAT_MS,
  addLine,
  beatAudioClip,
  beatCaptionClip,
  beatDurationMs,
  reflowBeats,
  removeLine,
  reorderLines,
  rewordLine
} from "../transcriptOps";

/** A line with a voiceover (audio) + caption clip already generated. */
const makeBeat = (
  id: string,
  text: string,
  audioMs: number,
  opts: { rendered?: boolean } = {}
): { line: TranscriptLine; clips: TimelineClip[] } => {
  const audio = makeClip({
    id: `${id}-aud`,
    mediaType: "audio",
    bindingKind: "text-to-audio",
    durationMs: audioMs,
    prompt: text,
    status: opts.rendered ? "generated" : "draft",
    currentAssetId: opts.rendered ? `${id}-asset` : undefined
  });
  const caption = makeClip({
    id: `${id}-cap`,
    mediaType: "overlay",
    durationMs: audioMs,
    caption: { words: [{ word: text, startMs: 0, endMs: audioMs }] }
  });
  const line: TranscriptLine = {
    id,
    text,
    beatStartMs: 0,
    clipIds: [audio.id, caption.id]
  };
  return { line, clips: [audio, caption] };
};

describe("beat clip lookups", () => {
  const { line, clips } = makeBeat("l1", "hi", 1000);
  it("finds the audio and caption clips of a beat", () => {
    expect(beatAudioClip(line, clips)?.id).toBe("l1-aud");
    expect(beatCaptionClip(line, clips)?.id).toBe("l1-cap");
  });
  it("uses the audio duration as the beat length", () => {
    expect(beatDurationMs(line, clips)).toBe(1000);
  });
  it("falls back to the placeholder length before generation", () => {
    const empty: TranscriptLine = {
      id: "e",
      text: "",
      beatStartMs: 0,
      clipIds: []
    };
    expect(beatDurationMs(empty, [])).toBe(PLACEHOLDER_BEAT_MS);
  });
});

describe("reflowBeats", () => {
  it("lays beats end-to-end and positions every bound clip", () => {
    const a = makeBeat("a", "one", 1000);
    const b = makeBeat("b", "two", 2000);
    const transcript = [a.line, b.line];
    const clips = [...a.clips, ...b.clips];

    const out = reflowBeats(transcript, clips);

    expect(out.transcript[0].beatStartMs).toBe(0);
    expect(out.transcript[1].beatStartMs).toBe(1000);
    expect(out.durationMs).toBe(3000);

    const aAudio = out.clips.find((c) => c.id === "a-aud")!;
    const bAudio = out.clips.find((c) => c.id === "b-aud")!;
    const bCaption = out.clips.find((c) => c.id === "b-cap")!;
    expect(aAudio.startMs).toBe(0);
    expect(bAudio.startMs).toBe(1000);
    // Caption spans the whole beat.
    expect(bCaption.startMs).toBe(1000);
    expect(bCaption.durationMs).toBe(2000);
  });

  it("leaves clips not bound to any line untouched", () => {
    const a = makeBeat("a", "one", 1000);
    const stray = makeClip({ id: "stray", startMs: 5000, durationMs: 500 });
    const out = reflowBeats([a.line], [...a.clips, stray]);
    expect(out.clips.find((c) => c.id === "stray")!.startMs).toBe(5000);
  });
});

describe("addLine", () => {
  it("appends an empty line", () => {
    const { transcript, line } = addLine([], "hello");
    expect(transcript).toHaveLength(1);
    expect(transcript[0]).toBe(line);
    expect(line.text).toBe("hello");
    expect(line.clipIds).toEqual([]);
  });
});

describe("removeLine", () => {
  it("removes the line, its bound clips, and re-flows", () => {
    const a = makeBeat("a", "one", 1000);
    const b = makeBeat("b", "two", 2000);
    const out = removeLine(
      [a.line, b.line],
      [...a.clips, ...b.clips],
      "a"
    );
    expect(out.transcript.map((l) => l.id)).toEqual(["b"]);
    expect(out.clips.find((c) => c.id === "a-aud")).toBeUndefined();
    expect(out.clips.find((c) => c.id === "a-cap")).toBeUndefined();
    // Remaining beat re-flows to the start.
    expect(out.transcript[0].beatStartMs).toBe(0);
    expect(out.clips.find((c) => c.id === "b-aud")!.startMs).toBe(0);
    expect(out.durationMs).toBe(2000);
  });
});

describe("reorderLines", () => {
  it("reorders and recomputes beat positions", () => {
    const a = makeBeat("a", "one", 1000);
    const b = makeBeat("b", "two", 2000);
    const out = reorderLines(
      [a.line, b.line],
      [...a.clips, ...b.clips],
      ["b", "a"]
    );
    expect(out.transcript.map((l) => l.id)).toEqual(["b", "a"]);
    expect(out.transcript[0].beatStartMs).toBe(0); // b (2000ms)
    expect(out.transcript[1].beatStartMs).toBe(2000); // a after b
    expect(out.clips.find((c) => c.id === "a-aud")!.startMs).toBe(2000);
  });
});

describe("rewordLine", () => {
  it("updates the line text and the voiceover prompt", () => {
    const a = makeBeat("a", "old", 1000, { rendered: true });
    const out = rewordLine([a.line], a.clips, "a", "new");
    expect(out.transcript[0].text).toBe("new");
    expect(out.clips.find((c) => c.id === "a-aud")!.prompt).toBe("new");
  });

  it("marks a rendered voiceover stale so it regenerates", () => {
    const a = makeBeat("a", "old", 1000, { rendered: true });
    const out = rewordLine([a.line], a.clips, "a", "new");
    expect(out.clips.find((c) => c.id === "a-aud")!.status).toBe("stale");
    expect(out.clips.find((c) => c.id === "a-cap")!.status).toBe("stale");
  });

  it("does not mark an ungenerated voiceover stale", () => {
    const a = makeBeat("a", "old", 1000, { rendered: false });
    const out = rewordLine([a.line], a.clips, "a", "new");
    expect(out.clips.find((c) => c.id === "a-aud")!.status).toBe("draft");
  });
});
