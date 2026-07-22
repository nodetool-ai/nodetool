/**
 * Tests for the Storyboard headless tool-loop surface
 * (`src/evals/surfaces/storyboard.ts`):
 *   - `createStoryboardToolBridge`: headless execution of the
 *     `ui_storyboard_*` tool contract against an in-memory shot list.
 *   - `STORYBOARD_TOOL_LOOP_CASES`: each case is solvable end-to-end via
 *     `runToolLoopEval` driven by a scripted provider — no network.
 */
import { describe, it, expect } from "vitest";
import type {
  BaseProvider,
  ProviderStreamItem,
  ProviderTool
} from "@nodetool-ai/runtime";
import { runToolLoopEval } from "../src/evals/tool-loop-eval.js";
import {
  createStoryboardToolBridge,
  STORYBOARD_TOOL_LOOP_CASES,
  SAMPLE_SCREENPLAY
} from "../src/evals/surfaces/storyboard.js";

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

// --- createStoryboardToolBridge ----------------------------------------------

describe("createStoryboardToolBridge", () => {
  it("exposes exactly the 9 ui_storyboard_* tools", () => {
    const bridge = createStoryboardToolBridge();
    const names = bridge.tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        "ui_storyboard_get_state",
        "ui_storyboard_set_screenplay",
        "ui_storyboard_add_shot",
        "ui_storyboard_update_shot",
        "ui_storyboard_generate_keyframe",
        "ui_storyboard_generate_clip",
        "ui_storyboard_revise_shot",
        "ui_storyboard_assemble_timeline",
        "ui_storyboard_select_shot"
      ].sort()
    );
    expect(names).toHaveLength(9);
  });

  it("rejects a set_screenplay call with an invalid object", async () => {
    const bridge = createStoryboardToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await expect(
      byName["ui_storyboard_set_screenplay"].execute({
        screenplay: { not: "a screenplay" }
      })
    ).rejects.toThrow(/must be a Screenplay object/);
  });

  it("errors generating a clip without a keyframe first", async () => {
    const bridge = createStoryboardToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    const added = (await byName["ui_storyboard_add_shot"].execute({
      action: "A dog runs across a field."
    })) as { ok: boolean; shot: { id: string } };

    await expect(
      byName["ui_storyboard_generate_clip"].execute({
        target: added.shot.id
      })
    ).rejects.toThrow(/must have a still/);
  });

  it("errors revising a shot without a clip first", async () => {
    const bridge = createStoryboardToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    const added = (await byName["ui_storyboard_add_shot"].execute({
      action: "A dog runs across a field."
    })) as { ok: boolean; shot: { id: string } };

    await expect(
      byName["ui_storyboard_revise_shot"].execute({
        target: added.shot.id,
        instruction: "make it darker"
      })
    ).rejects.toThrow(/no clip to revise/);
  });

  it("errors assembling a timeline with no rendered clips", async () => {
    const bridge = createStoryboardToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_storyboard_add_shot"].execute({
      action: "A dog runs across a field."
    });

    await expect(
      byName["ui_storyboard_assemble_timeline"].execute({})
    ).rejects.toThrow(/No shot has a rendered clip/);
  });

  it("drives the happy path: keyframe -> clip -> assemble", async () => {
    const bridge = createStoryboardToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    const added = (await byName["ui_storyboard_add_shot"].execute({
      action: "A dog runs across a field."
    })) as { ok: boolean; shot: { id: string } };
    const shotId = added.shot.id;

    const keyframed = (await byName["ui_storyboard_generate_keyframe"].execute(
      { target: shotId }
    )) as { ok: boolean; shot: { status: string; hasKeyframe: boolean } };
    expect(keyframed.shot.status).toBe("keyframe_ready");
    expect(keyframed.shot.hasKeyframe).toBe(true);

    const clipped = (await byName["ui_storyboard_generate_clip"].execute({
      target: shotId
    })) as { ok: boolean; shot: { status: string; hasClip: boolean } };
    expect(clipped.shot.status).toBe("rendered");
    expect(clipped.shot.hasClip).toBe(true);

    const assembled = (await byName["ui_storyboard_assemble_timeline"].execute(
      {}
    )) as {
      ok: boolean;
      sequenceId: string;
      clipCount: number;
      skippedShotIds: string[];
    };
    expect(assembled.ok).toBe(true);
    expect(assembled.sequenceId).toBe("seq_1");
    expect(assembled.clipCount).toBe(1);
    expect(assembled.skippedShotIds).toEqual([]);

    const final = bridge.finalState();
    expect(final.shots).toHaveLength(1);
    expect(final.shots[0].hasClip).toBe(true);
  });

  it("resolves targets by 0-based index and by 'selected'", async () => {
    const bridge = createStoryboardToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_storyboard_add_shot"].execute({ action: "Shot A" });
    await byName["ui_storyboard_add_shot"].execute({ action: "Shot B" });

    const byIndex = (await byName["ui_storyboard_update_shot"].execute({
      target: "1",
      action: "Shot B revised"
    })) as { ok: boolean; shot: { action: string } };
    expect(byIndex.shot.action).toBe("Shot B revised");

    const selected = (await byName["ui_storyboard_select_shot"].execute({
      target: "1"
    })) as { ok: boolean; selected: { id: string } };
    expect(bridge.finalState().selectedShotId).toBe(selected.selected.id);

    const patched = (await byName["ui_storyboard_update_shot"].execute({
      target: "selected",
      motion: "slow pan"
    })) as { ok: boolean; shot: { motion?: string } };
    expect(patched.shot.motion).toBe("slow pan");

    const cleared = (await byName["ui_storyboard_select_shot"].execute({
      target: null
    })) as { ok: boolean; selected: null };
    expect(cleared.selected).toBeNull();
    expect(bridge.finalState().selectedShotId).toBeNull();
  });

  it("loads a valid screenplay, replacing existing shots", async () => {
    const bridge = createStoryboardToolBridge({
      shots: [{ action: "A shot that will be replaced." }]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    const result = (await byName["ui_storyboard_set_screenplay"].execute({
      screenplay: SAMPLE_SCREENPLAY as unknown as Record<string, unknown>
    })) as { ok: boolean; hasScreenplay: boolean; title: string };
    expect(result.ok).toBe(true);
    expect(result.hasScreenplay).toBe(true);
    expect(result.title).toBe(SAMPLE_SCREENPLAY.title);

    const final = bridge.finalState();
    expect(final.hasScreenplay).toBe(true);
    expect(final.shots).toHaveLength(SAMPLE_SCREENPLAY.shots.length);
    expect(final.title).toBe(SAMPLE_SCREENPLAY.title);
  });
});

// --- STORYBOARD_TOOL_LOOP_CASES via runToolLoopEval --------------------------

describe("STORYBOARD_TOOL_LOOP_CASES", () => {
  it("board-from-scratch: adding 3 shots and selecting the first passes", async () => {
    const script: ScriptedCall[] = [
      { name: "ui_storyboard_get_state", args: {} },
      {
        name: "ui_storyboard_add_shot",
        args: {
          action: "A lighthouse stands against a darkening sky.",
          camera: { framing: "wide" }
        }
      },
      {
        name: "ui_storyboard_add_shot",
        args: {
          action: "The keeper climbs a spiral staircase.",
          camera: { framing: "medium" }
        }
      },
      {
        name: "ui_storyboard_add_shot",
        args: {
          action: "The lighthouse beam flickers and dies at dawn.",
          camera: { framing: "close-up" }
        }
      },
      { name: "ui_storyboard_select_shot", args: { target: "0" } }
    ];
    const provider = createScriptedProvider(script);
    const report = await runToolLoopEval({
      provider,
      model: "test-model",
      cases: [STORYBOARD_TOOL_LOOP_CASES[0]]
    });
    const r = report.cases[0];
    expect(r.accepted).toBe(true);
    expect(r.score).toBe(1);
  });

  it("render-pipeline: keyframe -> clip for each of 2 shots, then assemble passes", async () => {
    const script: ScriptedCall[] = [
      { name: "ui_storyboard_get_state", args: {} },
      { name: "ui_storyboard_generate_keyframe", args: { target: "shot_1" } },
      { name: "ui_storyboard_generate_clip", args: { target: "shot_1" } },
      { name: "ui_storyboard_generate_keyframe", args: { target: "shot_2" } },
      { name: "ui_storyboard_generate_clip", args: { target: "shot_2" } },
      { name: "ui_storyboard_assemble_timeline", args: {} }
    ];
    const provider = createScriptedProvider(script);
    const report = await runToolLoopEval({
      provider,
      model: "test-model",
      cases: [STORYBOARD_TOOL_LOOP_CASES[1]]
    });
    const r = report.cases[0];
    expect(r.accepted).toBe(true);
    expect(r.score).toBe(1);
  });

  it("load-screenplay: loading the sample screenplay passes", async () => {
    const script: ScriptedCall[] = [
      { name: "ui_storyboard_get_state", args: {} },
      {
        name: "ui_storyboard_set_screenplay",
        args: {
          screenplay: SAMPLE_SCREENPLAY as unknown as Record<string, unknown>
        }
      }
    ];
    const provider = createScriptedProvider(script);
    const report = await runToolLoopEval({
      provider,
      model: "test-model",
      cases: [STORYBOARD_TOOL_LOOP_CASES[2]]
    });
    const r = report.cases[0];
    expect(r.accepted).toBe(true);
    expect(r.score).toBe(1);
  });
});
