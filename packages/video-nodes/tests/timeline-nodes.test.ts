/**
 * Behavior tests for timeline nodes (RenderTimelineNode,
 * TimelineTranscriptNode, AddClipsToTimelineNode). child_process is mocked:
 * ffprobe answers duration/stream queries and the ffmpeg mock writes its
 * output file, so the full render pipeline runs without ffmpeg installed.
 *
 * RenderTimeline's compositor is forced unavailable here, pinning these cases
 * to the rough-cut fallback they assert on — otherwise what they exercise
 * would depend on whether the host happens to have a GPU. The composited path
 * is covered by `timeline-composite.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fsSync from "node:fs";

let execFileCalls: Array<{ cmd: string; args: string[] }> = [];

function mockResponse(
  cmd: string,
  args: string[]
): { stdout: string; stderr: string } {
  if (cmd === "ffprobe") {
    const argsStr = args.join(" ");
    if (argsStr.includes("codec_type")) {
      return { stdout: "audio\n", stderr: "" };
    }
    if (argsStr.includes("format=duration")) {
      return { stdout: "10.5\n", stderr: "" };
    }
    return { stdout: "", stderr: "" };
  }
  // ffmpeg — write the output file (last argument) so downstream reads work.
  const outputPath = args[args.length - 1];
  fsSync.writeFileSync(outputPath, Buffer.from(`fake:${outputPath}`));
  return { stdout: "", stderr: "" };
}

vi.mock("node:child_process", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  const mockExecFile = (
    cmd: string,
    args: string[],
    optionsOrCb: unknown,
    maybeCb?: unknown
  ) => {
    execFileCalls.push({ cmd, args: [...args] });
    const cb =
      typeof optionsOrCb === "function"
        ? (optionsOrCb as (e: Error | null, o: string, s: string) => void)
        : typeof maybeCb === "function"
          ? (maybeCb as (e: Error | null, o: string, s: string) => void)
          : null;
    if (cb) {
      try {
        const resp = mockResponse(cmd, args);
        cb(null, resp.stdout, resp.stderr);
      } catch (err) {
        cb(err as Error, "", "");
      }
    }
  };
  (mockExecFile as any)[Symbol.for("nodejs.util.promisify.custom")] = (
    cmd: string,
    args: string[]
  ): Promise<{ stdout: string; stderr: string }> => {
    execFileCalls.push({ cmd, args: [...args] });
    try {
      return Promise.resolve(mockResponse(cmd, args));
    } catch (err) {
      return Promise.reject(err);
    }
  };
  return { ...original, execFile: mockExecFile };
});

vi.mock("../src/nodes/timeline/compositeRender.js", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  const { CompositorUnavailableError } = original as {
    CompositorUnavailableError: new (cause: unknown) => Error;
  };
  return {
    ...original,
    renderTimelineComposited: () => {
      throw new CompositorUnavailableError(new Error("no adapter in tests"));
    }
  };
});

const {
  RenderTimelineNode,
  TimelineTranscriptNode,
  AddClipsToTimelineNode,
  extractedAudioLinkIds
} = await import("../src/nodes/timeline.js");

function ffmpegArgString(): string {
  return execFileCalls
    .filter((c) => c.cmd === "ffmpeg")
    .map((c) => c.args.join(" "))
    .join("\n");
}

function baseSequence() {
  return {
    id: "seq-1",
    projectId: "default",
    name: "My cut",
    fps: 30,
    width: 1280,
    height: 720,
    durationMs: 5000,
    tracks: [
      { id: "t-video", name: "Video", type: "video", index: 0, visible: true, locked: false },
      { id: "t-audio", name: "Audio", type: "audio", index: 1, visible: true, locked: false }
    ],
    clips: [
      {
        id: "c1",
        trackId: "t-video",
        name: "Shot 1",
        startMs: 0,
        durationMs: 2000,
        mediaType: "video",
        sourceType: "imported",
        status: "generated",
        locked: false,
        versions: [],
        currentAssetId: "asset-v1"
      },
      {
        id: "c2",
        trackId: "t-video",
        name: "Still",
        startMs: 2000,
        durationMs: 3000,
        mediaType: "image",
        sourceType: "imported",
        status: "generated",
        locked: false,
        versions: [],
        currentAssetId: "asset-i1"
      },
      {
        id: "c3",
        trackId: "t-audio",
        name: "Voiceover",
        startMs: 500,
        durationMs: 4000,
        mediaType: "audio",
        sourceType: "imported",
        status: "generated",
        locked: false,
        versions: [],
        currentAssetId: "asset-a1",
        volumeDb: -3
      }
    ],
    markers: [],
    transcript: [
      { id: "tr1", text: "Hello there.", beatStartMs: 0, clipIds: [] },
      { id: "tr2", text: "Welcome to the cut.", beatStartMs: 2000, clipIds: [] }
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

function stubContext(seq: ReturnType<typeof baseSequence> | null) {
  return {
    getTimelineSequence: vi.fn(async () => seq),
    resolveAssetBytes: vi.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3, 4]),
      attempts: []
    })),
    createAsset: vi.fn(async () => ({ id: "created-asset" })),
    createTimelineSequence: vi.fn(async (s: { id: string }) => s),
    updateTimelineSequence: vi.fn(async (_id: string, s: { id: string }) => s)
  };
}

beforeEach(() => {
  execFileCalls = [];
  // The fallback logs what the rough cut drops; not the subject of these tests.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("RenderTimelineNode", () => {
  it("normalizes clips, concatenates them, and mixes audio at offsets", async () => {
    const context = stubContext(baseSequence());
    const node = new RenderTimelineNode();
    node.assign({ timeline: { type: "timeline", id: "seq-1" } });

    const result = (await node.process(context as never)) as {
      output: { type: string; format: string; data: string };
    };

    expect(result.output.type).toBe("video");
    expect(result.output.format).toBe("mp4");
    expect(result.output.data.length).toBeGreaterThan(0);

    const args = ffmpegArgString();
    // Both clips normalized to the sequence frame and fps.
    expect(args).toContain("scale=1280:720");
    expect(args).toContain("fps=30");
    // The image clip is looped for its clip duration.
    expect(args).toContain("-loop");
    // Segments are concatenated, then the audio clip is delayed and mixed.
    expect(args).toContain("concat");
    expect(args).toContain("adelay=500|500");
    expect(args).toContain("volume=-3dB");
    expect(args).toContain("amix=inputs=2");
    expect(context.resolveAssetBytes).toHaveBeenCalledTimes(3);
  });

  it("mixes a time-remapped audio clip one constant-rate stretch at a time", async () => {
    // Two source seconds in the first timeline second, then a hold: the first
    // stretch sounds at 2×, the hold is silent (nothing to advance through).
    const seq = baseSequence();
    const audio = seq.clips[2] as Record<string, unknown>;
    audio.startMs = 0;
    audio.durationMs = 2000;
    audio.timeRemap = {
      keyframes: [
        { t: 0, sourceMs: 0 },
        { t: 0.5, sourceMs: 2000 },
        { t: 1, sourceMs: 2000 }
      ]
    };
    const context = stubContext(seq);
    const node = new RenderTimelineNode();
    node.assign({ timeline: { type: "timeline", id: "seq-1" } });
    await node.process(context as never);

    const args = ffmpegArgString();
    // The curve names the source span, and atempo carries it into the
    // stretch's own timeline length.
    expect(args).toContain("atrim=start=0:end=2,asetpts=PTS-STARTPTS,atempo=2");
    expect(args).toContain("volume=-3dB");
    expect(args).toContain("adelay=0|0");
    // One stretch mixed, not two: the hold is silent.
    expect(args).toContain("[a0_0]");
    expect(args).not.toContain("[a0_1]");
    // The un-remapped chain is not used for this clip.
    expect(args).not.toContain("[a0]");
  });

  it("retimes a sped-up clip's audio instead of playing it at 1x", async () => {
    // A 2x clip consumes two source seconds per timeline second: the window is
    // twice the clip's length and atempo carries it back.
    const seq = baseSequence();
    const audio = seq.clips[2] as Record<string, unknown>;
    audio.startMs = 0;
    audio.durationMs = 1000;
    audio.speedMultiplier = 2;
    delete audio.outPointMs;
    const context = stubContext(seq);
    const node = new RenderTimelineNode();
    node.assign({ timeline: { type: "timeline", id: "seq-1" } });
    await node.process(context as never);

    const args = ffmpegArgString();
    expect(args).toContain("atrim=start=0:end=2,asetpts=PTS-STARTPTS,atempo=2");
    expect(args).toContain("adelay=0|0");
  });

  it("suppresses a linked video clip's embedded audio so only the extracted audio clip plays", async () => {
    // A video clip and its extracted audio share a linkId. The audio comes
    // from the audio-track clip (amix'd); the video's own muxed audio must NOT
    // be mapped (that would double the audio / clip).
    const seq = baseSequence();
    seq.clips = [
      {
        id: "c1",
        trackId: "t-video",
        name: "Linked shot",
        startMs: 0,
        durationMs: 2000,
        mediaType: "video",
        sourceType: "imported",
        status: "generated",
        locked: false,
        versions: [],
        currentAssetId: "asset-v1",
        linkId: "link-1"
      } as never,
      {
        id: "c2",
        trackId: "t-audio",
        name: "Extracted audio",
        startMs: 0,
        durationMs: 2000,
        mediaType: "audio",
        sourceType: "imported",
        status: "generated",
        locked: false,
        versions: [],
        currentAssetId: "asset-a1",
        linkId: "link-1"
      } as never
    ];
    const context = stubContext(seq);
    const node = new RenderTimelineNode();
    node.assign({ timeline: { type: "timeline", id: "seq-1" } });
    await node.process(context as never);

    const segmentCalls = execFileCalls.filter(
      (c) => c.cmd === "ffmpeg" && c.args.join(" ").includes("anullsrc")
    );
    // The video segment must use the silent-audio branch (anullsrc + map 1:a),
    // not its own 0:a, even though ffprobe reports the source has audio.
    const videoSegment = execFileCalls.find(
      (c) =>
        c.cmd === "ffmpeg" &&
        c.args.includes("seg_0.mp4") === false &&
        c.args.some((a) => a.endsWith("seg_0.mp4"))
    );
    expect(videoSegment).toBeTruthy();
    const vArgs = videoSegment!.args.join(" ");
    expect(vArgs).toContain("anullsrc");
    expect(vArgs).toContain("-map 1:a");
    expect(vArgs).not.toContain("-map 0:a");
    expect(segmentCalls.length).toBeGreaterThan(0);
  });

  it("keeps a standalone video clip's embedded audio when it has no linked audio", async () => {
    const seq = baseSequence();
    seq.clips = [
      {
        id: "c1",
        trackId: "t-video",
        name: "Standalone shot",
        startMs: 0,
        durationMs: 2000,
        mediaType: "video",
        sourceType: "imported",
        status: "generated",
        locked: false,
        versions: [],
        currentAssetId: "asset-v1"
      } as never
    ];
    const context = stubContext(seq);
    const node = new RenderTimelineNode();
    node.assign({ timeline: { type: "timeline", id: "seq-1" } });
    await node.process(context as never);

    const videoSegment = execFileCalls.find(
      (c) =>
        c.cmd === "ffmpeg" && c.args.some((a) => a.endsWith("seg_0.mp4"))
    );
    expect(videoSegment).toBeTruthy();
    const vArgs = videoSegment!.args.join(" ");
    // ffprobe reports audio, so its own 0:a is mapped (no silent-audio branch).
    expect(vArgs).toContain("-map 0:a");
    expect(vArgs).not.toContain("anullsrc");
  });

  it("can skip the audio mix", async () => {
    const context = stubContext(baseSequence());
    const node = new RenderTimelineNode();
    node.assign({
      timeline: { type: "timeline", id: "seq-1" },
      include_audio: false
    });
    await node.process(context as never);
    expect(ffmpegArgString()).not.toContain("amix");
  });

  it("fails clearly when the timeline has no renderable clips", async () => {
    const seq = baseSequence();
    seq.clips = [];
    const node = new RenderTimelineNode();
    node.assign({ timeline: { type: "timeline", id: "seq-1" } });
    await expect(
      node.process(stubContext(seq) as never)
    ).rejects.toThrow(/no renderable clips/);
  });

  it("fails clearly when the timeline input is empty", async () => {
    const node = new RenderTimelineNode();
    node.assign({ timeline: { type: "timeline", id: null } });
    await expect(node.process(stubContext(null) as never)).rejects.toThrow(
      /Timeline input is empty/
    );
  });
});

describe("TimelineTranscriptNode", () => {
  it("joins transcript lines into text", async () => {
    const context = stubContext(baseSequence());
    const node = new TimelineTranscriptNode();
    node.assign({ timeline: { type: "timeline", id: "seq-1" } });
    const result = (await node.process(context as never)) as {
      text: string;
      lines: string[];
    };
    expect(result.lines).toEqual(["Hello there.", "Welcome to the cut."]);
    expect(result.text).toBe("Hello there.\nWelcome to the cut.");
  });

  it("returns empty outputs for a timeline without a transcript", async () => {
    const seq = baseSequence();
    delete (seq as { transcript?: unknown }).transcript;
    const node = new TimelineTranscriptNode();
    node.assign({ timeline: { type: "timeline", id: "seq-1" } });
    const result = (await node.process(stubContext(seq) as never)) as {
      text: string;
      lines: string[];
    };
    expect(result.lines).toEqual([]);
    expect(result.text).toBe("");
  });
});

describe("AddClipsToTimelineNode", () => {
  const imageItem = {
    type: "image",
    data: Buffer.from([9, 9, 9]).toString("base64")
  };
  const videoItem = {
    type: "video",
    data: Buffer.from([8, 8, 8]).toString("base64")
  };
  const audioItem = {
    type: "audio",
    data: Buffer.from([7, 7, 7]).toString("base64")
  };

  it("creates a new timeline and appends clips per track", async () => {
    const context = stubContext(null);
    const node = new AddClipsToTimelineNode();
    node.assign({
      timeline: { type: "timeline", id: null },
      clips: [imageItem, videoItem, audioItem],
      name: "Storyboard",
      image_duration_ms: 2500
    });

    const result = (await node.process(context as never)) as {
      output: { type: string; id: string };
    };

    expect(result.output.type).toBe("timeline");
    expect(context.createTimelineSequence).toHaveBeenCalledTimes(1);
    const saved = context.createTimelineSequence.mock.calls[0][0] as {
      name: string;
      tracks: Array<{ type: string }>;
      clips: Array<{
        mediaType: string;
        startMs: number;
        durationMs: number;
        currentAssetId: string;
      }>;
      durationMs: number;
    };

    expect(saved.name).toBe("Storyboard");
    expect(saved.tracks.map((t) => t.type)).toEqual(["video", "audio"]);
    expect(saved.clips).toHaveLength(3);

    const [img, vid, aud] = saved.clips;
    // Image first on the video track, then the probed 10.5s video after it.
    expect(img).toMatchObject({ mediaType: "image", startMs: 0, durationMs: 2500 });
    expect(vid).toMatchObject({
      mediaType: "video",
      startMs: 2500,
      durationMs: 10500
    });
    // Audio starts at 0 on its own track.
    expect(aud).toMatchObject({ mediaType: "audio", startMs: 0, durationMs: 10500 });
    expect(saved.durationMs).toBe(13000);
    // Every inline media payload was persisted as an asset.
    expect(context.createAsset).toHaveBeenCalledTimes(3);
    expect(img.currentAssetId).toBe("created-asset");
  });

  it("appends to an existing timeline after its current content", async () => {
    const seq = baseSequence();
    const context = stubContext(seq);
    const node = new AddClipsToTimelineNode();
    node.assign({
      timeline: { type: "timeline", id: "seq-1" },
      clips: [imageItem],
      image_duration_ms: 1000
    });

    await node.process(context as never);

    expect(context.updateTimelineSequence).toHaveBeenCalledTimes(1);
    const [, saved] = context.updateTimelineSequence.mock.calls[0] as [
      string,
      { clips: Array<{ mediaType: string; startMs: number }> }
    ];
    const appended = saved.clips[saved.clips.length - 1];
    // Existing video track content ends at 5000ms (2000 + 3000).
    expect(appended).toMatchObject({ mediaType: "image", startMs: 5000 });
  });

  it("reuses an existing asset id without re-uploading", async () => {
    const context = stubContext(null);
    const node = new AddClipsToTimelineNode();
    node.assign({
      timeline: { type: "timeline", id: null },
      clips: [{ ...imageItem, asset_id: "already-there" }],
      name: "Reuse"
    });
    await node.process(context as never);
    expect(context.createAsset).not.toHaveBeenCalled();
    const saved = context.createTimelineSequence.mock.calls[0][0] as {
      clips: Array<{ currentAssetId: string }>;
    };
    expect(saved.clips[0].currentAssetId).toBe("already-there");
  });

  it("rejects when no usable media is given", async () => {
    const node = new AddClipsToTimelineNode();
    node.assign({ timeline: { type: "timeline", id: null }, clips: [] });
    await expect(node.process(stubContext(null) as never)).rejects.toThrow(
      /no image\/video\/audio clips/
    );
  });
});

describe("extractedAudioLinkIds", () => {
  it("collects linkIds of audio-track audio clips that carry a linkId", () => {
    const seq = baseSequence();
    seq.clips = [
      { ...seq.clips[0], trackId: "t-audio", mediaType: "audio", linkId: "L1" },
      { ...seq.clips[1], trackId: "t-audio", mediaType: "audio", linkId: "L2" }
    ] as never;
    expect(extractedAudioLinkIds(seq as never)).toEqual(
      new Set(["L1", "L2"])
    );
  });

  it("ignores audio clips without a linkId and non-audio-track clips", () => {
    const seq = baseSequence();
    seq.clips = [
      // audio on audio track but no link -> ignored
      { ...seq.clips[0], trackId: "t-audio", mediaType: "audio" },
      // video clip with a linkId on the video track -> ignored (not the audio rep)
      { ...seq.clips[0], trackId: "t-video", mediaType: "video", linkId: "L3" },
      // audio mediaType but sitting on a video track -> ignored
      { ...seq.clips[0], trackId: "t-video", mediaType: "audio", linkId: "L4" }
    ] as never;
    expect(extractedAudioLinkIds(seq as never)).toEqual(new Set());
  });

  it("includes muted/hidden linked audio clips (presence still suppresses video audio)", () => {
    const seq = baseSequence();
    seq.clips = [
      {
        ...seq.clips[0],
        trackId: "t-audio",
        mediaType: "audio",
        linkId: "L5",
        muted: true
      },
      {
        ...seq.clips[0],
        trackId: "t-audio",
        mediaType: "audio",
        linkId: "L6",
        hidden: true
      }
    ] as never;
    expect(extractedAudioLinkIds(seq as never)).toEqual(
      new Set(["L5", "L6"])
    );
  });
});

/**
 * The stored content type decides both the asset's file extension and the
 * `Content-Type` the browser is served, so a WAV voiceover labelled
 * `audio/mpeg` reaches the chat player as a `.mp3` it cannot decode. That is
 * what happened to a generated voiceover: `AddClips` labelled every audio clip
 * `audio/mpeg` regardless of the bytes.
 */
describe("AddClipsToTimelineNode clip content types", () => {
  const base64 = (bytes: number[]): string =>
    Buffer.from(bytes).toString("base64");

  const wavBytes = [
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45
  ];
  const webmBytes = [0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00, 0x00, 0x00];
  const jpegBytes = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46];

  const contentTypesFor = async (
    clips: Array<Record<string, unknown>>
  ): Promise<string[]> => {
    const context = stubContext(null);
    const node = new AddClipsToTimelineNode();
    node.assign({ timeline: { type: "timeline", id: null }, clips });
    await node.process(context as never);
    return context.createAsset.mock.calls.map(
      (call) => (call[0] as { contentType: string }).contentType
    );
  };

  it("reads the container out of the bytes instead of the media kind", async () => {
    const types = await contentTypesFor([
      { type: "audio", data: base64(wavBytes) },
      { type: "video", data: base64(webmBytes) },
      { type: "image", data: base64(jpegBytes) }
    ]);

    expect(types).toEqual(["audio/wav", "video/webm", "image/jpeg"]);
  });

  it("falls back to the source URI's extension for unrecognized bytes", async () => {
    const types = await contentTypesFor([
      { type: "audio", data: base64([1, 2, 3, 4]), uri: "https://x.test/a.ogg" }
    ]);

    expect(types).toEqual(["audio/ogg"]);
  });

  it("falls back to the media kind when nothing else says", async () => {
    const types = await contentTypesFor([
      { type: "audio", data: base64([1, 2, 3, 4]) },
      { type: "video", data: base64([1, 2, 3, 4]) }
    ]);

    expect(types).toEqual(["audio/wav", "video/mp4"]);
  });
});
