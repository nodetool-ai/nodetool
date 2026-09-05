/**
 * The `scripts` capability module.
 *
 * A well-formed, correctly classified module; specs byte-identical to the
 * wire surface they replaced; and implementations that still voice, assemble, and
 * edit. `tests/script-voice-tools.test.ts` and `tests/document-edit-tools.test.ts`
 * run unmodified against those classes and remain the deep behavioural net —
 * the round trips here prove a direct `invoke` reaches the same work, including
 * the delegation to the `generate_speech` capability the port had to keep.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { Asset, ModelObserver, Script, initTestDb } from "@nodetool-ai/models";
import type { ScriptLine } from "@nodetool-ai/models";
import { module as scripts } from "../src/capabilities/scripts.js";
import { createCapabilityRun, UNGATED } from "../src/capabilities/invoke.js";
import {
  capabilityCategoryFor,
  capabilityModuleIssues
} from "../src/capabilities/registry.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import { Tool } from "../src/tools/base-tool.js";

const VOICE = { provider: "openai", model: "tts-1", voice: "alloy" };
const TAKE_MS = 500;

/** A real 500ms mono 16-bit WAV at 8kHz, so the duration probe has bytes. */
function wav(durationMs = TAKE_MS): Uint8Array {
  const sampleRate = 8000;
  const samples = Math.round((sampleRate * durationMs) / 1000);
  const dataBytes = samples * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++)
      view.setUint8(offset + i, text.charCodeAt(i));
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

/** The same fake surface `tests/script-voice-tools.test.ts` builds. */
function ctx(userId = "u1") {
  const stored = new Map<string, Uint8Array>();
  const textToSpeechEncoded = vi.fn(async () => ({
    data: wav(),
    mimeType: "audio/wav"
  }));
  const automaticSpeechRecognition = vi.fn(async () => ({
    text: "hello",
    chunks: [{ text: "hello", timestamp: [0, TAKE_MS / 1000] }] as Array<{
      text: string;
      timestamp: [number, number];
    }>
  }));
  const context = {
    userId,
    getProvider: vi.fn(async () => ({
      textToSpeechEncoded,
      automaticSpeechRecognition
    })),
    hasModelInterface: (name: string) => name === "createAsset",
    createAsset: vi.fn(
      async (args: {
        name: string;
        contentType: string;
        content: Uint8Array;
      }) => {
        const asset = await Asset.create<Asset>({
          user_id: "u1",
          name: args.name,
          content_type: args.contentType
        });
        stored.set(asset.id, args.content);
        return asset;
      }
    ),
    // generate_speech falls back to the streaming path when the encoded one
    // fails, so the fake has to answer both.
    streamProviderPrediction: () => {
      throw new Error("no streaming TTS in this fake");
    },
    resolveAssetBytes: vi.fn(async (uri: string) => ({
      bytes: stored.get(uri.replace("asset://", "").split(".")[0]) ?? null
    }))
  };
  return {
    context: context as unknown as ProcessingContext,
    textToSpeechEncoded
  };
}

const run = (context: ProcessingContext) =>
  createCapabilityRun({ context, gate: UNGATED });

const line = (overrides: Partial<ScriptLine> & { id: string }): ScriptLine => ({
  text: "A line",
  takes: [],
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

/** Every capability paired with the `Tool` the belt builds for it. */
const PAIRS: Array<[string, () => Tool]> = [
  ["list_scripts", () => toolForCapabilityName("list_scripts")],
  ["create_script", () => toolForCapabilityName("create_script")],
  ["get_script", () => toolForCapabilityName("get_script")],
  ["voice_script_lines", () => toolForCapabilityName("voice_script_lines")],
  [
    "assemble_script_timeline",
    () => toolForCapabilityName("assemble_script_timeline")
  ],
  ["edit_script", () => toolForCapabilityName("edit_script")],
  [
    "derive_storyboard_from_script",
    () => toolForCapabilityName("derive_storyboard_from_script")
  ],
  ["delete_script", () => toolForCapabilityName("delete_script")]
];

describe("scripts capability module", () => {
  it("is well-formed and declares itself as scripts", () => {
    expect(capabilityModuleIssues("scripts", scripts)).toEqual([]);
    expect(scripts.exports.map((e) => e.spec.name)).toEqual([
      "list_scripts",
      "create_script",
      "get_script",
      "voice_script_lines",
      "assemble_script_timeline",
      "edit_script",
      "derive_storyboard_from_script",
      "delete_script"
    ]);
  });

  it("classifies every export the way the gate's map does", () => {
    for (const entry of scripts.exports) {
      expect([entry.spec.name, entry.spec.category]).toEqual([
        entry.spec.name,
        capabilityCategoryFor(entry.spec.name)
      ]);
    }
  });

  it("keeps the wire surface the belt offers", () => {
    for (const [name, make] of PAIRS) {
      const spec = scripts.exports.find((e) => e.spec.name === name)?.spec;
      const tool = make();
      expect(spec).toBeDefined();
      expect(tool.name).toBe(name);
      expect(tool.description).toBe(spec?.description);
      expect(tool.inputSchema).toEqual(spec?.inputSchema);
    }
  });

  it("renders the user-facing messages", () => {
    const args = {
      script_id: "sc1",
      targets: ["l1", "l2"],
      ops: [{ op: "add_line", text: "Hi." }]
    };
    for (const [name, make] of PAIRS) {
      const spec = scripts.exports.find((e) => e.spec.name === name)!.spec;
      expect([name, spec.userMessage?.(args)]).toEqual([
        name,
        make().userMessage(args)
      ]);
    }
  });
});

describe("scripts capability behaviour", () => {
  beforeEach(() => initTestDb());
  afterEach(() => ModelObserver.clear());

  it("lists scripts and reports each line's voicing status", async () => {
    const row = await makeScript([
      line({ id: "l1", speakerId: "sp1", text: "Never voiced" }),
      line({ id: "l2", text: "No speaker" })
    ]);
    const { context } = ctx();

    const listed = (await run(context).invoke("list_scripts", {})) as {
      scripts: Array<{ id: string; lines: number; voiced: number }>;
    };
    expect(listed.scripts[0]).toMatchObject({
      id: row.id,
      lines: 2,
      voiced: 0
    });

    const read = (await run(context).invoke("get_script", {
      script_id: row.id
    })) as { lines: Array<{ id: string; status: string }> };
    expect(read.lines.map((l) => [l.id, l.status])).toEqual([
      ["l1", "draft"],
      ["l2", "no_voice"]
    ]);
  });

  it("creates an empty script, and returns it again on a retried id", async () => {
    const { context } = ctx();

    const created = (await run(context).invoke("create_script", {
      name: "Narration",
      id: "script-1"
    })) as { ok: boolean; script_id: string; name: string };
    expect(created).toMatchObject({
      ok: true,
      script_id: "script-1",
      name: "Narration"
    });

    const read = (await run(context).invoke("get_script", {
      script_id: created.script_id
    })) as { cast: unknown[]; lines: unknown[] };
    expect(read.cast).toEqual([]);
    expect(read.lines).toEqual([]);

    const retried = (await run(context).invoke("create_script", {
      name: "Other",
      id: "script-1"
    })) as { script_id: string; name: string };
    expect(retried).toMatchObject({ script_id: "script-1", name: "Narration" });

    const taken = (await run(ctx("other").context).invoke("create_script", {
      name: "Mine",
      id: "script-1"
    })) as { error: string };
    expect(taken.error).toContain("already exists");
  });

  it("hides a script owned by another user", async () => {
    const row = await makeScript([line({ id: "l1" })]);
    const result = (await run(ctx("other").context).invoke("get_script", {
      script_id: row.id
    })) as { error: string };
    expect(result.error).toContain("not found");
  });

  it("voices the lines that need it through generate_speech", async () => {
    const row = await makeScript([
      line({ id: "l1", speakerId: "sp1", text: "First" }),
      line({ id: "l2", speakerId: "sp1", text: "Second" })
    ]);
    const { context, textToSpeechEncoded } = ctx();

    const result = (await run(context).invoke("voice_script_lines", {
      script_id: row.id
    })) as {
      voiced: number;
      failed: number;
      results: Array<{
        line_id: string;
        take_id?: string;
        word_count?: number;
      }>;
    };
    expect(result).toMatchObject({ voiced: 2, failed: 0 });
    expect(textToSpeechEncoded).toHaveBeenCalledTimes(2);
    expect(result.results.every((r) => !!r.take_id)).toBe(true);

    // Nothing is stale any more, so a second call is a no-op.
    const again = (await run(context).invoke("voice_script_lines", {
      script_id: row.id
    })) as { voiced: number; note?: string };
    expect(again).toMatchObject({ voiced: 0 });
    // Both lines really are up to date, so the note says so — and counts them,
    // because the wording that used to cover this case ("every line with a
    // voice is already up to date") was also what a script with no voices at
    // all got back.
    expect(again.note).toContain("All 2 lines are voiced and up to date");
  });

  it("refuses a half-specified voice override", async () => {
    const row = await makeScript([line({ id: "l1", speakerId: "sp1" })]);
    const result = (await run(ctx().context).invoke("voice_script_lines", {
      script_id: row.id,
      provider: "openai"
    })) as { error: string };
    expect(result.error).toContain(
      "needs all three of provider, model, and voice"
    );
  });

  it("assembles voiced takes into a timeline and refuses when there are none", async () => {
    const row = await makeScript([
      line({ id: "l1", speakerId: "sp1", text: "First" })
    ]);
    const { context } = ctx();

    const empty = (await run(context).invoke("assemble_script_timeline", {
      script_id: row.id
    })) as { error: string };
    expect(empty.error).toContain("Run voice_script_lines first");

    await run(context).invoke("voice_script_lines", { script_id: row.id });
    const assembled = (await run(context).invoke("assemble_script_timeline", {
      script_id: row.id
    })) as { ok: boolean; timeline_id: string; clip_count: number };
    expect(assembled).toMatchObject({ ok: true, clip_count: 1 });
    expect(assembled.timeline_id).toBeTruthy();
  });

  it("adds a line and rewrites one, leaving takes stale", async () => {
    const row = await makeScript([
      line({ id: "l1", speakerId: "sp1", text: "First" })
    ]);
    const { context } = ctx();

    const result = (await run(context).invoke("edit_script", {
      script_id: row.id,
      ops: [
        { op: "add_line", text: "Second", speaker: "Narrator" },
        { op: "set_line_text", target: "l1", text: "Rewritten" }
      ]
    })) as {
      applied: number;
      failed: number;
      lines: Array<{ id: string; text: string }>;
    };
    expect(result).toMatchObject({ applied: 2, failed: 0 });
    expect(result.lines.map((l) => l.text)).toEqual(["Rewritten", "Second"]);
  });

  it("stamps each broadcast op with the one key its vocabulary uses", async () => {
    const row = await makeScript([
      line({ id: "l1", speakerId: "sp1", text: "First" })
    ]);
    const seen: Array<{ tool: string; input: Record<string, unknown> }> = [];
    ModelObserver.subscribe((_instance, _event, meta) => {
      for (const op of (meta?.ops ?? []) as {
        tool: string;
        input: Record<string, unknown>;
      }[]) {
        seen.push(op);
      }
    }, "Script");

    await run(ctx().context).invoke("edit_script", {
      script_id: row.id,
      ops: [
        { op: "set_line_text", target: "l1", text: "Rewritten" },
        { op: "set_speaker", target: "Narrator", name: "Chorus" },
        { op: "add_section", title: "Act II" }
      ]
    });

    const keys = (tool: string): string[] => {
      const op = seen.find((o) => o.tool === tool);
      return ["line_id", "target", "id", "section_id"].filter(
        (k) => op?.input[k] !== undefined
      );
    };
    // A line op is addressed by line_id, never by a stamped target: the
    // editor's adapter reads line_id first and would file a speaker op under
    // `section.lines` if both were stamped.
    expect(seen.find((o) => o.tool === "set_line_text")?.input["line_id"]).toBe(
      "l1"
    );
    expect(keys("set_line_text").sort()).toEqual(["id", "line_id", "target"]);
    // `target` here is the caller's own argument, left as written.
    expect(seen.find((o) => o.tool === "set_line_text")?.input["target"]).toBe(
      "l1"
    );
    // A speaker op carries no line_id at all.
    expect(keys("set_speaker").sort()).toEqual(["id", "target"]);
    expect(seen.find((o) => o.tool === "set_speaker")?.input["target"]).toBe(
      "sp1"
    );
    // An add resolves through existence: nothing is stamped.
    expect(keys("add_section")).toEqual([]);
  });

  it("records an op naming a line the script lacks", async () => {
    const row = await makeScript([line({ id: "l1", speakerId: "sp1" })]);
    const result = (await run(ctx().context).invoke("edit_script", {
      script_id: row.id,
      ops: [{ op: "remove_line", target: "nope" }]
    })) as { failed: number; ops: Array<{ error?: string }> };
    expect(result.failed).toBe(1);
    expect(result.ops[0].error).toContain('No line matches "nope"');
  });

  // A chat wrote eight lines with `add_line {text, speaker_id}` — the key
  // `get_script` reports a line's speaker under. Every op returned ok and every
  // line came back unattributed, because an argument no op reads was dropped
  // rather than refused. These pin both halves of the fix: the spelling that
  // means something is translated, and the one that means nothing is reported.
  it("reads a line's speaker from speaker_id as well as speaker", async () => {
    const row = await makeScript([]);
    const result = (await run(ctx().context).invoke("edit_script", {
      script_id: row.id,
      ops: [
        { op: "add_line", text: "First", speaker_id: "sp1" },
        { op: "add_line", text: "Second", speaker: "Narrator" }
      ]
    })) as {
      applied: number;
      failed: number;
      lines: Array<{ speaker_id: string | null }>;
    };
    expect(result).toMatchObject({ applied: 2, failed: 0 });
    expect(result.lines.map((l) => l.speaker_id)).toEqual(["sp1", "sp1"]);
  });

  it("refuses an argument the op does not take, naming the ones it does", async () => {
    const row = await makeScript([line({ id: "l1", speakerId: "sp1" })]);
    const result = (await run(ctx().context).invoke("edit_script", {
      script_id: row.id,
      ops: [{ op: "add_line", text: "First", speeker: "sp1" }]
    })) as { error?: string };
    expect(result.error).toContain('has no argument "speeker"');
    expect(result.error).toContain("text, speaker, section");
  });

  it("refuses an op that spells the same argument twice", async () => {
    const row = await makeScript([line({ id: "l1", speakerId: "sp1" })]);
    const result = (await run(ctx().context).invoke("edit_script", {
      script_id: row.id,
      ops: [
        { op: "set_line_speaker", target: "l1", line_id: "l1", speaker: "sp1" }
      ]
    })) as { error?: string };
    expect(result.error).toContain('both "line_id" and "target"');
  });

  it("points a speaker op aimed at a line id at set_line_speaker", async () => {
    const row = await makeScript([line({ id: "line_1", speakerId: null })]);
    const result = (await run(ctx().context).invoke("edit_script", {
      script_id: row.id,
      ops: [{ op: "set_speaker", target: "line_1", name: "Host" }]
    })) as { failed: number; ops: Array<{ error?: string }> };
    expect(result.failed).toBe(1);
    expect(result.ops[0].error).toContain("set_line_speaker");
    expect(result.ops[0].error).toContain("sp1 (Narrator)");
  });

  // "Every line with a voice is already up to date" was also what a script
  // with no voice anywhere got back — true only because there was nothing to
  // be out of date, and read by a chat as "the voicing worked".
  it("says why nothing was voiced when no line has a voice", async () => {
    const row = await makeScript(
      [line({ id: "l1", speakerId: "sp1" }), line({ id: "l2", speakerId: "sp1" })],
      [{ id: "sp1", name: "Narrator", voice: null }] as never
    );
    const result = (await run(ctx().context).invoke("voice_script_lines", {
      script_id: row.id
    })) as { voiced: number; skipped_without_voice?: number; note?: string };
    expect(result).toMatchObject({ voiced: 0, skipped_without_voice: 2 });
    expect(result.note).toContain("2 of 2 lines have no voice");
    expect(result.note).toContain("set_speaker_voice");
    expect(result.note).not.toContain("already up to date");
  });
});
