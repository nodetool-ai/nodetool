/**
 * Behavior tests for the script node family (LoadScriptNode, VoiceScriptNode,
 * ScriptToTimelineNode). child_process is mocked so ffprobe answers a fixed
 * duration; the ProcessingContext is stubbed with in-memory script/timeline
 * stores and a fake streaming-TTS provider.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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

const { LoadScriptNode, VoiceScriptNode, ScriptToTimelineNode } = await import(
  "../src/nodes/script.js"
);

const VOICE = { provider: "openai", model: "tts-1", voice: "alloy" };

function baseScript() {
  return {
    id: "script-1",
    projectId: "default",
    name: "My script",
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
              takes: [] as any[],
              currentTakeId: null as string | null
            },
            {
              id: "line-2",
              speakerId: "spk-1",
              text: "Welcome.",
              takes: [] as any[],
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
  return {
    _timelines: timelines,
    getScript: vi.fn(async () => script),
    updateScript: vi.fn(async (_id: string, patch: any) => {
      if (script && patch.document) script.document = patch.document;
      if (script && patch.timelineId !== undefined)
        script.timelineId = patch.timelineId;
      return script;
    }),
    createAsset: vi.fn(async () => ({ id: `asset-${Math.random()}` })),
    providerSupportsStreamingTTS: vi.fn(async () => true),
    streamProviderPrediction: vi.fn(async function* () {
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
    await expect(
      node.process(stubContext(null) as never)
    ).rejects.toThrow(/Script input is empty/);
  });
});

describe("VoiceScriptNode", () => {
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
    expect(context.updateScript).toHaveBeenCalledTimes(1);
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
