/**
 * Run one creative-pipeline eval case live and dump everything it produced:
 * the full tool transcript with arguments and results, and a state snapshot at
 * each phase boundary.
 *
 * The eval itself only reports pass/fail plus tool-call counts, which is the
 * right shape for a scoreboard and useless for seeing what the model actually
 * made. This exists to look at the work.
 *
 *   IS_SANDBOX=1 npx tsx packages/agents/scripts/dump-creative-run.ts \
 *     full-pipeline claude_agent_sdk sonnet 220
 */
import fs from "node:fs";
import path from "node:path";
import { zodToJsonSchema } from "@nodetool-ai/runtime";
import { createProviderStrict } from "../../cli/src/providers.js";
import {
  CREATIVE_PIPELINE_TOOL_LOOP_CASES,
  createCreativePipelineBridge,
  LANTERN_BRIEF,
  ATLAS_BRIEF,
  type CreativePipelineFinalState,
  type MediaBackend
} from "../src/evals/surfaces/creative-pipeline.js";

const argv = process.argv.slice(2);
const live = argv.includes("--live");
const positional = argv.filter((a) => !a.startsWith("--"));
const [caseId = "full-pipeline", providerId = "claude_agent_sdk", model = "sonnet", maxIter = "220"] =
  positional;

const evalCase = CREATIVE_PIPELINE_TOOL_LOOP_CASES.find((c) => c.id === caseId);
if (!evalCase) throw new Error(`no case ${caseId}`);

const outDir = path.resolve("nodetool-debug");
const mediaDir = path.join(outDir, `creative-${caseId}-media`);

/**
 * Real generation on fal, wired only when --live is passed.
 *
 * Stills come from gpt-image-2 and clips from LTX-distilled. The first draft
 * used flux/schnell for cost — $0.003 per megapixel against gpt-image-2's
 * per-image rate — and it was the wrong trade for this brief: flux mangles
 * hands, and the commission requires them in shot after shot. A cheap model
 * that cannot draw the thing being asked for is not cheap.
 *
 * Override either with CREATIVE_IMAGE_MODEL / CREATIVE_VIDEO_MODEL.
 */
function createFalMediaBackend(fal: {
  textToImage: (p: Record<string, unknown>) => Promise<Uint8Array>;
  imageToVideo: (i: Uint8Array[], p: Record<string, unknown>) => Promise<Uint8Array>;
}): MediaBackend {
  fs.mkdirSync(mediaDir, { recursive: true });
  const imageModel = {
    id: process.env.CREATIVE_IMAGE_MODEL ?? "openai/gpt-image-2",
    name: "image model",
    provider: "fal_ai"
  };
  const videoModel = {
    id:
      process.env.CREATIVE_VIDEO_MODEL ??
      "fal-ai/ltx-2-19b/distilled/image-to-video",
    name: "video model",
    provider: "fal_ai"
  };
  const save = (label: string, ext: string, bytes: Uint8Array) => {
    const p = path.join(mediaDir, `${label}.${ext}`);
    fs.writeFileSync(p, bytes);
    process.stderr.write(`    ↳ ${path.basename(p)} (${(bytes.length / 1024).toFixed(0)} KB)\n`);
    return { path: p, bytes };
  };
  return {
    async image(prompt, label) {
      const bytes = await fal.textToImage({
        prompt,
        model: imageModel,
        aspectRatio: "9:16"
      });
      return save(label, "png", bytes);
    },
    async video(from, prompt, label, durationSeconds) {
      const bytes = await fal.imageToVideo([from], {
        model: videoModel,
        prompt,
        durationSeconds,
        aspectRatio: "9:16"
      });
      return save(label, "mp4", bytes);
    }
  };
}

let media: MediaBackend | undefined;
if (live) {
  const falProvider = (await createProviderStrict("fal_ai")) as unknown as Parameters<
    typeof createFalMediaBackend
  >[0];
  media = createFalMediaBackend(falProvider);
  process.stderr.write(`live media ON → ${mediaDir}\n`);
}

// --live needs its own bridge so the media backend reaches it; the case's
// createBridge() closes over its own brief with no backend.
const briefFor: Record<string, typeof LANTERN_BRIEF> = {
  "full-pipeline": LANTERN_BRIEF,
  "brief-constraints-hold": ATLAS_BRIEF,
  "review-catches-overrun": LANTERN_BRIEF
};
const bridge = media
  ? createCreativePipelineBridge({ brief: briefFor[caseId] ?? LANTERN_BRIEF, media })
  : evalCase.createBridge();
const provider = await createProviderStrict(providerId);

interface Entry {
  n: number;
  tool: string;
  args: unknown;
  result: unknown;
  isError: boolean;
}
const transcript: Entry[] = [];
const snapshots: { after: number; tool: string; state: CreativePipelineFinalState }[] = [];

/** Phase boundaries worth snapshotting — the handoffs between surfaces. */
const MILESTONES = new Set([
  "ui_brief_choose_concept",
  "ui_sketch_generate",
  "ui_storyboard_assemble_timeline",
  "ui_review_submit_notes"
]);

let n = 0;
const tools = bridge.tools.map((t) => ({
  name: t.name,
  description: t.description,
  inputSchema: zodToJsonSchema(t.parameters),
  execute: async (args: Record<string, unknown>) => {
    n += 1;
    let result: unknown;
    let isError = false;
    try {
      result = await t.execute(args ?? {});
    } catch (e) {
      isError = true;
      result = { error: (e as Error).message };
    }
    transcript.push({ n, tool: t.name, args, result, isError });
    if (MILESTONES.has(t.name) && !isError) {
      snapshots.push({
        after: n,
        tool: t.name,
        state: structuredClone(bridge.finalState()) as CreativePipelineFinalState
      });
    }
    process.stderr.write(`${String(n).padStart(3)} ${t.name}${isError ? " (error)" : ""}\n`);
    return typeof result === "string" ? result : JSON.stringify(result);
  }
}));

const started = Date.now();
let fatal: string | undefined;
try {
  const stream = provider.generateLoop({
    messages: [
      { role: "system", content: evalCase.systemPrompt ?? "" },
      { role: "user", content: `Objective: ${evalCase.objective}` }
    ],
    model,
    tools,
    sequentialTools: true,
    maxIterations: Number(maxIter)
  } as Parameters<typeof provider.generateLoop>[0]);
  for await (const _ of stream) {
    // Drain — the side effects are in the tool closures above.
  }
} catch (e) {
  fatal = (e as Error).message;
}

const final = bridge.finalState();
fs.mkdirSync(outDir, { recursive: true });
const stem = path.join(outDir, `creative-${caseId}`);

fs.writeFileSync(
  `${stem}.json`,
  `${JSON.stringify({ caseId, providerId, model, durationMs: Date.now() - started, fatal, transcript, snapshots, final }, null, 2)}\n`
);

// --- readable report ---------------------------------------------------------

const secs = ((Date.now() - started) / 1000).toFixed(0);
const L: string[] = [];
L.push(`# creative-pipeline — ${caseId}`);
L.push("");
L.push(`${providerId}/${model} · ${n} tool calls · ${secs}s${fatal ? ` · FATAL: ${fatal}` : ""}`);
L.push("");
L.push("## Brief");
L.push("```json");
L.push(JSON.stringify(final.brief, null, 2));
L.push("```");
L.push("");
L.push("## Concepts proposed");
for (const c of final.concepts) L.push(`- **${c.title}** (${c.id}) — ${c.premise}`);
L.push(`\nChosen: **${final.chosenConceptId ?? "(none)"}**`);
L.push("");
L.push("## Style frame (sketch layers)");
for (const l of final.sketch.layers) {
  L.push(`- ${l.name} — ${l.type}, opacity ${l.opacity}${l.hasBinding ? `, generated: "${l.prompt ?? ""}"` : ""}`);
}
L.push("");
L.push("## Storyboard");
for (const s of final.storyboard.shots) {
  L.push(`${s.index}. [${s.status}] ${s.action}`);
}
L.push("");
L.push("## Delivered cut");
L.push(`Runtime **${final.cutDurationSeconds.toFixed(2)}s** against a ${final.brief.maxDurationSeconds}s ceiling.`);
L.push("");
for (const c of [...final.timeline.clips].sort((a, b) => a.startMs - b.startMs)) {
  L.push(
    `- ${(c.startMs / 1000).toFixed(2)}s +${(c.durationMs / 1000).toFixed(2)}s — ${c.name}${c.prompt ? ` — "${c.prompt}"` : ""}`
  );
}
L.push("");
if (final.artifacts.length) {
  L.push("## Generated media");
  for (const a of final.artifacts) {
    L.push(
      a.path
        ? `- **${a.kind}** \`${path.basename(a.path)}\` (${((a.bytes ?? 0) / 1024).toFixed(0)} KB) — ${a.prompt.slice(0, 110)}`
        : `- **${a.kind}** FAILED — ${a.error}`
    );
  }
  L.push("");
}
L.push("## Review notes");
for (const r of final.reviewNotes) L.push(`- **${r.severity}** — ${r.note}`);
L.push(`\nTimeline revisions after assembly: **${final.editsAfterAssembly}**`);
L.push("");
L.push("## Phase snapshots");
for (const s of snapshots) {
  L.push(
    `- after call ${s.after} (\`${s.tool}\`): ${s.state.concepts.length} concepts, ` +
      `${s.state.sketch.layers.length} layers, ${s.state.storyboard.shots.length} shots, ` +
      `${s.state.timeline.clips.length} clips, cut ${s.state.cutDurationSeconds.toFixed(2)}s`
  );
}
L.push("");
L.push("## Transcript");
L.push("");
for (const e of transcript) {
  const a = JSON.stringify(e.args);
  L.push(`${String(e.n).padStart(3)}. \`${e.tool}\`${e.isError ? " **ERROR**" : ""} ${a.length > 200 ? `${a.slice(0, 200)}…` : a}`);
  if (e.isError) L.push(`     → ${JSON.stringify(e.result).slice(0, 200)}`);
}
fs.writeFileSync(`${stem}.md`, `${L.join("\n")}\n`);

console.log(`\nwrote ${stem}.md and ${stem}.json`);
console.log(`calls=${n} cut=${final.cutDurationSeconds.toFixed(2)}s notes=${final.reviewNotes.length} edits=${final.editsAfterAssembly} artifacts=${final.artifacts.length}`);
