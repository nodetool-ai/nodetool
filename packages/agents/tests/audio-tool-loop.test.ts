/**
 * Tests for the audio editor headless tool-loop surface
 * (`src/evals/surfaces/audio.ts`):
 *   - `createAudioToolBridge`: the shared `ui_audio_*` contract run against an
 *     in-memory mono buffer.
 *   - `AUDIO_TOOL_LOOP_CASES`: a golden transcript per case passes, so no case
 *     is unsatisfiable, and a plausible wrong run fails.
 */
import { describe, it, expect } from "vitest";
import type { BaseProvider, ProviderStreamItem, ProviderTool } from "@nodetool-ai/runtime";
import {
  AUDIO_EFFECT_SPECS,
  AUDIO_TOOL_CONTRACTS
} from "@nodetool-ai/protocol/api-schemas/asset-editor-tool-contracts.js";
import { runToolLoopEval } from "../src/evals/tool-loop-eval.js";
import {
  createAudioToolBridge,
  AUDIO_TOOL_LOOP_CASES
} from "../src/evals/surfaces/audio.js";

interface ScriptedCall {
  name: string;
  args: Record<string, unknown>;
}

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

const caseById = (id: string) => {
  const found = AUDIO_TOOL_LOOP_CASES.find((c) => c.id === id);
  if (!found) throw new Error(`no case ${id}`);
  return found;
};

const run = async (id: string, script: ScriptedCall[]) => {
  const report = await runToolLoopEval({
    provider: createScriptedProvider(script),
    model: "test-model",
    cases: [caseById(id)]
  });
  return report.cases[0];
};

const toolsOf = (bridge: ReturnType<typeof createAudioToolBridge>) =>
  Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

describe("createAudioToolBridge", () => {
  it("registers every shared ui_audio_* contract and nothing else", () => {
    const bridge = createAudioToolBridge({ segments: [{ seconds: 1, level: 0.5 }] });
    expect(bridge.tools.map((t) => t.name).sort()).toEqual(
      Object.keys(AUDIO_TOOL_CONTRACTS).sort()
    );
  });

  it("reports levels per window so silence is visible", async () => {
    const bridge = createAudioToolBridge({
      segments: [
        { seconds: 0.5, level: 0 },
        { seconds: 0.5, level: 0.5 }
      ]
    });
    const state = (await toolsOf(bridge).ui_audio_get_state.execute({})) as {
      durationSeconds: number;
      peaks: number[];
      peakWindowSeconds: number;
    };
    expect(state.durationSeconds).toBe(1);
    expect(state.peakWindowSeconds).toBe(0.1);
    expect(state.peaks).toEqual([0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5]);
  });

  it("applies the toolbar edits", async () => {
    const bridge = createAudioToolBridge({ segments: [{ seconds: 2, level: 0.5 }] });
    const tools = toolsOf(bridge);
    await tools.ui_audio_edit.execute({ op: "delete", start: 0, end: 0.5 });
    expect(bridge.finalState().durationSeconds).toBe(1.5);
    await tools.ui_audio_edit.execute({ op: "gain", gain_db: 6 });
    expect(bridge.finalState().peaks[0]).toBeCloseTo(1, 1);
    await tools.ui_audio_edit.execute({ op: "silence", start: 1, end: 1.5 });
    expect(bridge.finalState().peaks.at(-1)).toBe(0);
    await tools.ui_audio_edit.execute({ op: "trim", start: 0, end: 1 });
    expect(bridge.finalState().durationSeconds).toBe(1);
    expect(bridge.finalState().edits.map((e) => e.op)).toEqual([
      "delete",
      "gain",
      "silence",
      "trim"
    ]);
  });

  it("refuses the calls the browser refuses, with the same reasons", async () => {
    const tools = toolsOf(
      createAudioToolBridge({ segments: [{ seconds: 1, level: 0.5 }] })
    );
    await expect(tools.ui_audio_edit.execute({ op: "trim" })).rejects.toThrow(
      '"trim" needs a range'
    );
    await expect(
      tools.ui_audio_edit.execute({ op: "silence", start: 0.5 })
    ).rejects.toThrow("Pass both `start` and `end`");
    await expect(tools.ui_audio_edit.execute({ op: "gain" })).rejects.toThrow(
      "needs gain_db"
    );
    await expect(
      tools.ui_audio_apply_effect.execute({ effect_id: "nope" })
    ).rejects.toThrow('Unknown effect "nope"');
    await expect(
      tools.ui_audio_apply_effect.execute({ effect_id: "reverb", params: { wet: 5 } })
    ).rejects.toThrow('"reverb" has no parameter "wet"');
    await expect(
      tools.ui_audio_apply_effect.execute({ effect_id: "reverb", params: { mix: 500 } })
    ).rejects.toThrow('"mix" must be between 0 and 100');
  });

  it("lists the shared effect catalog and fills in defaults", async () => {
    const bridge = createAudioToolBridge({ segments: [{ seconds: 2, level: 0.5 }] });
    const tools = toolsOf(bridge);
    const listed = (await tools.ui_audio_list_effects.execute({})) as {
      effects: { id: string }[];
    };
    expect(listed.effects.map((e) => e.id)).toEqual(
      AUDIO_EFFECT_SPECS.map((e) => e.id)
    );
    await tools.ui_audio_apply_effect.execute({ effect_id: "reverb", params: { mix: 50 } });
    expect(bridge.finalState().effects[0]).toEqual({
      effectId: "reverb",
      params: { decay: 2, preDelayMs: 20, tone: 8000, mix: 50 },
      range: null
    });
  });

  it("changes the length for speed, the way the render does", async () => {
    const bridge = createAudioToolBridge({ segments: [{ seconds: 2, level: 0.5 }] });
    await toolsOf(bridge).ui_audio_apply_effect.execute({
      effect_id: "speed",
      params: { rate: 2 }
    });
    expect(bridge.finalState().durationSeconds).toBe(1);
  });

  it("marks the draft clean only after a save", async () => {
    const bridge = createAudioToolBridge({ segments: [{ seconds: 1, level: 0.5 }] });
    const tools = toolsOf(bridge);
    expect(bridge.finalState().dirty).toBe(false);
    await tools.ui_audio_edit.execute({ op: "reverse" });
    expect(bridge.finalState()).toMatchObject({ dirty: true, saves: 0 });
    await tools.ui_audio_save.execute({});
    expect(bridge.finalState()).toMatchObject({ dirty: false, saves: 1 });
  });
});

describe("AUDIO_TOOL_LOOP_CASES", () => {
  it("trim-leading-silence passes on the golden transcript", async () => {
    const result = await run("trim-leading-silence", [
      { name: "ui_audio_get_state", args: {} },
      { name: "ui_audio_edit", args: { op: "delete", start: 0, end: 2 } },
      { name: "ui_audio_save", args: {} }
    ]);
    expect(result.accepted).toBe(true);
    expect(result.score).toBe(1);
  });

  it("trim-leading-silence fails when the speech is cut too", async () => {
    const result = await run("trim-leading-silence", [
      { name: "ui_audio_get_state", args: {} },
      { name: "ui_audio_edit", args: { op: "delete", start: 0, end: 3 } },
      { name: "ui_audio_save", args: {} }
    ]);
    expect(result.score).toBeLessThan(1);
  });

  it("fade-out-ending passes on the golden transcript and fails when saved", async () => {
    const golden: ScriptedCall[] = [
      { name: "ui_audio_get_state", args: {} },
      { name: "ui_audio_edit", args: { op: "fade_out", start: 3, end: 4 } }
    ];
    const passed = await run("fade-out-ending", golden);
    expect(passed.accepted).toBe(true);
    expect(passed.score).toBe(1);

    const saved = await run("fade-out-ending", [...golden, { name: "ui_audio_save", args: {} }]);
    expect(saved.score).toBeLessThan(1);
  });

  it("fade-out-ending fails when the whole clip is faded", async () => {
    const result = await run("fade-out-ending", [
      { name: "ui_audio_edit", args: { op: "fade_out" } }
    ]);
    expect(result.score).toBeLessThan(1);
  });

  it("reverb-with-mix passes on the golden transcript", async () => {
    const result = await run("reverb-with-mix", [
      { name: "ui_audio_list_effects", args: {} },
      { name: "ui_audio_apply_effect", args: { effect_id: "reverb", params: { mix: 50 } } }
    ]);
    expect(result.accepted).toBe(true);
    expect(result.score).toBe(1);
  });
});
