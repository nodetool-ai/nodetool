/**
 * Behavior tests for the script node family (LoadScriptNode, VoiceScriptNode,
 * ScriptToTimelineNode). child_process is mocked so ffprobe answers a fixed
 * duration; the ProcessingContext is stubbed with in-memory script/timeline
 * stores and a fake streaming-TTS provider.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseWavBytes, readWavHeader } from "@nodetool-ai/audio-nodes";
import type { ScriptDocumentSchema } from "@nodetool-ai/protocol/api-schemas/scripts.js";

function mockResponse(cmd: string): { stdout: string; stderr: string } {
  if (cmd === "ffprobe") {
    return { stdout: "1.5\n", stderr: "" };
  }
  return { stdout: "", stderr: "" };
}

vi.mock("node:child_process", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  const mockExecFile = (
    cmd: string,
    _args: string[],
    optionsOrCb: unknown,
    maybeCb?: unknown
  ) => {
    const cb =
      typeof optionsOrCb === "function"
        ? (optionsOrCb as (e: Error | null, o: string, s: string) => void)
        : typeof maybeCb === "function"
          ? (maybeCb as (e: Error | null, o: string, s: string) => void)
          : null;
    if (cb) {
      const resp = mockResponse(cmd);
      cb(null, resp.stdout, resp.stderr);
    }
  };
  (mockExecFile as any)[Symbol.for("nodejs.util.promisify.custom")] = (
    cmd: string
  ): Promise<{ stdout: string; stderr: string }> =>
    Promise.resolve(mockResponse(cmd));
  return { ...original, execFile: mockExecFile };
});

const {
  LoadScriptNode,
  VoiceScriptNode,
  ScriptToTimelineNode,
  ScriptToSubtitlesNode
} = await import("../src/nodes/script.js");

const VOICE = { provider: "openai", model: "tts-1", voice: "alloy" };

function baseScript(): {
  id: string;
  projectId: string;
  name: string;
  updatedAt: string;
  timelineId?: string;
  document: ScriptDocumentSchema;
} {
  return {
    id: "script-1",
    projectId: "default",
    name: "My script",
    updatedAt: "revision-0",
    timelineId: undefined as string | undefined,
    document: {
      cast: [{ id: "spk-1", name: "Narrator", voice: VOICE }],
      sections: [
        {
          id: "sec-1",
          lines: [
            {
              id: "line-1",
              speakerId: "spk-1",
              text: "Hello there.",
              takes: [],
              currentTakeId: null as string | null
            },
            {
              id: "line-2",
              speakerId: "spk-1",
              text: "Welcome.",
              takes: [],
              currentTakeId: null as string | null
            }
          ]
        }
      ]
    }
  };
}

function stubContext(script: ReturnType<typeof baseScript> | null) {
  const timelines: Record<string, any> = {};
  let revision = 0;
  return {
    _timelines: timelines,
    getScript: vi.fn(async () => structuredClone(script)),
    updateScript: vi.fn(
      async (
        _id: string,
        patch: {
          document?: ScriptDocumentSchema;
          timelineId?: string;
          baseUpdatedAt?: string;
        }
      ) => {
        if (
          script &&
          patch.baseUpdatedAt &&
          patch.baseUpdatedAt !== script.updatedAt
        )
          return null;
        if (script && patch.document)
          script.document = structuredClone(patch.document);
        if (script && patch.timelineId !== undefined)
          script.timelineId = patch.timelineId;
        if (script) script.updatedAt = `revision-${++revision}`;
        return structuredClone(script);
      }
    ),
    createAsset: vi.fn(async (_args: { content: Uint8Array }) => ({
      id: `asset-${Math.random()}`
    })),
    providerSupportsStreamingTTS: vi.fn(async () => true),
    streamProviderPrediction: vi.fn(async function* (_request: {
      params: { text: string };
    }): AsyncGenerator<{ samples?: Int16Array; sampleRate?: number }> {
      yield { samples: new Int16Array([1, 2, 3, 4]), sampleRate: 24000 };
    }),
    textToSpeechEncoded: vi.fn(async () => null),
    getTimelineSequence: vi.fn(async (id: string) => timelines[id] ?? null),
    createTimelineSequence: vi.fn(async (seq: { id: string }) => {
      timelines[seq.id] = seq;
      return seq;
    }),
    updateTimelineSequence: vi.fn(async (id: string, seq: unknown) => {
      timelines[id] = seq;
      return { id };
    })
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LoadScriptNode", () => {
  it("joins line texts and reports the count", async () => {
    const context = stubContext(baseScript());
    const node = new LoadScriptNode();
    node.assign({ script: { type: "script", id: "script-1" } });
    const result = (await node.process(context as never)) as {
      text: string;
      lines: string[];
      name: string;
      line_count: number;
    };
    expect(result.lines).toEqual(["Hello there.", "Welcome."]);
    expect(result.text).toBe("Hello there.\nWelcome.");
    expect(result.name).toBe("My script");
    expect(result.line_count).toBe(2);
  });

  it("throws when the script input is empty", async () => {
    const node = new LoadScriptNode();
    node.assign({ script: { type: "script", id: null } });
    await expect(node.process(stubContext(null) as never)).rejects.toThrow(
      /Script input is empty/
    );
  });
});

describe("VoiceScriptNode", () => {
  it("retries a take attachment after a revision conflict while preserving concurrent text edits", async () => {
    const script = baseScript();
    script.document.sections[0].lines.splice(1);
    const context = stubContext(script);
    const save = context.updateScript.getMockImplementation()!;
    context.updateScript.mockImplementationOnce(async () => {
      script.name = "Renamed concurrently";
      script.document.sections[0].lines[0].text = "Edited concurrently.";
      script.updatedAt = "concurrent-revision";
      return null;
    });
    context.updateScript.mockImplementation(save);
    const node = new VoiceScriptNode({
      script: { type: "script", id: "script-1" }
    });

    expect((await node.process(context as never)).voiced_count).toBe(1);
    const persisted = (await context.getScript())!;
    const line = persisted.document.sections[0].lines[0];
    expect(persisted.name).toBe("Renamed concurrently");
    expect(line.text).toBe("Edited concurrently.");
    expect(line.takes).toHaveLength(1);
    expect(line.takes[0].textSnapshot).toBe("Hello there.");
    expect(line.currentTakeId).toBe(line.takes[0].id);
    expect(context.streamProviderPrediction).toHaveBeenCalledTimes(1);
    expect(context.createAsset).toHaveBeenCalledTimes(1);
    expect(context.updateScript).toHaveBeenCalledTimes(2);
    expect(context.updateScript.mock.calls[1][1].baseUpdatedAt).toBe(
      "concurrent-revision"
    );
    expect(
      context.updateScript.mock.calls[0][1].document!.sections[0].lines[0]
        .takes[0]
    ).toEqual(
      context.updateScript.mock.calls[1][1].document!.sections[0].lines[0]
        .takes[0]
    );
  });

  it("preserves an unrelated line edit made during synthesis", async () => {
    const script = baseScript();
    const context = stubContext(script);
    context.streamProviderPrediction.mockImplementationOnce(async function* () {
      script.document.sections[0].lines[1].text =
        "An unrelated concurrent edit.";
      script.document.sections[0].lines[1].direction = "Whisper softly";
      script.updatedAt = "concurrent-edit";
      yield { samples: new Int16Array([1, 2]), sampleRate: 24000 };
    });
    const node = new VoiceScriptNode({
      script: { type: "script", id: "script-1" }
    });
    expect((await node.process(context as never)).voiced_count).toBe(2);
    const persisted = (await context.getScript())!;
    expect(persisted.document.sections[0].lines[1].text).toBe(
      "An unrelated concurrent edit."
    );
    expect(persisted.document.sections[0].lines[1].direction).toBe(
      "Whisper softly"
    );
    expect(
      persisted.document.sections[0].lines.map((line) => line.takes.length)
    ).toEqual([1, 1]);
    expect(context.streamProviderPrediction).toHaveBeenCalledTimes(2);
  });

  it("does not duplicate a take when a successful write is followed by a conflict result", async () => {
    const script = baseScript();
    script.document.sections[0].lines.splice(1);
    const context = stubContext(script);
    const save = context.updateScript.getMockImplementation()!;
    context.updateScript.mockImplementationOnce(async (id, patch) => {
      await save(id, patch);
      return null;
    });
    const node = new VoiceScriptNode({
      script: { type: "script", id: "script-1" }
    });
    expect((await node.process(context as never)).voiced_count).toBe(1);
    expect(
      (await context.getScript())!.document.sections[0].lines[0].takes
    ).toHaveLength(1);
    expect(context.streamProviderPrediction).toHaveBeenCalledTimes(1);
    expect(context.createAsset).toHaveBeenCalledTimes(1);
    expect(context.updateScript).toHaveBeenCalledTimes(1);
  });

  it("reports the generated take and asset when its target line was deleted", async () => {
    const script = baseScript();
    const context = stubContext(script);
    context.createAsset.mockResolvedValue({ id: "recoverable-asset" });
    context.streamProviderPrediction.mockImplementationOnce(async function* () {
      script.document.sections[0].lines.shift();
      script.updatedAt = "deleted-line";
      yield { samples: new Int16Array([1, 2]), sampleRate: 24000 };
    });
    const node = new VoiceScriptNode({
      script: { type: "script", id: "script-1" }
    });
    await expect(node.process(context as never)).rejects.toThrow(
      /could not attach take take_[a-f0-9-]+ \(asset recoverable-asset\) to line line-1 in script script-1: Line line-1 is no longer/
    );
    expect((await context.getScript())!.document.sections[0].lines[0].id).toBe(
      "line-2"
    );
    expect(
      (await context.getScript())!.document.sections[0].lines[0].takes
    ).toEqual([]);
    expect(context.updateScript).not.toHaveBeenCalled();
    expect(context.streamProviderPrediction).toHaveBeenCalledTimes(1);
  });

  it("bounds persistence retries and reports asset recovery information on repeated conflicts", async () => {
    const script = baseScript();
    const context = stubContext(script);
    context.createAsset.mockResolvedValue({ id: "recoverable-asset" });
    context.updateScript.mockResolvedValue(null);
    const node = new VoiceScriptNode({
      script: { type: "script", id: "script-1" }
    });
    await expect(node.process(context as never)).rejects.toThrow(
      /could not attach take take_[a-f0-9-]+ \(asset recoverable-asset\).*modified concurrently/
    );
    expect(context.updateScript).toHaveBeenCalledTimes(2);
    expect(context.createAsset).toHaveBeenCalledTimes(1);
    expect(context.streamProviderPrediction).toHaveBeenCalledTimes(1);
    expect(
      (await context.getScript())!.document.sections[0].lines[0].takes
    ).toEqual([]);
  });

  it("retains earlier takes when a later line fails and skips them on retry", async () => {
    const script = baseScript();
    const context = stubContext(script);
    const providerTexts: string[] = [];
    context.streamProviderPrediction.mockImplementation(
      async function* (request: { params: { text: string } }) {
        providerTexts.push(request.params.text);
        if (request.params.text === "Welcome.")
          throw new Error("Injected second-line provider failure");
        yield { samples: new Int16Array([1, 2]), sampleRate: 24000 };
      }
    );
    const node = new VoiceScriptNode({
      script: { type: "script", id: "script-1" }
    });
    await expect(node.process(context as never)).rejects.toThrow(
      "Injected second-line provider failure"
    );
    const persisted = await context.getScript();
    const first = persisted!.document.sections[0].lines[0];
    expect(first.takes).toHaveLength(1);
    expect(first.takes[0].assetId).toMatch(/^asset-/);
    expect(first.currentTakeId).toBe(first.takes[0].id);

    context.streamProviderPrediction.mockImplementation(
      async function* (request: { params: { text: string } }) {
        providerTexts.push(request.params.text);
        yield { samples: new Int16Array([3, 4]), sampleRate: 24000 };
      }
    );
    expect((await node.process(context as never)).voiced_count).toBe(1);
    expect(providerTexts).toEqual(["Hello there.", "Welcome.", "Welcome."]);
    expect(
      (await context.getScript())!.document.sections[0].lines[0].takes
    ).toEqual(first.takes);
    expect(context.createAsset).toHaveBeenCalledTimes(2);
  });

  it.each([0, -1, NaN, Infinity, 24000.5])(
    "rejects supplied invalid PCM sample rate %s",
    async (sampleRate) => {
      const context = stubContext(baseScript());
      context.streamProviderPrediction.mockImplementation(async function* () {
        yield { samples: new Int16Array([0]), sampleRate };
      });
      const node = new VoiceScriptNode({
        script: { type: "script", id: "script-1" }
      });
      await expect(node.process(context as never)).rejects.toThrow(
        /invalid.*sample rate/i
      );
      expect(context.createAsset).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["empty stream", []],
    ["metadata-only stream", [{ sampleRate: 24000 }]],
    [
      "zero-length PCM chunk",
      [{ samples: new Int16Array(), sampleRate: 24000 }]
    ]
  ])(
    "rejects an empty TTS stream before WAV wrapping: %s",
    async (_name, pieces) => {
      const script = baseScript();
      script.document.sections[0].lines.splice(1);
      const context = stubContext(script);
      context.streamProviderPrediction.mockImplementation(async function* () {
        yield* pieces;
      });
      const node = new VoiceScriptNode({
        script: { type: "script", id: "script-1" }
      });

      await expect(node.process(context as never)).rejects.toThrow(
        /no audio samples/i
      );
      expect(context.createAsset).not.toHaveBeenCalled();
      expect(context.updateScript).not.toHaveBeenCalled();
      expect(script.document.sections[0].lines[0].takes).toEqual([]);
      expect(script.document.sections[0].lines[0].currentTakeId).toBeNull();

      context.streamProviderPrediction.mockImplementation(async function* () {
        yield { samples: new Int16Array([0, 0]), sampleRate: 24000 };
      });
      expect((await node.process(context as never)).voiced_count).toBe(1);
    }
  );

  it("keeps nonempty silent PCM as playable samples", async () => {
    const script = baseScript();
    script.document.sections[0].lines.splice(1);
    const context = stubContext(script);
    context.streamProviderPrediction.mockImplementation(async function* () {
      yield { samples: new Int16Array(240), sampleRate: 24000 };
    });
    const savedAudio: Uint8Array[] = [];
    context.createAsset.mockImplementation(
      async (args: { content: Uint8Array }) => {
        savedAudio.push(args.content);
        return { id: "silent-asset" };
      }
    );
    const node = new VoiceScriptNode({
      script: { type: "script", id: "script-1" }
    });
    expect((await node.process(context as never)).voiced_count).toBe(1);
    expect(readWavHeader(savedAudio[0])?.dataSize).toBe(480);
    expect(parseWavBytes(savedAudio[0])?.samples).toEqual(
      new Float32Array(240)
    );
  });

  it("voices every draft line and saves takes back to the script", async () => {
    const script = baseScript();
    const context = stubContext(script);
    const node = new VoiceScriptNode();
    node.assign({ script: { type: "script", id: "script-1" } });

    const result = (await node.process(context as never)) as {
      output: { type: string; id: string };
      voiced_count: number;
    };

    expect(result.voiced_count).toBe(2);
    expect(result.output).toMatchObject({ type: "script", id: "script-1" });
    expect(context.createAsset).toHaveBeenCalledTimes(2);
    expect(context.updateScript).toHaveBeenCalledTimes(2);
    expect(context.updateScript).toHaveBeenNthCalledWith(
      1,
      "script-1",
      expect.objectContaining({ baseUpdatedAt: "revision-0" })
    );
    expect(context.updateScript).toHaveBeenNthCalledWith(
      2,
      "script-1",
      expect.objectContaining({ baseUpdatedAt: "revision-1" })
    );
    const lines = script.document.sections[0].lines;
    expect(lines[0].takes).toHaveLength(1);
    expect(lines[0].currentTakeId).toBe(lines[0].takes[0].id);
    // Duration comes from the mocked ffprobe (1.5s).
    expect(lines[0].takes[0].durationMs).toBe(1500);
    expect(lines[0].takes[0].textSnapshot).toBe("Hello there.");
  });

  it("skips up-to-date lines on a second run", async () => {
    const script = baseScript();
    const context = stubContext(script);
    const node = new VoiceScriptNode();
    node.assign({ script: { type: "script", id: "script-1" } });
    await node.process(context as never);

    vi.clearAllMocks();
    const result = (await node.process(context as never)) as {
      voiced_count: number;
    };
    expect(result.voiced_count).toBe(0);
    expect(context.createAsset).not.toHaveBeenCalled();
  });

  it("skips lines with no voice", async () => {
    const script = baseScript();
    script.document.cast[0].voice = undefined as never;
    const context = stubContext(script);
    const node = new VoiceScriptNode();
    node.assign({ script: { type: "script", id: "script-1" } });
    const result = (await node.process(context as never)) as {
      voiced_count: number;
    };
    expect(result.voiced_count).toBe(0);
  });
});

describe("ScriptToTimelineNode", () => {
  it("assembles voiced takes into a new voiceover sequence", async () => {
    const script = baseScript();
    // Pre-voice both lines.
    for (const line of script.document.sections[0].lines) {
      const take = {
        id: `take-${line.id}`,
        assetId: `asset-${line.id}`,
        durationMs: 2000,
        words: [],
        textSnapshot: line.text,
        voiceSnapshot: VOICE,
        createdAt: "2026-01-01T00:00:00.000Z"
      };
      line.takes = [take];
      line.currentTakeId = take.id;
    }
    const context = stubContext(script);
    const node = new ScriptToTimelineNode();
    node.assign({ script: { type: "script", id: "script-1" } });

    const result = (await node.process(context as never)) as {
      output: { type: string; id: string };
    };

    expect(result.output.type).toBe("timeline");
    expect(context.createTimelineSequence).toHaveBeenCalledTimes(1);
    const saved = context.createTimelineSequence.mock.calls[0][0] as {
      tracks: Array<{ type: string; name: string }>;
      clips: Array<{
        mediaType: string;
        startMs: number;
        durationMs: number;
        scriptId: string;
        scriptLineId: string;
        currentAssetId: string;
      }>;
    };
    expect(saved.tracks[0]).toMatchObject({ type: "audio", name: "Voiceover" });
    expect(saved.clips).toHaveLength(2);
    expect(saved.clips[0]).toMatchObject({
      mediaType: "audio",
      startMs: 0,
      durationMs: 2000,
      scriptId: "script-1",
      scriptLineId: "line-1"
    });
    // Second clip laid after the first.
    expect(saved.clips[1].startMs).toBe(2000);
    // The script gets linked to the new sequence.
    expect(context.updateScript).toHaveBeenCalledWith(
      "script-1",
      expect.objectContaining({ timelineId: expect.any(String) })
    );
  });

  it("throws when no lines are voiced", async () => {
    const context = stubContext(baseScript());
    const node = new ScriptToTimelineNode();
    node.assign({ script: { type: "script", id: "script-1" } });
    await expect(node.process(context as never)).rejects.toThrow(
      /no voiced lines/
    );
  });
});

describe("ScriptToSubtitlesNode", () => {
  function voicedScript() {
    const script = baseScript();
    const lines = script.document.sections[0].lines;
    lines[0].takes = [
      {
        id: "take-1",
        assetId: "asset-1",
        durationMs: 1500,
        words: [
          { word: "Hello", startMs: 0, endMs: 700 },
          { word: "there.", startMs: 800, endMs: 1400 }
        ],
        textSnapshot: lines[0].text,
        voiceSnapshot: VOICE,
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ];
    lines[0].currentTakeId = "take-1";
    lines[0].pauseAfterMs = 500;
    lines[1].takes = [
      {
        id: "take-2",
        assetId: "asset-2",
        durationMs: 1000,
        words: [],
        textSnapshot: lines[1].text,
        voiceSnapshot: VOICE,
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ];
    lines[1].currentTakeId = "take-2";
    return script;
  }

  it("exports SRT line cues offset by durations and pauses", async () => {
    const context = stubContext(voicedScript());
    const node = new ScriptToSubtitlesNode();
    node.assign({ script: { type: "script", id: "script-1" } });
    const result = (await node.process(context as never)) as {
      subtitles: string;
      cue_count: number;
    };
    expect(result.cue_count).toBe(2);
    expect(result.subtitles).toBe(
      "1\n00:00:00,000 --> 00:00:01,500\nHello there.\n\n" +
        "2\n00:00:02,000 --> 00:00:03,000\nWelcome.\n"
    );
  });

  it("exports WebVTT word cues from take word timings", async () => {
    const context = stubContext(voicedScript());
    const node = new ScriptToSubtitlesNode();
    node.assign({
      script: { type: "script", id: "script-1" },
      format: "vtt",
      granularity: "word"
    });
    const result = (await node.process(context as never)) as {
      subtitles: string;
      cue_count: number;
    };
    // Two timed words on line 1, line 2 falls back to one line cue.
    expect(result.cue_count).toBe(3);
    expect(result.subtitles.startsWith("WEBVTT")).toBe(true);
    expect(result.subtitles).toContain("00:00:00.000 --> 00:00:00.700\nHello");
    expect(result.subtitles).toContain("00:00:00.800 --> 00:00:01.400\nthere.");
  });

  it("throws when no lines are voiced", async () => {
    const context = stubContext(baseScript());
    const node = new ScriptToSubtitlesNode();
    node.assign({ script: { type: "script", id: "script-1" } });
    await expect(node.process(context as never)).rejects.toThrow(
      /no voiced lines/
    );
  });
});
