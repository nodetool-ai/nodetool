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
  it("exposes exactly the 10 ui_storyboard_* tools", () => {
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
        "ui_storyboard_extract_script",
        "ui_storyboard_select_shot"
      ].sort()
    );
    expect(names).toHaveLength(10);
  });

  it("rejects a set_screenplay call with an invalid object", async () => {
    const bridge = createStoryboardToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    // The parameter schema names `type` and `shots`, so the call is refused
    // before the bridge runs.
    await expect(
      byName["ui_storyboard_set_screenplay"].execute({
        screenplay: { not: "a screenplay" }
      })
    ).rejects.toThrow(/shots/);
  });

  // The shape a model writes when it authors a screenplay instead of copying
  // one: no `type`, `id`, `index` or `status` on any shot, duration camelCase.
  // This is what `author-screenplay` asks a real model to produce.
  const authoredScreenplay = {
    type: "screenplay",
    title: "Lighthouse Dawn",
    shots: [
      {
        slug: "Dusk",
        action: "A lighthouse at dusk",
        camera: { framing: "wide" },
        durationSeconds: 4
      },
      {
        slug: "The climb",
        action: "The keeper climbs the stairs",
        camera: { framing: "medium" },
        durationSeconds: 6
      }
    ]
  };

  it("normalizes an authored screenplay into savable shots", async () => {
    const bridge = createStoryboardToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    const result = (await byName["ui_storyboard_set_screenplay"].execute({
      screenplay: authoredScreenplay
    })) as {
      ok: boolean;
      title: string;
      shots: { index: number; action: string; durationSeconds?: number }[];
    };

    expect(result.ok).toBe(true);
    expect(result.title).toBe("Lighthouse Dawn");
    expect(result.shots).toHaveLength(2);
    expect(result.shots.map((s) => s.index)).toEqual([0, 1]);
    expect(result.shots.map((s) => s.durationSeconds)).toEqual([4, 6]);
  });

  it("reports the board as savable after an authored screenplay loads", async () => {
    const bridge = createStoryboardToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    await byName["ui_storyboard_set_screenplay"].execute({
      screenplay: authoredScreenplay
    });

    const state = bridge.finalState();
    expect(state.saveIssues).toEqual([]);
    expect(state.savable).toBe(true);
  });

  it("reports the board as savable after add_shot and generate", async () => {
    const bridge = createStoryboardToolBridge();
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    const added = (await byName["ui_storyboard_add_shot"].execute({
      action: "A dog runs across a field.",
      durationSeconds: 3
    })) as { shot: { id: string } };
    await byName["ui_storyboard_generate_keyframe"].execute({
      target: added.shot.id
    });
    await byName["ui_storyboard_generate_clip"].execute({
      target: added.shot.id
    });

    const state = bridge.finalState();
    expect(state.saveIssues).toEqual([]);
    expect(state.shots[0].hasClip).toBe(true);
    expect(state.shots[0].durationSeconds).toBe(3);
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

  it("extracts spoken shots into a linked script, and refuses a second extract", async () => {
    const bridge = createStoryboardToolBridge({
      shots: [
        { action: "The keeper looks out.", dialogue: "The light goes out." },
        { action: "The stairs.", narration: "Forty years of them." },
        { action: "A silent wave." }
      ]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));

    const extracted = (await byName["ui_storyboard_extract_script"].execute(
      {}
    )) as { ok: boolean; lineCount: number; linkedShotIds: string[] };
    expect(extracted.ok).toBe(true);
    expect(extracted.lineCount).toBe(2);
    // The silent shot links nothing — it has no words to own.
    expect(extracted.linkedShotIds).toHaveLength(2);

    const state = bridge.finalState();
    expect(state.scriptId).toBe("script_1");
    expect(state.scriptLineCount).toBe(2);
    expect(state.savable).toBe(true);

    await expect(
      byName["ui_storyboard_extract_script"].execute({})
    ).rejects.toThrow(/already links script/);

    const relinked = (await byName["ui_storyboard_extract_script"].execute({
      relink: true
    })) as { ok: boolean; relinked: boolean };
    expect(relinked).toMatchObject({ ok: true, relinked: true });
  });

  it("refuses to extract a script from a board with no words", async () => {
    const bridge = createStoryboardToolBridge({
      shots: [{ action: "A silent wave." }]
    });
    const byName = Object.fromEntries(bridge.tools.map((t) => [t.name, t]));
    await expect(
      byName["ui_storyboard_extract_script"].execute({})
    ).rejects.toThrow(/nothing to extract/);
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

  it("extract-script: extracting a spoken board's words passes", async () => {
    const script: ScriptedCall[] = [
      { name: "ui_storyboard_get_state", args: {} },
      { name: "ui_storyboard_extract_script", args: {} }
    ];
    const provider = createScriptedProvider(script);
    const report = await runToolLoopEval({
      provider,
      model: "test-model",
      cases: [
        STORYBOARD_TOOL_LOOP_CASES.find((c) => c.id === "extract-script")!
      ]
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
