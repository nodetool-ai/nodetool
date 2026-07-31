/**
 * Tests for the long-horizon creative-pipeline surface
 * (`src/evals/surfaces/creative-pipeline.ts`):
 *   - `createCreativePipelineBridge`: composition of the three real creative
 *     surfaces plus brief/review instrumentation, and the cross-surface
 *     handoff that replaces the storyboard bridge's assemble stub.
 *   - `CREATIVE_PIPELINE_TOOL_LOOP_CASES`: each case is solvable end-to-end
 *     via `runToolLoopEval` driven by a scripted provider — no network.
 *
 * The cases are graded on behaviour a model can fail while still driving each
 * individual surface correctly, so the tests below prove both directions: a
 * scripted run that does the job scores 1, and a scripted run that skips the
 * fix-after-review step does not.
 */
import { describe, it, expect } from "vitest";
import type {
  BaseProvider,
  ProviderStreamItem,
  ProviderTool
} from "@nodetool-ai/runtime";
import { runToolLoopEval } from "../src/evals/tool-loop-eval.js";
import {
  createCreativePipelineBridge,
  CREATIVE_PIPELINE_TOOL_LOOP_CASES,
  LANTERN_BRIEF
} from "../src/evals/surfaces/creative-pipeline.js";

interface ScriptedCall {
  name: string;
  args: Record<string, unknown>;
}

/** Replays a fixed tool-call list through the tools' own `execute` closures. */
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

const bridgeOf = () => createCreativePipelineBridge({ brief: LANTERN_BRIEF });

/** Run one tool by name against a bridge. */
async function call(
  bridge: ReturnType<typeof bridgeOf>,
  name: string,
  args: Record<string, unknown> = {}
) {
  const tool = bridge.tools.find((t) => t.name === name);
  if (!tool) throw new Error(`no tool ${name}`);
  return tool.execute(args);
}

describe("createCreativePipelineBridge", () => {
  it("composes all three creative surfaces plus brief and review tools", () => {
    const names = bridgeOf().tools.map((t) => t.name);
    expect(names.filter((n) => n.startsWith("ui_sketch_")).length).toBeGreaterThan(5);
    expect(names.filter((n) => n.startsWith("ui_storyboard_")).length).toBeGreaterThan(5);
    expect(names.filter((n) => n.startsWith("ui_timeline_")).length).toBeGreaterThan(5);
    expect(names).toContain("ui_brief_get");
    expect(names).toContain("ui_brief_propose_concepts");
    expect(names).toContain("ui_brief_choose_concept");
    expect(names).toContain("ui_review_get_cut");
    expect(names).toContain("ui_review_submit_notes");
  });

  it("exposes exactly one assemble tool — the replacement, not the stub", () => {
    const assemble = bridgeOf().tools.filter(
      (t) => t.name === "ui_storyboard_assemble_timeline"
    );
    expect(assemble).toHaveLength(1);
  });

  it("records briefReadBeforeWork only when the brief precedes surface edits", async () => {
    const early = bridgeOf();
    await call(early, "ui_brief_get");
    await call(early, "ui_sketch_add_layer", { name: "Sky" });
    expect(early.finalState().briefReadBeforeWork).toBe(true);

    const late = bridgeOf();
    await call(late, "ui_sketch_add_layer", { name: "Sky" });
    await call(late, "ui_brief_get");
    expect(late.finalState().briefReadBeforeWork).toBe(false);
  });

  it("refuses to assemble a timeline before any shot has a rendered clip", async () => {
    const bridge = bridgeOf();
    await call(bridge, "ui_storyboard_add_shot", { action: "hands at sunrise" });
    await expect(
      call(bridge, "ui_storyboard_assemble_timeline")
    ).rejects.toThrow(/rendered clip/i);
  });

  it("lays one real timeline clip per rendered shot, overshooting the request", async () => {
    const bridge = bridgeOf();
    await call(bridge, "ui_storyboard_add_shot", {
      action: "hands lifting a cup at sunrise",
      durationSeconds: 4
    });
    await call(bridge, "ui_storyboard_generate_keyframe", { target: "0" });
    await call(bridge, "ui_storyboard_generate_clip", { target: "0" });
    await call(bridge, "ui_storyboard_assemble_timeline");

    const state = bridge.finalState();
    expect(state.timelineAssembled).toBe(true);
    expect(state.timeline.clips).toHaveLength(1);
    // 4s requested comes back at 4 * 1.35 = 5.4s — the planted defect.
    expect(state.cutDurationSeconds).toBeCloseTo(5.4, 3);
  });

  it("counts timeline edits only after review notes are filed", async () => {
    const bridge = bridgeOf();
    await call(bridge, "ui_storyboard_add_shot", {
      action: "hands at sunrise",
      durationSeconds: 4
    });
    await call(bridge, "ui_storyboard_generate_keyframe", { target: "0" });
    await call(bridge, "ui_storyboard_generate_clip", { target: "0" });
    await call(bridge, "ui_storyboard_assemble_timeline");
    // Assembly itself mutates the timeline but precedes any review.
    expect(bridge.finalState().editsAfterReview).toBe(0);

    await call(bridge, "ui_review_get_cut");
    await call(bridge, "ui_review_submit_notes", {
      notes: [{ severity: "blocker", note: "runtime overruns the brief" }]
    });
    expect(bridge.finalState().editsAfterReview).toBe(0);

    const clipId = bridge.finalState().timeline.clips[0].id;
    await call(bridge, "ui_timeline_trim_clip", {
      target: clipId,
      durationMs: 3000
    });
    expect(bridge.finalState().editsAfterReview).toBe(1);
    expect(bridge.finalState().cutDurationSeconds).toBeCloseTo(3, 3);
  });

  it("accepts the severity words a model actually uses", async () => {
    // A live claude_agent_sdk run failed here on a three-value enum: the model
    // said "critical" and the tool threw. The vocabulary is this harness's,
    // so synonyms map rather than error.
    const bridge = bridgeOf();
    await call(bridge, "ui_review_submit_notes", {
      notes: [
        { severity: "critical", note: "overruns" },
        { severity: "HIGH", note: "still long" },
        { severity: "low", note: "colour drift" },
        { severity: "medium", note: "pacing", targetClipId: null },
        { severity: "wat", note: "unrecognised" }
      ]
    });
    expect(bridge.finalState().reviewNotes.map((n) => n.severity)).toEqual([
      "blocker",
      "blocker",
      "minor",
      "major",
      "major"
    ]);
  });

  it("rejects committing to a concept that was never proposed", async () => {
    const bridge = bridgeOf();
    await expect(
      call(bridge, "ui_brief_choose_concept", { conceptId: "concept_9" })
    ).rejects.toThrow(/No concept with id/);
  });
});

// --- end-to-end through the runner -------------------------------------------

/** A scripted run that does the whole job, including the post-review fix. */
function fullPipelineScript(): ScriptedCall[] {
  const shots = [
    "hands grinding beans before sunrise",
    "sunrise light across the drying beds",
    "hands pouring cold brew over ice"
  ];
  const script: ScriptedCall[] = [
    { name: "ui_brief_get", args: {} },
    {
      name: "ui_brief_propose_concepts",
      args: {
        concepts: [
          { title: "Origin Hands", premise: "The people who grow it." },
          { title: "First Light", premise: "One sunrise, start to cup." },
          { title: "Cold Chain", premise: "Altitude down to the glass." }
        ]
      }
    },
    { name: "ui_brief_choose_concept", args: { conceptId: "concept_1" } },
    { name: "ui_sketch_set_color", args: { foreground: "#e8c39e" } },
    {
      name: "ui_sketch_generate",
      args: { kind: "text-to-image", prompt: "warm sunrise over a coffee farm" }
    }
  ];
  shots.forEach((action, i) => {
    script.push({
      name: "ui_storyboard_add_shot",
      args: { action, camera: { framing: "close-up" }, durationSeconds: 3 }
    });
    script.push({
      name: "ui_storyboard_generate_keyframe",
      args: { target: String(i) }
    });
    script.push({
      name: "ui_storyboard_generate_clip",
      args: { target: String(i) }
    });
  });
  script.push({ name: "ui_storyboard_assemble_timeline", args: {} });
  script.push({ name: "ui_review_get_cut", args: {} });
  script.push({
    name: "ui_review_submit_notes",
    args: {
      notes: [
        {
          severity: "blocker",
          note: "Delivered runtime is 12.15s, over the 12s ceiling in the brief."
        }
      ]
    }
  });
  // 3 shots * 3s * 1.35 = 12.15s, over the brief's 12s.
  //
  // The trim has to land on the LAST clip. Runtime is the furthest clip end,
  // and trimming an earlier clip only opens a gap — the clips after it keep
  // their start times, so the sequence is exactly as long as it was. A model
  // that trims the wrong clip and re-measures with ui_review_get_cut sees that
  // immediately; one that trims and declares victory does not, which is the
  // discrimination this case exists to make.
  script.push({
    name: "ui_timeline_trim_clip",
    args: { target: "clip_3", durationMs: 3000 }
  });
  return script;
}

describe("CREATIVE_PIPELINE_TOOL_LOOP_CASES", () => {
  it("registers three cases, each solvable without configured providers", () => {
    expect(CREATIVE_PIPELINE_TOOL_LOOP_CASES).toHaveLength(3);
    for (const c of CREATIVE_PIPELINE_TOOL_LOOP_CASES) {
      // The bridge fakes every generate/render job, so no case depends on a
      // real provider being configured — marking them otherwise would silently
      // skip the whole suite on a machine with no model providers.
      expect(c.needsModelProviders).toBeUndefined();
      expect(c.systemPrompt).toBeTruthy();
    }
  });

  it("scores a complete scripted run at 1 on the full-pipeline case", async () => {
    const report = await runToolLoopEval({
      provider: createScriptedProvider(fullPipelineScript()),
      model: "scripted",
      cases: CREATIVE_PIPELINE_TOOL_LOOP_CASES.filter(
        (c) => c.id === "full-pipeline"
      )
    });
    const [result] = report.cases;
    const failed = result.checks.filter((c) => !c.pass);
    expect(failed.map((f) => `${f.name}: ${f.detail ?? ""}`)).toEqual([]);
    expect(result.score).toBe(1);
  });

  it("fails the review checks when notes are filed but nothing is fixed", async () => {
    // Same run, minus the trim: the cut still overruns and nothing changed
    // after the review — exactly the failure the case is built to catch.
    const script = fullPipelineScript().filter(
      (c) => c.name !== "ui_timeline_trim_clip"
    );
    const report = await runToolLoopEval({
      provider: createScriptedProvider(script),
      model: "scripted",
      cases: CREATIVE_PIPELINE_TOOL_LOOP_CASES.filter(
        (c) => c.id === "full-pipeline"
      )
    });
    const [result] = report.cases;
    const failedNames = result.checks.filter((c) => !c.pass).map((c) => c.name);
    expect(failedNames).toContain("state:reviewActedOn");
    expect(failedNames).toContain("state:withinBriefRuntime");
    expect(result.score).toBeLessThan(1);
  });

  it("fails the brief checks when a forbidden element reaches the board", async () => {
    const script = fullPipelineScript().map((c) =>
      c.name === "ui_storyboard_add_shot" &&
      (c.args as { action?: string }).action?.includes("grinding")
        ? {
            ...c,
            args: { ...c.args, action: "a logo card over the grinder" }
          }
        : c
    );
    const report = await runToolLoopEval({
      provider: createScriptedProvider(script),
      model: "scripted",
      cases: CREATIVE_PIPELINE_TOOL_LOOP_CASES.filter(
        (c) => c.id === "full-pipeline"
      )
    });
    const failedNames = report.cases[0].checks
      .filter((c) => !c.pass)
      .map((c) => c.name);
    expect(failedNames).toContain("state:forbiddenAvoided");
  });
});
