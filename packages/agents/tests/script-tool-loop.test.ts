/**
 * Unit tests for the Script surface tool-loop eval (`src/evals/surfaces/script.ts`):
 *   - `createScriptToolBridge`: headless execution of the real ui_script_* tool
 *     contract (minus `script_id`) against a plain in-memory script document.
 *   - `SCRIPT_TOOL_LOOP_CASES`: each case is solvable by a hand-written scripted
 *     tool-call sequence, driven through `runToolLoopEval` exactly like a real
 *     model's tool loop.
 */
import { describe, it, expect } from "vitest";
import { runToolLoopEval } from "../src/evals/tool-loop-eval.js";
import {
  createScriptToolBridge,
  SCRIPT_TOOL_LOOP_CASES,
  type ScriptBridgeFinalState
} from "../src/evals/surfaces/script.js";
import type {
  BaseProvider,
  ProviderStreamItem,
  ProviderTool
} from "@nodetool-ai/runtime";

// --- scripted provider (copied from tool-loop-eval.test.ts) -----------------

interface ScriptedCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Provider that replays one scripted list of tool calls through the tool
 * `execute` closures (mirroring how a real provider's `generateLoop` dispatches
 * self-executing tools), then ends the turn.
 */
function createScriptedProvider(script: ScriptedCall[]): BaseProvider {
  return {
    provider: "scripted",
    hasToolSupport: async () => true,
    getTotalCost: () => 0,
    async *generateLoop(args: {
      tools?: ProviderTool[];
      signal?: AbortSignal;
    }): AsyncGenerator<ProviderStreamItem> {
      const toolMap = new Map((args.tools ?? []).map((t) => [t.name, t]));
      let seq = 0;
      for (const call of script) {
        if (args.signal?.aborted) break;
        const id = `call_${++seq}`;
        yield { id, name: call.name, args: call.args } as ProviderStreamItem;
        await toolMap.get(call.name)?.execute?.(call.args, id);
      }
      yield { type: "chunk", content: "", done: true } as ProviderStreamItem;
    }
  } as unknown as BaseProvider;
}

// --- createScriptToolBridge --------------------------------------------------

describe("createScriptToolBridge", () => {
  it("runs the happy path: add speaker + voice, add line, voice it into a take", async () => {
    const bridge = createScriptToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    expect(byName).toHaveProperty("ui_script_get_state");
    expect(Object.keys(byName)).toHaveLength(10);

    const speakerResult = (await byName["ui_script_add_speaker"].execute({
      name: "Narrator",
      voice: { provider: "elevenlabs", model: "eleven_v3", voice: "rachel" }
    })) as { ok: boolean; speaker: { id: string } };
    expect(speakerResult.ok).toBe(true);
    const speakerId = speakerResult.speaker.id;

    const lineResult = (await byName["ui_script_add_line"].execute({
      text: "Hello there, stranger.",
      speakerId
    })) as { ok: boolean; line: { id: string; status: string } };
    expect(lineResult.ok).toBe(true);
    expect(lineResult.line.status).toBe("draft");

    const voiceResult = (await byName["ui_script_voice_line"].execute({
      target: lineResult.line.id
    })) as {
      ok: boolean;
      line: { status: string; takeCount: number; currentTakeDurationMs: number };
    };
    expect(voiceResult.ok).toBe(true);
    expect(voiceResult.line.status).toBe("voiced");
    expect(voiceResult.line.takeCount).toBe(1);
    expect(voiceResult.line.currentTakeDurationMs).toBeGreaterThan(0);

    const state = bridge.finalState();
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0].status).toBe("voiced");
    expect(state.cast[0].hasVoice).toBe(true);
  });

  it("throws when voicing a line with no effective voice", async () => {
    const bridge = createScriptToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_script_add_line"].execute({ text: "No speaker here." });
    await expect(
      byName["ui_script_voice_line"].execute({ target: "0" })
    ).rejects.toThrow(/no effective voice/);
  });

  it("throws when voicing a line with no text", async () => {
    const bridge = createScriptToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    const speaker = (await byName["ui_script_add_speaker"].execute({
      name: "Narrator",
      voice: { provider: "openai", model: "tts-1", voice: "alloy" }
    })) as { speaker: { id: string } };
    await byName["ui_script_add_line"].execute({
      text: "",
      speakerId: speaker.speaker.id
    });
    await expect(
      byName["ui_script_voice_line"].execute({ target: "0" })
    ).rejects.toThrow(/no text/);
  });

  it("marks a voiced line stale when its text or speaker's voice changes", async () => {
    const bridge = createScriptToolBridge({
      cast: [
        { id: "spk_1", name: "Narrator", voice: { provider: "openai", model: "tts-1", voice: "alloy" } }
      ],
      lines: [{ id: "line_1", text: "Original text.", speakerId: "spk_1" }]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_script_voice_line"].execute({ target: "line_1" });
    expect(bridge.finalState().lines[0].status).toBe("voiced");

    const afterEdit = (await byName["ui_script_set_line_text"].execute({
      target: "line_1",
      text: "Changed text."
    })) as { line: { status: string } };
    expect(afterEdit.line.status).toBe("stale");

    // Re-voice, then change the speaker's voice — should go stale again.
    await byName["ui_script_voice_line"].execute({ target: "line_1" });
    expect(bridge.finalState().lines[0].status).toBe("voiced");
    await byName["ui_script_set_speaker_voice"].execute({
      speakerId: "spk_1",
      voice: { provider: "openai", model: "tts-1", voice: "onyx" }
    });
    expect(bridge.finalState().lines[0].status).toBe("stale");
  });

  it("throws exporting subtitles or sending to timeline with nothing voiced", async () => {
    const bridge = createScriptToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    await byName["ui_script_add_line"].execute({ text: "Unvoiced line." });

    await expect(
      byName["ui_script_export_subtitles"].execute({})
    ).rejects.toThrow(/No line is voiced/);
    await expect(
      byName["ui_script_send_to_timeline"].execute({})
    ).rejects.toThrow(/No line is voiced/);
  });

  it("assembles subtitles from voiced takes", async () => {
    const bridge = createScriptToolBridge({
      cast: [
        { id: "spk_1", name: "Narrator", voice: { provider: "openai", model: "tts-1", voice: "alloy" } }
      ],
      lines: [{ id: "line_1", text: "Hello world.", speakerId: "spk_1" }]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    await byName["ui_script_voice_line"].execute({ target: "line_1" });

    const result = (await byName["ui_script_export_subtitles"].execute({
      format: "srt"
    })) as { ok: boolean; text: string; format: string; cueCount: number };
    expect(result.ok).toBe(true);
    expect(result.format).toBe("srt");
    expect(result.cueCount).toBe(1);
    expect(result.text).toContain("Hello world.");
    expect(result.text).toContain("-->");
  });

  it("sends voiced lines to the timeline, skipping unvoiced ones", async () => {
    const bridge = createScriptToolBridge({
      cast: [
        { id: "spk_1", name: "Narrator", voice: { provider: "openai", model: "tts-1", voice: "alloy" } }
      ],
      lines: [
        { id: "line_1", text: "Voiced.", speakerId: "spk_1" },
        { id: "line_2", text: "Not voiced." }
      ]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    await byName["ui_script_voice_line"].execute({ target: "line_1" });

    const result = (await byName["ui_script_send_to_timeline"].execute(
      {}
    )) as {
      ok: boolean;
      sequenceId: string;
      clipCount: number;
      skippedLineIds: string[];
      reassembled: boolean;
    };
    expect(result.ok).toBe(true);
    expect(result.clipCount).toBe(1);
    expect(result.skippedLineIds).toEqual(["line_2"]);
    expect(result.reassembled).toBe(false);
    expect(bridge.finalState().hasTimeline).toBe(true);

    // Sending again reassembles rather than creating a new sequence.
    const second = (await byName["ui_script_send_to_timeline"].execute(
      {}
    )) as { reassembled: boolean; sequenceId: string };
    expect(second.reassembled).toBe(true);
    expect(second.sequenceId).toBe(result.sequenceId);
  });
});

// --- SCRIPT_TOOL_LOOP_CASES ---------------------------------------------------

describe("SCRIPT_TOOL_LOOP_CASES", () => {
  it("has three cases with the expected ids", () => {
    expect(SCRIPT_TOOL_LOOP_CASES.map((c) => c.id)).toEqual([
      "voice-and-assemble",
      "write-dialogue",
      "export-subtitles"
    ]);
  });

  it("voice-and-assemble is solved by voicing all lines then sending to the timeline", async () => {
    const evalCase = SCRIPT_TOOL_LOOP_CASES.find(
      (c) => c.id === "voice-and-assemble"
    )!;
    const script: ScriptedCall[] = [
      { name: "ui_script_get_state", args: {} },
      { name: "ui_script_voice_all", args: {} },
      { name: "ui_script_send_to_timeline", args: {} }
    ];
    const provider = createScriptedProvider(script);
    const report = await runToolLoopEval<ScriptBridgeFinalState>({
      provider,
      model: "test",
      cases: [evalCase]
    });
    const result = report.cases[0];
    expect(result.checks.filter((c) => !c.pass)).toEqual([]);
    expect(result.accepted).toBe(true);
    expect(result.score).toBe(1);
  });

  it("write-dialogue is solved by adding two speakers and three lines", async () => {
    const evalCase = SCRIPT_TOOL_LOOP_CASES.find(
      (c) => c.id === "write-dialogue"
    )!;
    const script: ScriptedCall[] = [
      { name: "ui_script_get_state", args: {} },
      { name: "ui_script_add_speaker", args: { name: "Ava" } },
      { name: "ui_script_add_speaker", args: { name: "Ben" } },
      {
        name: "ui_script_add_line",
        args: { text: "Did you hear that?", speakerId: "spk_1" }
      },
      {
        name: "ui_script_add_line",
        args: { text: "Hear what?", speakerId: "spk_2" }
      },
      {
        name: "ui_script_add_line",
        args: { text: "Never mind, it was nothing.", speakerId: "spk_1" }
      }
    ];
    const provider = createScriptedProvider(script);
    const report = await runToolLoopEval<ScriptBridgeFinalState>({
      provider,
      model: "test",
      cases: [evalCase]
    });
    const result = report.cases[0];
    expect(result.checks.filter((c) => !c.pass)).toEqual([]);
    expect(result.accepted).toBe(true);
    expect(result.score).toBe(1);
  });

  it("export-subtitles is solved by voicing the line then exporting SRT", async () => {
    const evalCase = SCRIPT_TOOL_LOOP_CASES.find(
      (c) => c.id === "export-subtitles"
    )!;
    const script: ScriptedCall[] = [
      { name: "ui_script_get_state", args: {} },
      { name: "ui_script_voice_line", args: { target: "line_1" } },
      { name: "ui_script_export_subtitles", args: { format: "srt" } }
    ];
    const provider = createScriptedProvider(script);
    const report = await runToolLoopEval<ScriptBridgeFinalState>({
      provider,
      model: "test",
      cases: [evalCase]
    });
    const result = report.cases[0];
    expect(result.checks.filter((c) => !c.pass)).toEqual([]);
    expect(result.accepted).toBe(true);
    expect(result.score).toBe(1);
  });
});
