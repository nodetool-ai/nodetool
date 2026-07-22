/**
 * Tests for the timeline / video editor tool-loop eval surface
 * (`src/evals/surfaces/timeline.ts`):
 *   - `createTimelineToolBridge`: direct unit tests of the headless bridge.
 *   - `TIMELINE_TOOL_LOOP_CASES`: each case solved end-to-end via
 *     `runToolLoopEval` with a scripted provider — no network.
 */
import { describe, it, expect } from "vitest";
import type { BaseProvider, ProviderStreamItem, ProviderTool } from "@nodetool-ai/runtime";
import { runToolLoopEval } from "../src/evals/tool-loop-eval.js";
import {
  createTimelineToolBridge,
  TIMELINE_TOOL_LOOP_CASES
} from "../src/evals/surfaces/timeline.js";

// --- scripted provider -------------------------------------------------------

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

// --- createTimelineToolBridge (direct unit tests) ----------------------------

describe("createTimelineToolBridge", () => {
  it("add_text_clip creates an overlay track and a text clip", async () => {
    const bridge = createTimelineToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    const result = (await byName["ui_timeline_add_text_clip"].execute({
      text: "Hello"
    })) as { ok: boolean; clip: { id: string; mediaType: string; trackId: string } };

    expect(result.ok).toBe(true);
    expect(result.clip.mediaType).toBe("text");

    const final = bridge.finalState();
    expect(final.tracks).toHaveLength(1);
    expect(final.tracks[0].type).toBe("overlay");
    expect(final.clips).toHaveLength(1);
    expect(final.clips[0].trackId).toBe(final.tracks[0].id);
  });

  it("split at the playhead yields two clips summing to the original duration", async () => {
    const bridge = createTimelineToolBridge({
      tracks: [{ type: "video" }],
      clips: [
        {
          name: "clip",
          trackIndex: 0,
          mediaType: "video",
          startMs: 0,
          durationMs: 4000
        }
      ]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_timeline_seek"].execute({ timeMs: 1500 });
    const result = (await byName["ui_timeline_split_clip"].execute({
      target: "clip"
    })) as {
      ok: boolean;
      clips: [{ durationMs: number }, { durationMs: number }];
    };

    expect(result.ok).toBe(true);
    const [left, right] = result.clips;
    expect(left.durationMs).toBe(1500);
    expect(right.durationMs).toBe(2500);
    expect(left.durationMs + right.durationMs).toBe(4000);

    const final = bridge.finalState();
    expect(final.clips).toHaveLength(2);
  });

  it("animate_clip throws on an invalid preset", async () => {
    const bridge = createTimelineToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_timeline_add_text_clip"].execute({ text: "Hello" });

    await expect(
      byName["ui_timeline_animate_clip"].execute({
        target: "Hello",
        animations: [{ role: "in", preset: "does-not-exist" }]
      })
    ).rejects.toThrow(/Unknown animation preset/);
  });

  it("animate_clip throws when a preset does not support the requested role", async () => {
    const bridge = createTimelineToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_timeline_add_text_clip"].execute({ text: "Hello" });

    // "pulse" only supports the "emphasis" role.
    await expect(
      byName["ui_timeline_animate_clip"].execute({
        target: "Hello",
        animations: [{ role: "in", preset: "pulse" }]
      })
    ).rejects.toThrow(/does not support role/);
  });

  it("set_clip_binding errors on an imported (non-generated) clip", async () => {
    const bridge = createTimelineToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_timeline_add_text_clip"].execute({ text: "Hello" });

    await expect(
      byName["ui_timeline_set_clip_binding"].execute({
        target: "Hello",
        prompt: "a new prompt"
      })
    ).rejects.toThrow(/not a generated clip/);
  });
});

// --- TIMELINE_TOOL_LOOP_CASES (solved via runToolLoopEval) -------------------

describe("TIMELINE_TOOL_LOOP_CASES", () => {
  it("titles-with-motion: add_text_clip then animate_clip with a fade-in", async () => {
    const script: ScriptedCall[] = [
      { name: "ui_timeline_get_state", args: {} },
      { name: "ui_timeline_add_text_clip", args: { text: "Hello" } },
      { name: "ui_timeline_list_animation_presets", args: {} },
      {
        name: "ui_timeline_animate_clip",
        args: { target: "Hello", animations: [{ role: "in", preset: "fade" }] }
      }
    ];
    const provider = createScriptedProvider(script);
    const report = await runToolLoopEval({
      provider,
      model: "test-model",
      cases: [TIMELINE_TOOL_LOOP_CASES[0]]
    });

    expect(report.cases[0].accepted).toBe(true);
    expect(report.cases[0].score).toBe(1);
  });

  it("generate-and-arrange: add_track, generate_clip, then move_clip", async () => {
    const script: ScriptedCall[] = [
      { name: "ui_timeline_get_state", args: {} },
      { name: "ui_timeline_add_track", args: { type: "video" } },
      {
        name: "ui_timeline_generate_clip",
        args: {
          kind: "text-to-video",
          prompt: "a cat playing piano",
          trackId: "track_1",
          provider: "fal_ai",
          model: "fal-ai/veo3"
        }
      },
      {
        name: "ui_timeline_move_clip",
        args: { target: "selected", startMs: 2000 }
      }
    ];
    const provider = createScriptedProvider(script);
    const report = await runToolLoopEval({
      provider,
      model: "test-model",
      cases: [TIMELINE_TOOL_LOOP_CASES[1]]
    });

    expect(report.cases[0].accepted).toBe(true);
    expect(report.cases[0].score).toBe(1);
  });

  it("cut-and-trim: split_clip by name then delete_clip the second half", async () => {
    const script: ScriptedCall[] = [
      { name: "ui_timeline_get_state", args: {} },
      {
        name: "ui_timeline_split_clip",
        args: { target: "shot", atMs: 3000 }
      },
      // The bridge assigns deterministic ids: the pre-seeded clip is clip_1,
      // so the split's left/right halves become clip_2 (kept, "shot") and
      // clip_3 (the second half, deleted here).
      { name: "ui_timeline_delete_clip", args: { target: "clip_3" } }
    ];
    const provider = createScriptedProvider(script);
    const report = await runToolLoopEval({
      provider,
      model: "test-model",
      cases: [TIMELINE_TOOL_LOOP_CASES[2]]
    });

    expect(report.cases[0].accepted).toBe(true);
    expect(report.cases[0].score).toBe(1);
  });
});
