import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  Asset,
  ModelObserver,
  Script,
  TimelineSequence,
  initTestDb
} from "@nodetool-ai/models";
import type { ScriptLine, ScriptTake } from "@nodetool-ai/models";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { capabilityCategoryFor } from "../src/capabilities/registry.js";
import { BUILTIN_TOOL_NAMES } from "../src/tools/builtin-tools.js";

/**
 * A real 500ms mono 16-bit WAV at 8kHz. Real bytes so the duration probe has
 * something to measure: with ffprobe on PATH it reads 500ms, and without it
 * the word timings below say 500ms too — the assertion holds either way.
 */
const TAKE_MS = 500;
function wav(durationMs = TAKE_MS): Uint8Array {
  const sampleRate = 8000;
  const samples = Math.round((sampleRate * durationMs) / 1000);
  const dataBytes = samples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataBytes, true);
  return new Uint8Array(buffer);
}

const VOICE = { provider: "openai", model: "tts-1", voice: "alloy" };

interface CtxOptions {
  userId?: string;
  tts?: () => Promise<{ data: Uint8Array; mimeType: string }>;
  asrWords?: Array<{ text: string; timestamp: [number, number] }>;
  /** Error the streaming TTS fallback raises. */
  streamError?: string;
}

function ctx(options: CtxOptions = {}) {
  const stored = new Map<string, Uint8Array>();
  const textToSpeechEncoded = vi.fn(
    options.tts ?? (async () => ({ data: wav(), mimeType: "audio/wav" }))
  );
  const automaticSpeechRecognition = vi.fn(async () => ({
    text: "hello",
    chunks:
      options.asrWords ??
      ([{ text: "hello", timestamp: [0, TAKE_MS / 1000] }] as Array<{
        text: string;
        timestamp: [number, number];
      }>)
  }));
  const context = {
    userId: options.userId ?? "u1",
    getProvider: vi.fn(async () => ({
      textToSpeechEncoded,
      automaticSpeechRecognition
    })),
    hasModelInterface: (name: string) => name === "createAsset",
    createAsset: vi.fn(
      async (args: { name: string; contentType: string; content: Uint8Array }) => {
        const asset = await Asset.create<Asset>({
          user_id: "u1",
          name: args.name,
          content_type: args.contentType
        });
        stored.set(asset.id, args.content);
        return asset;
      }
    ),
    // GenerateSpeechTool falls back to the streaming path when the encoded one
    // fails, so the fake has to answer both.
    streamProviderPrediction: async function* () {
      throw new Error(options.streamError ?? "no streaming TTS in this fake");
    },
    resolveAssetBytes: vi.fn(async (uri: string) => ({
      bytes: stored.get(uri.replace("asset://", "").split(".")[0]) ?? null
    }))
  };
  return {
    context: context as unknown as ProcessingContext,
    textToSpeechEncoded,
    automaticSpeechRecognition
  };
}

const line = (overrides: Partial<ScriptLine> & { id: string }): ScriptLine => ({
  text: "A line",
  takes: [],
  ...overrides
});

const take = (overrides: Partial<ScriptTake> & { id: string }): ScriptTake => ({
  assetId: "a-old",
  durationMs: 1000,
  words: [],
  textSnapshot: "A line",
  voiceSnapshot: VOICE,
  createdAt: new Date().toISOString(),
  ...overrides
});

async function makeScript(
  lines: ScriptLine[],
  cast = [{ id: "sp1", name: "Narrator", voice: VOICE }]
): Promise<Script> {
  return Script.create<Script>({
    user_id: "u1",
    project_id: "default",
    name: "Script",
    document: JSON.stringify({
      cast,
      sections: [{ id: "sec1", title: "Main", lines }]
    })
  });
}

describe("script voice tools", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("registers as built-ins with sane permissions", () => {
    const names = BUILTIN_TOOL_NAMES;
    expect(names).toEqual(
      expect.arrayContaining([
        "list_scripts",
        "get_script",
        "voice_script_lines",
        "assemble_script_timeline"
      ])
    );
    expect(capabilityCategoryFor("get_script")).toBe("read");
    expect(capabilityCategoryFor("voice_script_lines")).toBe("write");
  });

  it("lists scripts and reports each line's voicing status", async () => {
    const row = await makeScript([
      line({ id: "l1", speakerId: "sp1", text: "Voiced", currentTakeId: "t1", takes: [take({ id: "t1", textSnapshot: "Voiced" })] }),
      line({ id: "l2", speakerId: "sp1", text: "Edited", currentTakeId: "t2", takes: [take({ id: "t2", textSnapshot: "Before the edit" })] }),
      line({ id: "l3", speakerId: "sp1", text: "Never voiced" }),
      line({ id: "l4", text: "No speaker" })
    ]);

    const listed = (await toolForCapabilityName("list_scripts").process(ctx().context, {})) as {
      scripts: Array<{ id: string; lines: number; voiced: number }>;
    };
    expect(listed.scripts[0]).toMatchObject({ id: row.id, lines: 4, voiced: 1 });

    const read = (await toolForCapabilityName("get_script").process(ctx().context, {
      script_id: row.id
    })) as { lines: Array<{ id: string; index: number; status: string }> };
    expect(read.lines.map((l) => [l.id, l.index, l.status])).toEqual([
      ["l1", 0, "voiced"],
      ["l2", 1, "stale"],
      ["l3", 2, "draft"],
      ["l4", 3, "no_voice"]
    ]);
  });

  it("hides a script owned by another user", async () => {
    const row = await makeScript([line({ id: "l1" })]);
    const result = (await toolForCapabilityName("get_script").process(
      ctx({ userId: "other" }).context,
      { script_id: row.id }
    )) as { error: string };
    expect(result.error).toContain("not found");
  });

  it("voices every line that needs it, with each line's own voice", async () => {
    const row = await makeScript([
      line({ id: "l1", speakerId: "sp1", text: "First" }),
      line({
        id: "l2",
        speakerId: "sp1",
        text: "Already done",
        currentTakeId: "t2",
        takes: [take({ id: "t2", textSnapshot: "Already done" })]
      }),
      line({ id: "l3", speakerId: "sp1", text: "Third" })
    ]);
    const { context, textToSpeechEncoded } = ctx();

    const result = (await toolForCapabilityName("voice_script_lines").process(context, {
      script_id: row.id
    })) as {
      voiced: number;
      failed: number;
      results: Array<{ line_id: string; duration_ms?: number; word_count?: number }>;
    };

    expect(result.voiced).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.results.map((r) => r.line_id)).toEqual(["l1", "l3"]);
    expect(result.results[0].duration_ms).toBe(TAKE_MS);
    expect(result.results[0].word_count).toBe(1);
    expect(textToSpeechEncoded.mock.calls[0][0]).toMatchObject({
      model: "tts-1",
      voice: "alloy"
    });

    const saved = (await Script.findById(row.id))!.toDocument();
    const lines = saved.sections[0].lines;
    expect(lines[0].takes).toHaveLength(1);
    expect(lines[0].currentTakeId).toBe(lines[0].takes[0].id);
    expect(lines[0].takes[0].textSnapshot).toBe("First");
    // The up-to-date line is untouched.
    expect(lines[1].currentTakeId).toBe("t2");
  });

  it("skips a line with no voice and says how to fix it", async () => {
    const row = await makeScript([line({ id: "l1", text: "Orphan" })], []);
    const result = (await toolForCapabilityName("voice_script_lines").process(ctx().context, {
      script_id: row.id,
      targets: ["l1"]
    })) as { voiced: number; results: Array<{ error?: string }> };
    expect(result.voiced).toBe(0);
    expect(result.results[0].error).toContain("no voice");
  });

  it("applies a call-level voice override to the named lines", async () => {
    const row = await makeScript([line({ id: "l1", speakerId: "sp1", text: "Line" })]);
    const { context, textToSpeechEncoded } = ctx();

    await toolForCapabilityName("voice_script_lines").process(context, {
      script_id: row.id,
      targets: ["0"],
      provider: "elevenlabs",
      model: "eleven_v3",
      voice: "rachel"
    });

    expect(textToSpeechEncoded.mock.calls[0][0]).toMatchObject({
      model: "eleven_v3",
      voice: "rachel"
    });
  });

  it("rejects a half-specified voice override", async () => {
    const row = await makeScript([line({ id: "l1", speakerId: "sp1" })]);
    const result = (await toolForCapabilityName("voice_script_lines").process(ctx().context, {
      script_id: row.id,
      provider: "elevenlabs"
    })) as { error: string };
    expect(result.error).toContain("provider, model, and voice");
  });

  it("reports a failed synthesis per line without failing the batch", async () => {
    const row = await makeScript([
      line({ id: "l1", speakerId: "sp1", text: "One" }),
      line({ id: "l2", speakerId: "sp1", text: "Two" })
    ]);
    let call = 0;
    const { context } = ctx({
      // Both TTS paths fail for the first line — the encoded one the tool
      // prefers, and the streaming one it falls back to.
      streamError: "provider exploded",
      tts: async () => {
        call += 1;
        if (call === 1) throw new Error("provider exploded");
        return { data: wav(), mimeType: "audio/wav" };
      }
    });

    const result = (await toolForCapabilityName("voice_script_lines").process(context, {
      script_id: row.id,
      concurrency: 1
    })) as { voiced: number; failed: number; results: Array<{ error?: string }> };

    expect(result.failed).toBe(1);
    expect(result.voiced).toBe(1);
    expect(result.results[0].error).toContain("provider exploded");
  });

  it("skips transcription when asked, falling back to the placeholder length", async () => {
    const row = await makeScript([line({ id: "l1", speakerId: "sp1", text: "Line" })]);
    const { context, automaticSpeechRecognition } = ctx();

    const result = (await toolForCapabilityName("voice_script_lines").process(context, {
      script_id: row.id,
      transcribe: false
    })) as { results: Array<{ duration_ms?: number; word_count?: number }> };

    expect(automaticSpeechRecognition).not.toHaveBeenCalled();
    expect(result.results[0].word_count).toBe(0);
    // ffprobe reads the real WAV; without it on PATH the placeholder applies.
    expect([TAKE_MS, 3000]).toContain(result.results[0].duration_ms);
  });

  it("assembles voiced takes into a timeline and links it to the script", async () => {
    const row = await makeScript([
      line({
        id: "l1",
        speakerId: "sp1",
        text: "First line",
        pauseAfterMs: 250,
        currentTakeId: "t1",
        takes: [
          take({
            id: "t1",
            assetId: "a1",
            durationMs: 1000,
            textSnapshot: "First line",
            words: [{ word: "First", startMs: 0, endMs: 400 }]
          })
        ]
      }),
      line({ id: "l2", speakerId: "sp1", text: "Not voiced" }),
      line({
        id: "l3",
        speakerId: "sp1",
        text: "Third line",
        currentTakeId: "t3",
        takes: [take({ id: "t3", assetId: "a3", durationMs: 800, textSnapshot: "Third line" })]
      })
    ]);

    const result = (await toolForCapabilityName("assemble_script_timeline").process(ctx().context, {
      script_id: row.id
    })) as {
      timeline_id: string;
      duration_ms: number;
      clip_count: number;
      skipped_line_ids: string[];
    };

    expect(result.clip_count).toBe(2);
    // 1000 + 250 pause + 800
    expect(result.duration_ms).toBe(2050);
    expect(result.skipped_line_ids).toEqual(["l2"]);

    const sequence = (await TimelineSequence.findById(result.timeline_id))!;
    const document = sequence.toDocument();
    expect(document.clips[0]).toMatchObject({
      startMs: 0,
      durationMs: 1000,
      currentAssetId: "a1",
      scriptId: row.id,
      scriptLineId: "l1",
      speaker: "Narrator",
      voice: "alloy"
    });
    expect(document.clips[0].caption?.words).toHaveLength(1);
    expect(document.clips[1].startMs).toBe(1250);
    expect((await Script.findById(row.id))!.timeline_id).toBe(result.timeline_id);

    // Re-assembling updates the same sequence and keeps foreign clips.
    const again = (await toolForCapabilityName("assemble_script_timeline").process(ctx().context, {
      script_id: row.id
    })) as { timeline_id: string; clip_count: number };
    expect(again.timeline_id).toBe(result.timeline_id);
    expect(again.clip_count).toBe(2);
  });

  it("refuses to assemble a script with nothing voiced", async () => {
    const row = await makeScript([line({ id: "l1", speakerId: "sp1" })]);
    const result = (await toolForCapabilityName("assemble_script_timeline").process(ctx().context, {
      script_id: row.id
    })) as { error: string };
    expect(result.error).toContain("voice_script_lines");
  });
});
