import { makeClip } from "@nodetool-ai/timeline";
import type { CaptionWord, TimelineClip, TranscriptLine } from "@nodetool-ai/timeline";

import {
  PLACEHOLDER_BEAT_MS,
  applyEditorEdits,
  buildTranscriptDoc,
  cutWordRange,
  hasWords,
  isFillerWord,
  isTranscriptClip,
  isVoiceoverBeat,
  migrateTranscriptToClips,
  pasteClipsAt,
  reconcileTranscript,
  reflowGenerated,
  relabelWord,
  removeFillers,
  resolveSelectionRange,
  rippleDeleteRange
} from "../transcriptOps";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const beat = (
  id: string,
  opts: {
    startMs?: number;
    durationMs?: number;
    prompt?: string;
    words?: CaptionWord[];
    imported?: boolean;
    paragraphId?: string;
  } = {}
): TimelineClip =>
  makeClip({
    id,
    paragraphId: opts.paragraphId ?? id,
    trackId: "audio",
    mediaType: "audio",
    bindingKind: "text-to-audio",
    sourceType: opts.imported ? "imported" : "generated",
    startMs: opts.startMs ?? 0,
    durationMs: opts.durationMs ?? 0,
    prompt: opts.prompt,
    status: opts.words ? "generated" : "draft",
    currentAssetId: opts.words ? `${id}-asset` : undefined,
    caption: opts.words ? { words: opts.words } : undefined
  });

const words = (...pairs: Array<[string, number, number]>): CaptionWord[] =>
  pairs.map(([word, startMs, endMs]) => ({ word, startMs, endMs }));

// ── Clip classification ──────────────────────────────────────────────────────

describe("clip classification", () => {
  it("treats a draft voiceover beat as a transcript clip", () => {
    const c = beat("a", { prompt: "hi" });
    expect(isVoiceoverBeat(c)).toBe(true);
    expect(hasWords(c)).toBe(false);
    expect(isTranscriptClip(c)).toBe(true);
  });

  it("treats imported media with words as a transcript clip", () => {
    const c = makeClip({
      id: "v",
      mediaType: "video",
      sourceType: "imported",
      caption: { words: words(["hello", 0, 300]) }
    });
    expect(isVoiceoverBeat(c)).toBe(false);
    expect(isTranscriptClip(c)).toBe(true);
  });

  it("excludes plain media with no speech", () => {
    const music = makeClip({
      id: "m",
      mediaType: "audio",
      sourceType: "imported"
    });
    expect(isTranscriptClip(music)).toBe(false);
  });
});

// ── Projection ───────────────────────────────────────────────────────────────

describe("buildTranscriptDoc", () => {
  it("projects clips in timeline order into absolute-timed tokens", () => {
    const a = beat("a", {
      startMs: 0,
      durationMs: 1000,
      words: words(["one", 0, 400], ["two", 400, 900])
    });
    const b = beat("b", {
      startMs: 1000,
      durationMs: 800,
      words: words(["three", 0, 500])
    });
    const doc = buildTranscriptDoc([b, a]); // unsorted input

    expect(doc.segments.map((s) => s.clipIds)).toEqual([["a"], ["b"]]);
    expect(doc.durationMs).toBe(1800);

    // Tokens carry absolute timeline positions (clip.startMs + word time).
    expect(doc.segments[0].tokens.map((t) => [t.text, t.startMs, t.endMs])).toEqual([
      ["one", 0, 400],
      ["two", 400, 900]
    ]);
    expect(doc.segments[1].tokens[0]).toMatchObject({
      text: "three",
      startMs: 1000,
      endMs: 1500
    });
  });

  it("represents an un-voiced beat as a draft segment", () => {
    const draft = beat("d", { prompt: "to be spoken" });
    const doc = buildTranscriptDoc([draft]);
    expect(doc.segments[0].isDraft).toBe(true);
    expect(doc.segments[0].draftText).toBe("to be spoken");
    expect(doc.segments[0].tokens).toEqual([]);
  });

  it("classifies generated vs imported segments and excludes plain media", () => {
    const gen = beat("g", { durationMs: 1000, words: words(["hi", 0, 300]) });
    const imp = makeClip({
      id: "i",
      mediaType: "video",
      sourceType: "imported",
      startMs: 1000,
      durationMs: 500,
      caption: { words: words(["bye", 0, 200]) }
    });
    const music = makeClip({
      id: "m",
      mediaType: "audio",
      sourceType: "imported",
      startMs: 2000,
      durationMs: 4000
    });
    const doc = buildTranscriptDoc([gen, imp, music]);
    expect(doc.segments.map((s) => [s.clipIds[0], s.kind])).toEqual([
      ["g", "generated"],
      ["i", "imported"]
    ]);
  });

  it("groups consecutive clips that share a paragraphId into one paragraph", () => {
    // Two halves of a split beat share a paragraphId; a separate beat does not.
    const left = beat("L", {
      startMs: 0,
      durationMs: 400,
      words: words(["hello", 0, 400]),
      paragraphId: "p1"
    });
    const right = beat("R", {
      startMs: 400,
      durationMs: 500,
      words: words(["world", 0, 500]),
      paragraphId: "p1"
    });
    const other = beat("O", {
      startMs: 900,
      durationMs: 600,
      words: words(["again", 0, 600]),
      paragraphId: "p2"
    });
    const doc = buildTranscriptDoc([left, right, other]);
    expect(doc.segments.map((s) => s.clipIds)).toEqual([["L", "R"], ["O"]]);
    // The merged paragraph flows both clips' words in order.
    expect(doc.segments[0].tokens.map((t) => t.text)).toEqual(["hello", "world"]);
    expect(doc.segments[0].tokens[1]).toMatchObject({ clipId: "R", startMs: 400 });
  });
});

// ── Layout ───────────────────────────────────────────────────────────────────

describe("reflowGenerated", () => {
  it("lays voiceover beats end-to-end in timeline order", () => {
    const a = beat("a", { startMs: 0, durationMs: 1000 });
    const b = beat("b", { startMs: 1000, durationMs: 2000 });
    const out = reflowGenerated([a, b]);
    expect(out.clips.find((c) => c.id === "a")!.startMs).toBe(0);
    expect(out.clips.find((c) => c.id === "b")!.startMs).toBe(1000);
    expect(out.durationMs).toBe(3000);
  });

  it("reorders beats when given an explicit order", () => {
    const a = beat("a", { startMs: 0, durationMs: 1000 });
    const b = beat("b", { startMs: 1000, durationMs: 2000 });
    const out = reflowGenerated([a, b], ["b", "a"]);
    expect(out.clips.find((c) => c.id === "b")!.startMs).toBe(0);
    expect(out.clips.find((c) => c.id === "a")!.startMs).toBe(2000);
    expect(out.durationMs).toBe(3000);
  });

  it("uses a placeholder length for un-voiced beats", () => {
    const a = beat("a", { startMs: 0, durationMs: 0 });
    const out = reflowGenerated([a]);
    expect(out.clips[0].durationMs).toBe(PLACEHOLDER_BEAT_MS);
    expect(out.durationMs).toBe(PLACEHOLDER_BEAT_MS);
  });

  it("leaves non-beat clips in place and spans them in the duration", () => {
    const a = beat("a", { startMs: 0, durationMs: 1000 });
    const stray = makeClip({
      id: "stray",
      mediaType: "video",
      sourceType: "imported",
      startMs: 5000,
      durationMs: 500
    });
    const out = reflowGenerated([a, stray]);
    expect(out.clips.find((c) => c.id === "stray")!.startMs).toBe(5000);
    expect(out.durationMs).toBe(5500);
  });
});

// ── Ripple delete ────────────────────────────────────────────────────────────

describe("rippleDeleteRange", () => {
  it("excises an interior span, splitting the clip and rebasing the tail words", () => {
    const c = beat("c", {
      startMs: 0,
      durationMs: 900,
      words: words(["hello", 0, 300], ["um", 300, 500], ["world", 500, 900])
    });
    const out = rippleDeleteRange([c], 300, 500);
    expect(out.clips).toHaveLength(2);
    const [head, tail] = out.clips;
    expect(head.id).toBe("c"); // head keeps the original id + paragraphId
    expect(head).toMatchObject({ startMs: 0, durationMs: 300, inPointMs: 0 });
    expect(head.caption!.words).toEqual([{ word: "hello", startMs: 0, endMs: 300 }]);
    expect(tail).toMatchObject({ startMs: 300, durationMs: 400, inPointMs: 500 });
    expect(tail.paragraphId).toBe("c"); // tail stays in the same paragraph
    expect(tail.caption!.words).toEqual([{ word: "world", startMs: 0, endMs: 400 }]);
    expect(out.durationMs).toBe(700);
  });

  it("ripples clips after the cut left by the span length", () => {
    const a = beat("a", { startMs: 0, durationMs: 1000, words: words(["x", 0, 1000]) });
    const b = beat("b", { startMs: 1000, durationMs: 1000, words: words(["y", 0, 1000]) });
    const out = rippleDeleteRange([a, b], 200, 500); // span 300
    expect(out.clips.find((c) => c.id === "b")!.startMs).toBe(700);
    expect(out.durationMs).toBe(1700);
  });

  it("drops a fully-covered clip", () => {
    const c = beat("c", { startMs: 0, durationMs: 500, words: words(["x", 0, 500]) });
    const out = rippleDeleteRange([c], 0, 500);
    expect(out.clips).toHaveLength(0);
    expect(out.durationMs).toBe(0);
  });
});

describe("relabelWord", () => {
  it("rewrites a word's text without changing its timing or duration", () => {
    const c = beat("c", {
      startMs: 0,
      durationMs: 900,
      words: words(["helo", 0, 300], ["world", 300, 900])
    });
    const out = relabelWord([c], "c", 0, "hello");
    expect(out[0].caption!.words[0]).toEqual({ word: "hello", startMs: 0, endMs: 300 });
    expect(out[0].durationMs).toBe(900);
  });
});

describe("resolveSelectionRange", () => {
  const a = beat("a", {
    startMs: 0,
    durationMs: 900,
    words: words(["hello", 0, 300], ["um", 300, 500], ["world", 500, 900])
  });
  const doc = buildTranscriptDoc([a]);

  it("resolves a collapsed selection to one word's span", () => {
    const range = resolveSelectionRange(
      doc,
      { clipId: "a", wordIndex: 1 },
      { clipId: "a", wordIndex: 1 }
    );
    expect(range).toMatchObject({ startMs: 300, endMs: 500 });
    expect(range!.tokens.map((t) => t.text)).toEqual(["um"]);
  });

  it("normalizes reversed endpoints", () => {
    const range = resolveSelectionRange(
      doc,
      { clipId: "a", wordIndex: 2 },
      { clipId: "a", wordIndex: 0 }
    );
    expect(range).toMatchObject({ startMs: 0, endMs: 900 });
    expect(range!.tokens.map((t) => t.text)).toEqual(["hello", "um", "world"]);
  });

  it("returns null when an endpoint is gone", () => {
    expect(
      resolveSelectionRange(
        doc,
        { clipId: "a", wordIndex: 0 },
        { clipId: "missing", wordIndex: 0 }
      )
    ).toBeNull();
  });
});

// ── Reconcile (freeform edit → media) ────────────────────────────────────────

describe("reconcileTranscript", () => {
  const make = () =>
    beat("c", {
      startMs: 0,
      durationMs: 900,
      words: words(["a", 0, 300], ["b", 300, 600], ["c", 600, 900])
    });

  it("relabels words whose text changed, without moving media", () => {
    const out = reconcileTranscript([make()], [
      { clipId: "c", wordIndex: 0, text: "A" },
      { clipId: "c", wordIndex: 1, text: "b" },
      { clipId: "c", wordIndex: 2, text: "c" }
    ]);
    expect(out.clips[0].caption!.words.map((w) => w.word)).toEqual(["A", "b", "c"]);
    expect(out.durationMs).toBe(900);
  });

  it("ripple-cuts words deleted from the text", () => {
    const out = reconcileTranscript([make()], [
      { clipId: "c", wordIndex: 0, text: "a" },
      { clipId: "c", wordIndex: 2, text: "c" }
    ]);
    const texts = buildTranscriptDoc(out.clips)
      .segments.flatMap((s) => s.tokens)
      .map((t) => t.text);
    expect(texts).toEqual(["a", "c"]);
    expect(out.durationMs).toBe(600);
  });

  it("relabels and cuts in the same edit", () => {
    const out = reconcileTranscript([make()], [
      { clipId: "c", wordIndex: 0, text: "AA" },
      { clipId: "c", wordIndex: 2, text: "c" }
    ]);
    const texts = buildTranscriptDoc(out.clips)
      .segments.flatMap((s) => s.tokens)
      .map((t) => t.text);
    expect(texts).toEqual(["AA", "c"]);
  });
});

describe("applyEditorEdits", () => {
  it("creates a draft beat from a newly-typed line", () => {
    const out = applyEditorEdits(
      [],
      { survivors: [], draftUpdates: [], newDraftTexts: ["hello world"] },
      "audio"
    );
    expect(out.clips).toHaveLength(1);
    expect(out.clips[0]).toMatchObject({
      bindingKind: "text-to-audio",
      prompt: "hello world",
      status: "draft",
      trackId: "audio"
    });
  });

  it("updates a kept draft and removes a draft whose text is gone", () => {
    const d1 = beat("d1", { prompt: "one" });
    const d2 = beat("d2", { prompt: "two" });
    const out = applyEditorEdits(
      [d1, d2],
      { survivors: [], draftUpdates: [{ clipId: "d1", text: "ONE" }], newDraftTexts: [] },
      "audio"
    );
    expect(out.clips.find((c) => c.id === "d1")?.prompt).toBe("ONE");
    expect(out.clips.find((c) => c.id === "d2")).toBeUndefined();
  });

  it("reconciles voiced words alongside drafts", () => {
    const v = beat("v", {
      startMs: 0,
      durationMs: 600,
      words: words(["a", 0, 300], ["b", 300, 600])
    });
    const out = applyEditorEdits(
      [v],
      { survivors: [{ clipId: "v", wordIndex: 0, text: "a" }], draftUpdates: [], newDraftTexts: [] },
      "audio"
    );
    const texts = buildTranscriptDoc(out.clips)
      .segments.flatMap((s) => s.tokens)
      .map((t) => t.text);
    expect(texts).toEqual(["a"]);
  });
});

// ── Move (cut / paste) ───────────────────────────────────────────────────────

describe("cutWordRange", () => {
  it("removes a span (ripple) and returns it as a 0-based block", () => {
    const c = beat("c", {
      startMs: 0,
      durationMs: 900,
      words: words(["a", 0, 300], ["b", 300, 600], ["c", 600, 900])
    });
    const cut = cutWordRange([c], 300, 600); // cut "b"
    expect(cut.extracted).toHaveLength(1);
    expect(cut.extracted[0]).toMatchObject({
      startMs: 0,
      durationMs: 300,
      inPointMs: 300
    });
    expect(cut.extracted[0].caption!.words).toEqual([
      { word: "b", startMs: 0, endMs: 300 }
    ]);
    // What remains reads "a c" and the gap is closed.
    const texts = buildTranscriptDoc(cut.clips)
      .segments.flatMap((s) => s.tokens)
      .map((t) => t.text);
    expect(texts).toEqual(["a", "c"]);
    expect(cut.durationMs).toBe(600);
  });
});

describe("pasteClipsAt", () => {
  it("opens a gap at the target and drops the block in", () => {
    const c = beat("c", {
      startMs: 0,
      durationMs: 600,
      words: words(["a", 0, 300], ["b", 300, 600])
    });
    const block = [
      beat("x", {
        startMs: 0,
        durationMs: 300,
        words: words(["x", 0, 300]),
        paragraphId: "px"
      })
    ];
    const out = pasteClipsAt([c], 300, block);
    const xClip = out.clips.find((cl) => cl.caption?.words[0]?.word === "x")!;
    expect(xClip.startMs).toBe(300);
    expect(out.durationMs).toBe(900);
  });
});

// ── Filler words ─────────────────────────────────────────────────────────────

describe("filler words", () => {
  it("recognizes non-lexical fillers, ignoring case and trailing punctuation", () => {
    expect(isFillerWord("um")).toBe(true);
    expect(isFillerWord("Uh,")).toBe(true);
    expect(isFillerWord("world")).toBe(false);
    expect(isFillerWord("like")).toBe(false); // deliberately not a default filler
  });

  it("classifies filler tokens in the projection", () => {
    const c = beat("c", {
      startMs: 0,
      durationMs: 500,
      words: words(["um", 0, 200], ["hi", 200, 500])
    });
    const tokens = buildTranscriptDoc([c]).segments[0].tokens;
    expect(tokens.find((t) => t.text === "um")!.kind).toBe("filler");
    expect(tokens.find((t) => t.text === "hi")!.kind).toBe("word");
  });

  it("ripple-cuts every filler in one pass, keeping the rest in order", () => {
    const c = beat("c", {
      startMs: 0,
      durationMs: 1200,
      words: words(
        ["um", 0, 200],
        ["okay", 200, 500],
        ["uh", 500, 700],
        ["sure", 700, 1200]
      )
    });
    const out = removeFillers([c]);
    const texts = buildTranscriptDoc(out.clips)
      .segments.flatMap((s) => s.tokens)
      .map((t) => t.text);
    expect(texts).toEqual(["okay", "sure"]);
    expect(out.durationMs).toBe(800);
  });
});

// ── Migration ────────────────────────────────────────────────────────────────

describe("migrateTranscriptToClips", () => {
  const audioClip = (id: string, prompt?: string): TimelineClip =>
    makeClip({
      id,
      trackId: "audio",
      mediaType: "audio",
      bindingKind: "text-to-audio",
      durationMs: 1000,
      prompt,
      status: "generated",
      currentAssetId: `${id}-asset`
    });

  const captionClip = (id: string, ws: CaptionWord[]): TimelineClip =>
    makeClip({
      id,
      trackId: "subtitle",
      mediaType: "overlay",
      durationMs: 1000,
      caption: { words: ws }
    });

  it("folds caption words onto the voiceover clip and drops the caption clip", () => {
    const aud = audioClip("a-aud");
    const cap = captionClip("a-cap", words(["hello", 0, 300]));
    const line: TranscriptLine = {
      id: "l",
      text: "hello",
      beatStartMs: 0,
      clipIds: ["a-aud", "a-cap"]
    };
    const out = migrateTranscriptToClips([line], [aud, cap], "audio");
    expect(out.find((c) => c.id === "a-cap")).toBeUndefined();
    const merged = out.find((c) => c.id === "a-aud")!;
    expect(merged.caption?.words).toEqual(words(["hello", 0, 300]));
    expect(merged.paragraphId).toBe("a-aud");
  });

  it("preserves the authored text as the prompt when the clip lacks one", () => {
    const aud = audioClip("a-aud"); // no prompt
    const cap = captionClip("a-cap", words(["hi", 0, 200]));
    const line: TranscriptLine = {
      id: "l",
      text: "hi there",
      beatStartMs: 0,
      clipIds: ["a-aud", "a-cap"]
    };
    const out = migrateTranscriptToClips([line], [aud, cap], "audio");
    expect(out.find((c) => c.id === "a-aud")!.prompt).toBe("hi there");
  });

  it("creates a draft beat for a typed line that was never voiced", () => {
    const line: TranscriptLine = {
      id: "l",
      text: "unspoken",
      beatStartMs: 2000,
      clipIds: []
    };
    const out = migrateTranscriptToClips([line], [], "audio");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      trackId: "audio",
      mediaType: "audio",
      bindingKind: "text-to-audio",
      prompt: "unspoken",
      startMs: 2000,
      status: "draft"
    });
    // A created draft beat is its own paragraph.
    expect(out[0].paragraphId).toBe(out[0].id);
  });

  it("is a no-op for an empty transcript", () => {
    const clips = [audioClip("a-aud")];
    expect(migrateTranscriptToClips([], clips, "audio")).toBe(clips);
  });

  it("keeps the voiceover clip when it carries the caption itself", () => {
    // The audio clip already has caption words (clip-sourced model). It must
    // not be mistaken for a redundant caption clip and removed.
    const aud: TimelineClip = {
      ...audioClip("a-aud", "hello"),
      caption: { words: words(["hello", 0, 300]) }
    };
    const line: TranscriptLine = {
      id: "l",
      text: "hello",
      beatStartMs: 0,
      clipIds: ["a-aud"]
    };
    const out = migrateTranscriptToClips([line], [aud], "audio");
    expect(out).toHaveLength(1);
    const kept = out.find((c) => c.id === "a-aud")!;
    expect(kept.mediaType).toBe("audio");
    expect(kept.caption?.words).toEqual(words(["hello", 0, 300]));
  });
});
