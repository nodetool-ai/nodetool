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
  LANTERN_BRIEF,
  TIDEWATCH_BRIEF
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

const linkedBridge = () =>
  createCreativePipelineBridge({ brief: TIDEWATCH_BRIEF });

/** Write a voiced 2-line narration on a bridge, returning nothing. */
async function writeNarration(bridge: ReturnType<typeof bridgeOf>) {
  await call(bridge, "ui_script_add_speaker", {
    name: "Narrator",
    voice: { provider: "elevenlabs", model: "eleven_v3", voice: "rachel" }
  });
  await call(bridge, "ui_script_add_line", {
    text: "The river mouth was closed for thirty years.",
    speakerId: "spk_1"
  });
  await call(bridge, "ui_script_add_line", {
    text: "It reopened in a single winter.",
    speakerId: "spk_1"
  });
  await call(bridge, "ui_script_voice_all");
}

describe("createCreativePipelineBridge", () => {
  it("composes all four creative surfaces plus brief and review tools", () => {
    const names = bridgeOf().tools.map((t) => t.name);
    expect(names.filter((n) => n.startsWith("ui_script_")).length).toBeGreaterThan(5);
    expect(names).toContain("validate_timeline");
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

  it("counts revisions from assembly, so fix-then-report scores like report-then-fix", async () => {
    const seed = async (bridge: ReturnType<typeof bridgeOf>) => {
      await call(bridge, "ui_storyboard_add_shot", {
        action: "hands at sunrise",
        durationSeconds: 4
      });
      await call(bridge, "ui_storyboard_generate_keyframe", { target: "0" });
      await call(bridge, "ui_storyboard_generate_clip", { target: "0" });
      await call(bridge, "ui_storyboard_assemble_timeline");
      // The clips assembly lays down are not the model's own revisions.
      expect(bridge.finalState().editsAfterAssembly).toBe(0);
    };
    const notes = {
      notes: [{ severity: "blocker", note: "runtime overruns the brief" }]
    };
    const trim = (bridge: ReturnType<typeof bridgeOf>) =>
      call(bridge, "ui_timeline_trim_clip", {
        target: bridge.finalState().timeline.clips[0].id,
        durationMs: 3000
      });

    // Report, then fix.
    const reportFirst = bridgeOf();
    await seed(reportFirst);
    await call(reportFirst, "ui_review_get_cut");
    await call(reportFirst, "ui_review_submit_notes", notes);
    await trim(reportFirst);

    // Fix, verify, then report — what a live sonnet run actually did.
    const fixFirst = bridgeOf();
    await seed(fixFirst);
    await trim(fixFirst);
    await call(fixFirst, "ui_review_get_cut");
    await call(fixFirst, "ui_review_submit_notes", notes);

    for (const b of [reportFirst, fixFirst]) {
      expect(b.finalState().editsAfterAssembly).toBe(1);
      expect(b.finalState().cutDurationSeconds).toBeCloseTo(3, 3);
    }
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

  it("lays one shot per script line when the board is derived, keeping the linkage", async () => {
    const bridge = linkedBridge();
    await writeNarration(bridge);
    await call(bridge, "ui_script_derive_storyboard");

    const state = bridge.finalState();
    expect(state.scriptLinked).toBe(true);
    expect(state.storyboard.shots).toHaveLength(2);
    expect(state.scriptLineIdsByShotId).toEqual({
      shot_1: ["line_1"],
      shot_2: ["line_2"]
    });
  });

  it("assembles words and pictures into one cut once the board is linked", async () => {
    const bridge = linkedBridge();
    await writeNarration(bridge);
    await call(bridge, "ui_script_derive_storyboard");
    for (const target of ["0", "1"]) {
      await call(bridge, "ui_storyboard_generate_keyframe", { target });
      await call(bridge, "ui_storyboard_generate_clip", { target });
    }
    const assembled = (await call(
      bridge,
      "ui_storyboard_assemble_timeline"
    )) as { linked: boolean; skippedLineIds: string[] };
    expect(assembled.linked).toBe(true);
    expect(assembled.skippedLineIds).toEqual([]);

    const state = bridge.finalState();
    expect(state.assembledLinked).toBe(true);
    // Two shot clips plus one voiceover clip per voiced line.
    expect(state.timeline.clips).toHaveLength(4);
    const voice = state.timeline.documentClips.filter((c) => c.scriptLineId);
    expect(voice).toHaveLength(2);
    for (const clip of voice) {
      expect(clip.scriptId).toBeTruthy();
      expect(clip.storyboardBoardId).toBeTruthy();
      expect(clip.storyboardShotId).toBeTruthy();
    }
    // Shot length comes from the takes, not from the render overshoot: 8 words
    // in the first line and 6 in the second, at 350ms each.
    expect(state.cutDurationSeconds).toBeCloseTo(14 * 0.35, 3);
  });

  it("keeps editing the cut the linked assemble produced, not the one it replaced", async () => {
    const bridge = linkedBridge();
    await writeNarration(bridge);
    await call(bridge, "ui_script_derive_storyboard");
    for (const target of ["0", "1"]) {
      await call(bridge, "ui_storyboard_generate_keyframe", { target });
      await call(bridge, "ui_storyboard_generate_clip", { target });
    }
    await call(bridge, "ui_storyboard_assemble_timeline");

    const firstClipId = bridge.finalState().timeline.clips[0].id;
    await call(bridge, "ui_timeline_trim_clip", {
      target: firstClipId,
      durationMs: 1000
    });
    const trimmed = bridge
      .finalState()
      .timeline.clips.find((c) => c.id === firstClipId);
    expect(trimmed?.durationMs).toBe(1000);
    expect(bridge.finalState().editsAfterAssembly).toBe(1);
  });

  it("validates the jointly-assembled cut with the shipped timeline validator", async () => {
    const bridge = linkedBridge();
    await writeNarration(bridge);
    await call(bridge, "ui_script_derive_storyboard");
    for (const target of ["0", "1"]) {
      await call(bridge, "ui_storyboard_generate_keyframe", { target });
      await call(bridge, "ui_storyboard_generate_clip", { target });
    }
    await call(bridge, "ui_storyboard_assemble_timeline");
    const validated = (await call(bridge, "validate_timeline")) as {
      ok: boolean;
      errors: unknown[];
    };
    expect(validated.errors).toEqual([]);
    expect(validated.ok).toBe(true);
    expect(bridge.finalState().timelineValidation?.ok).toBe(true);
  });

  it("reports a cut the validator refuses rather than calling it green", async () => {
    // The check has to be able to fail: a clip dragged past the sequence into
    // negative time is exactly what the validator exists to catch.
    const bridge = linkedBridge();
    await writeNarration(bridge);
    await call(bridge, "ui_script_derive_storyboard");
    await call(bridge, "ui_storyboard_generate_keyframe", { target: "0" });
    await call(bridge, "ui_storyboard_generate_clip", { target: "0" });
    await call(bridge, "ui_storyboard_assemble_timeline");
    const clipId = bridge.finalState().timeline.clips[0].id;
    await call(bridge, "ui_timeline_trim_clip", {
      target: clipId,
      durationMs: 0
    });
    await call(bridge, "validate_timeline");
    expect(bridge.finalState().timelineValidation?.ok).toBe(false);
  });

  it("still assembles one clip per rendered shot when no script is linked", async () => {
    const bridge = bridgeOf();
    await call(bridge, "ui_storyboard_add_shot", {
      action: "hands at sunrise",
      durationSeconds: 4
    });
    await call(bridge, "ui_storyboard_generate_keyframe", { target: "0" });
    await call(bridge, "ui_storyboard_generate_clip", { target: "0" });
    const assembled = (await call(
      bridge,
      "ui_storyboard_assemble_timeline"
    )) as { linked: boolean };
    expect(assembled.linked).toBe(false);
    expect(bridge.finalState().assembledLinked).toBe(false);
    expect(bridge.finalState().cutDurationSeconds).toBeCloseTo(5.4, 3);
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

/** A scripted run of the linked case: script → derive → render → cut → check. */
function linkedPipelineScript(): ScriptedCall[] {
  const lines = [
    "The river mouth was closed for thirty years.",
    "One winter storm opened it again.",
    "The fish came back before the surveyors did."
  ];
  const script: ScriptedCall[] = [
    { name: "ui_brief_get", args: {} },
    {
      name: "ui_script_add_speaker",
      args: {
        name: "Narrator",
        voice: { provider: "elevenlabs", model: "eleven_v3", voice: "rachel" }
      }
    }
  ];
  for (const text of lines) {
    script.push({
      name: "ui_script_add_line",
      args: { text, speakerId: "spk_1" }
    });
  }
  script.push({ name: "ui_script_voice_all", args: {} });
  script.push({ name: "ui_script_derive_storyboard", args: {} });
  lines.forEach((_, i) => {
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
  script.push({ name: "validate_timeline", args: {} });
  return script;
}

describe("CREATIVE_PIPELINE_TOOL_LOOP_CASES", () => {
  it("registers four cases, each solvable without configured providers", () => {
    expect(CREATIVE_PIPELINE_TOOL_LOOP_CASES).toHaveLength(4);
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
    expect(failedNames).toContain("state:cutRevisedAfterAssembly");
    expect(failedNames).toContain("state:withinBriefRuntime");
    expect(result.score).toBeLessThan(1);
  });

  it("scores a complete scripted run at 1 on the linked case", async () => {
    const report = await runToolLoopEval({
      provider: createScriptedProvider(linkedPipelineScript()),
      model: "scripted",
      cases: CREATIVE_PIPELINE_TOOL_LOOP_CASES.filter(
        (c) => c.id === "script-to-linked-cut"
      )
    });
    const [result] = report.cases;
    const failed = result.checks.filter((c) => !c.pass);
    expect(failed.map((f) => `${f.name}: ${f.detail ?? ""}`)).toEqual([]);
    expect(result.score).toBe(1);
  });

  it("fails the linked case when the board is built by hand instead of derived", async () => {
    // Same job, same tools, no link: the shots render and the cut assembles,
    // but the words never reach the timeline — the failure this case exists
    // to separate from a run that looks identical in its call list.
    const script = linkedPipelineScript().flatMap<ScriptedCall>((c) =>
      c.name === "ui_script_derive_storyboard"
        ? [
            {
              name: "ui_storyboard_add_shot",
              args: { action: "the river mouth, closed" }
            },
            {
              name: "ui_storyboard_add_shot",
              args: { action: "a winter storm at the bar" }
            },
            {
              name: "ui_storyboard_add_shot",
              args: { action: "fish moving through the new channel" }
            }
          ]
        : [c]
    );
    const report = await runToolLoopEval({
      provider: createScriptedProvider(script),
      model: "scripted",
      cases: CREATIVE_PIPELINE_TOOL_LOOP_CASES.filter(
        (c) => c.id === "script-to-linked-cut"
      )
    });
    const failedNames = report.cases[0].checks
      .filter((c) => !c.pass)
      .map((c) => c.name);
    expect(failedNames).toContain("state:boardDerivedFromScript");
    expect(failedNames).toContain("state:assembledJointly");
    expect(failedNames).toContain("state:clipsCarryBothLinks");
    expect(report.cases[0].score).toBeLessThan(1);
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
