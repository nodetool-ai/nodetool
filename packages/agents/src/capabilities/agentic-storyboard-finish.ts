import { createHash } from "node:crypto";
import { z } from "zod";
import type { StoryboardDocument, TimelineSequence } from "@nodetool-ai/models";
import {
  budgetFromContext,
  isProviderStop,
  type Message,
  type MessageContent,
  type ProviderTool
} from "@nodetool-ai/runtime";
import { isRecord } from "@nodetool-ai/protocol";
import { validateTimelineSequence } from "@nodetool-ai/execution/timeline-debug";
import {
  buildStoryboardDesignFrame,
  validateProducedTimeline,
  stampStoryboardMaterializationBaseline,
  type FinishStoryboardInput,
  type FinishedStoryboardDocument
} from "@nodetool-ai/timeline";
import type { CapabilityRun } from "./types.js";
import { applyOps, parseOps } from "./timelines.js";
import { editTimelineSpec } from "./timelines.specs.js";
import { renderTimelineFrames } from "../timeline-preview/frames.js";

const reviewSchema = z.object({
  passed: z.boolean(),
  findings: z.array(z.string().min(1)),
  summary: z.string().min(1)
});
export interface FinishedCutReview {
  readonly round: number;
  readonly passed: boolean;
  readonly findings: readonly string[];
  readonly summary: string;
  readonly referenceFrames: readonly {
    shotId: string;
    fingerprint: string;
    sha256: string;
    timeMs: number;
  }[];
  readonly frames: readonly {
    timeMs: number;
    sha256: string;
    width: number;
    height: number;
  }[];
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

/** A child authors only an in-memory draft. Existing CAS is the sole write. */
export async function finishStoryboardAgentically(
  run: CapabilityRun,
  input: FinishStoryboardInput,
  board: StoryboardDocument,
  sequence: TimelineSequence,
  scaffold: FinishedStoryboardDocument
): Promise<{
  document: FinishedStoryboardDocument;
  reviews: FinishedCutReview[];
}> {
  const runtime = run.subAgent;
  if (!runtime) {
    throw new Error(
      "Agentic finishing requires the session's provider and model."
    );
  }
  if (input.shots.length === 0 || input.shots.length > 24) {
    throw new Error(
      "Agentic finishing supports 1–24 shots per reviewed cut. Split a larger board before finishing."
    );
  }
  const signal = run.context.signal;
  let document = structuredClone(scaffold);
  const reviews: FinishedCutReview[] = [];
  let feedback: unknown = [];
  const initial = new Map(scaffold.clips.map((clip) => [clip.id, clip]));
  const windows = [...input.shots]
    .sort((a, b) => a.index - b.index)
    .map((shot, index, shots) => ({
      shotId: shot.id,
      start: shots
        .slice(0, index)
        .reduce(
          (sum, prior) =>
            sum + Math.max(1, (prior.duration_seconds ?? 4) * 1000),
          0
        ),
      duration: Math.max(1, (shot.duration_seconds ?? 4) * 1000)
    }));
  const inspect: ProviderTool = {
    name: "get_timeline",
    description:
      "Read the entire current isolated editable draft, with source and semantic provenance.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  };
  const submit: ProviderTool = {
    name: "submit_finished_cut",
    description:
      "Submit this draft for mandatory policy, structure, render and visual review. No document is saved yet.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  };
  const edit: ProviderTool = {
    ...editTimelineSpec,
    description:
      "Apply existing Timeline operations to this isolated draft. No save, generation or external write is available. Use exact clip IDs from get_timeline."
  };
  const review: ProviderTool = {
    name: "review_finished_cut",
    description:
      "Report visual findings after inspecting EVERY attached composited frame. A pass needs no defects and an explicit visual summary. Cannot waive source/policy/structure validation.",
    inputSchema: {
      type: "object",
      properties: {
        passed: { type: "boolean" },
        findings: { type: "array", items: { type: "string" } },
        summary: { type: "string" }
      },
      required: ["passed", "findings", "summary"],
      additionalProperties: false
    }
  };

  const drive = async (
    messages: Message[],
    tools: ProviderTool[],
    execute: NonNullable<
      Parameters<typeof runtime.provider.generateLoop>[0]["executeTool"]
    >
  ): Promise<void> => {
    signal?.throwIfAborted();
    for await (const event of runtime.provider.generateLoop({
      messages,
      model: runtime.model,
      tools,
      executeTool: execute,
      maxIterations: 12,
      sequentialTools: true,
      signal,
      turnBudget: run.budget ?? runtime.budget ?? budgetFromContext(run.context)
    })) {
      signal?.throwIfAborted();
      if (isProviderStop(event)) {
        throw new Error(`Finishing stopped: ${event.reason}`);
      }
    }
  };

  const { current: _current, ...referenceInput } = input;
  const references = input.shots.map((shot) => ({
    shotId: shot.id,
    ...buildStoryboardDesignFrame(referenceInput, shot.id, {
      style: board.style,
      context: board.creative_context
    })
  }));
  if (references.some((reference) => reference.validation.length)) {
    throw new Error(
      "The semantic Storyboard cannot produce faithful design reference frames."
    );
  }
  const { loadMediaRefBytes } = await import("@nodetool-ai/runtime");
  signal?.throwIfAborted();
  const referenceRender = await renderTimelineFrames({
    sequence: { ...sequence.toTimelineSequence(), ...references[0].document },
    timesMs: references.map((reference) => reference.timeMs),
    width: 540,
    loadAsset: (assetId) => {
      signal?.throwIfAborted();
      return loadMediaRefBytes({ asset_id: assetId }, run.context);
    }
  });
  signal?.throwIfAborted();
  if (
    !referenceRender.complete ||
    referenceRender.effectsNotApplied.length ||
    referenceRender.fontsUnavailable.length
  ) {
    throw new Error(
      "Derived Storyboard design references could not render completely. Fix source media/fonts before model dispatch."
    );
  }
  const referenceEvidence = references.map((reference, index) => ({
    shotId: reference.shotId,
    fingerprint: createHash("sha256")
      .update(reference.fingerprint)
      .digest("hex"),
    timeMs: reference.timeMs,
    sha256: createHash("sha256")
      .update(referenceRender.frames[index].png)
      .digest("hex")
  }));
  const referenceImages: MessageContent[] = referenceRender.frames.flatMap(
    (frame, index) => [
      {
        type: "text",
        text: `Derived design reference for shot ${references[index].shotId} at ${frame.time_ms}ms, from the expected Storyboard revision's semantic intent. Fingerprint ${referenceEvidence[index].fingerprint}. This is not a separate historical pixel approval.`
      },
      {
        type: "image_url",
        image: {
          uri: `data:image/png;base64,${Buffer.from(frame.png).toString("base64")}`
        }
      }
    ]
  );

  const permittedOps = new Set([
    "add_track",
    "move_track",
    "delete_track",
    "add_text_clip",
    "add_shape_clip",
    "set_clip_params",
    "animate_clip",
    "clear_animations",
    "set_transition",
    "set_parent",
    "set_matte",
    "add_group",
    "add_marker",
    "delete_marker"
  ]);
  for (let round = 0; round < 3; round += 1) {
    const beforeRevision = json(document);
    let submitted = false;
    await drive(
      [
        {
          role: "system",
          content:
            "Materialize the approved WHOLE CUT, not an isolated shot. Use real editable Timeline primitives and existing edit_timeline operations. Preserve all source assets, exact copy/colors, semantic IDs, shot windows and manual edits. Do not invent or generate replacement media. Read the full draft and submit_finished_cut when ready. At a revision, fix every reported defect. Storyboard contains semantic intent, never an animation implementation. The Timeline is execution truth."
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: json({
                storyboard: board,
                resolvedProduction: input,
                scaffold: document,
                target: {
                  width: input.width,
                  height: input.height,
                  fps: sequence.fps
                },
                previousReview: feedback
              })
            },
            ...referenceImages
          ]
        }
      ],
      [inspect, edit, submit],
      async (call) => {
        signal?.throwIfAborted();
        if (submitted) {
          return "The candidate is submitted. End this authoring turn.";
        }
        if (call.name === inspect.name) {
          return json(document);
        }
        if (call.name === submit.name) {
          submitted = true;
          return "Candidate submitted for mandatory review.";
        }
        if (call.name !== edit.name) {
          return "Only isolated Timeline editing is available.";
        }
        const ops = parseOps(call.args["ops"]);
        if (!Array.isArray(ops)) {
          return json(ops);
        }
        if (
          ops.some(
            (operation) =>
              !permittedOps.has(operation.op.replace("ui_timeline_", ""))
          )
        ) {
          return "This finishing operation is unavailable. Only editable composition, animation, geometry and markers are allowed. No generation, replacement media or persistence.";
        }
        const pending = [];
        const existingResults = [];
        const identities = new Set<string>();
        for (const operation of ops) {
          const kind =
            operation.op === "ui_timeline_add_shape_clip"
              ? "shape"
              : operation.op === "ui_timeline_add_text_clip"
                ? "text"
                : operation.op === "ui_timeline_add_group"
                  ? "group"
                  : undefined;
          if (!kind) {
            pending.push(operation);
            continue;
          }
          const name = operation.input["name"];
          const start = operation.input["startMs"];
          const duration = operation.input["durationMs"];
          const window = windows.find(
            (value) =>
              typeof start === "number" &&
              typeof duration === "number" &&
              start >= value.start &&
              start + duration <= value.start + value.duration
          );
          if (typeof name !== "string" || !name.trim() || !window) {
            return "New layers require an explicit stable semantic name, startMs and durationMs inside one shot window. Reuse that name on reruns; edit an existing layer with set_clip_params.";
          }
          const key = `${window.shotId}/$agent:${kind}:${encodeURIComponent(name.trim())}`;
          if (identities.has(key)) {
            return `Duplicate semantic addition ${key} in one batch.`;
          }
          identities.add(key);
          const existing = document.clips.find(
            (clip) =>
              clip.storyboardBoardId === input.boardId &&
              clip.storyboardShotId === window.shotId &&
              clip.storyboardElementId === key.slice(window.shotId.length + 1)
          );
          if (existing) {
            existingResults.push({
              op: operation.op,
              ok: true,
              result: {
                alreadyExists: true,
                clipId: existing.id,
                semanticIdentity: key
              }
            });
          } else {
            pending.push(operation);
          }
        }
        if (!pending.length) {
          return json(existingResults);
        }
        // Hermetic mode removes generation, Blender rendering and DB-writing hooks.
        const outcome = await applyOps(run, sequence, document, pending, {
          hermetic: true
        });
        document = {
          ...document,
          tracks: outcome.state.documentTracks,
          clips: outcome.state.documentClips,
          markers: outcome.state.markers,
          camera2d: outcome.state.camera2d,
          mediaTracks: outcome.state.mediaTracks,
          tempo: outcome.state.tempo
        };
        for (const clip of document.clips) {
          if (initial.has(clip.id) || clip.storyboardBoardId) {
            continue;
          }
          const window = windows.find(
            (value) =>
              clip.startMs >= value.start &&
              clip.startMs + clip.durationMs <= value.start + value.duration
          );
          if (window && ["text", "shape", "group"].includes(clip.mediaType)) {
            clip.storyboardBoardId = input.boardId;
            clip.storyboardShotId = window.shotId;
            clip.storyboardElementId = `$agent:${clip.mediaType}:${encodeURIComponent(clip.name.trim())}`;
          }
        }
        return json([...existingResults, ...outcome.records]);
      }
    );
    if (!submitted) {
      throw new Error("Finished-cut agent did not submit a candidate.");
    }
    if (round > 0 && beforeRevision === json(document)) {
      throw new Error(
        "Finishing did not revise the draft after reported defects."
      );
    }
    for (const clip of document.clips) {
      const before = initial.get(clip.id);
      if (before) {
        if (
          clip.storyboardBoardId !== before.storyboardBoardId ||
          clip.storyboardShotId !== before.storyboardShotId ||
          clip.storyboardElementId !== before.storyboardElementId
        ) {
          throw new Error(
            `Finishing cannot replace semantic ownership on ${clip.id}.`
          );
        }
      } else {
        const window = windows.find(
          (value) =>
            clip.startMs >= value.start &&
            clip.startMs + clip.durationMs <= value.start + value.duration
        );
        if (!window || !["text", "shape", "group"].includes(clip.mediaType)) {
          throw new Error(
            "New finishing layers must be editable text/shapes/groups inside an existing shot window. Add source media to the Storyboard first."
          );
        }
        if (clip.mediaType === "text") {
          const shot = input.shots.find((value) => value.id === window.shotId);
          const allowedCopy = (shot?.graphics?.elements ?? [])
            .filter(
              (element) =>
                element.kind === "text" && !element.protected_input_id
            )
            .map((element) => element.text);
          if (!allowedCopy.includes(clip.textStyle?.text)) {
            throw new Error(
              "Additional text must use approved unprotected Storyboard copy. Protected copy already has its exact semantic layer."
            );
          }
        }
        clip.storyboardBoardId = input.boardId;
        clip.storyboardShotId = window.shotId;
        clip.storyboardElementId ??= `$agent:${clip.mediaType}:${encodeURIComponent(clip.name.trim())}`;
      }
      const current = input.current?.clips.find(
        (value) => value.id === clip.id
      );
      if (current && current.storyboardMaterializationBaseline) {
        const baseline: unknown = JSON.parse(
          current.storyboardMaterializationBaseline
        );
        if (isRecord(baseline)) {
          for (const field of ["transform", "startMs", "durationMs"] as const) {
            if (
              json(current[field]) !== json(baseline[field]) &&
              json(clip[field]) !== json(current[field])
            ) {
              throw new Error(
                `Manual ${field} edit on ${clip.id} conflicts with finishing. Keep the manual value or use a separate Timeline.`
              );
            }
          }
        }
      }
    }
    for (const track of scaffold.tracks) {
      if (
        input.current?.tracks.some((value) => value.id === track.id) &&
        json(document.tracks.find((value) => value.id === track.id)) !==
          json(track)
      ) {
        throw new Error(
          `Finishing cannot change an existing track's manually owned configuration: ${track.id}.`
        );
      }
    }
    for (const before of scaffold.clips) {
      const after = document.clips.find((value) => value.id === before.id);
      if (!after) {
        throw new Error(`Finishing cannot delete source layer ${before.id}.`);
      }
      if (
        before.storyboardBoardId !== input.boardId &&
        json(before) !== json(after)
      ) {
        throw new Error(
          `Finishing cannot change manually owned layer ${before.id}.`
        );
      }
      if (
        before.storyboardBoardId === input.boardId &&
        (before.mediaType !== after.mediaType ||
          before.currentAssetId !== after.currentAssetId ||
          before.sourceType !== after.sourceType ||
          json(before.versions) !== json(after.versions))
      ) {
        throw new Error(
          `Finishing cannot replace accepted source media on ${before.id}.`
        );
      }
      if (
        before.storyboardBoardId === input.boardId &&
        (before.startMs !== after.startMs ||
          before.durationMs !== after.durationMs)
      ) {
        throw new Error(
          `Finishing must preserve the deterministic shot window on ${before.id}.`
        );
      }
    }
    const policy = validateProducedTimeline(input, document);
    const structural = validateTimelineSequence(document, {
      fps: sequence.fps,
      width: input.width,
      height: input.height
    });
    if (policy.length || !structural.ok) {
      feedback = { policy, structural };
      continue;
    }
    const timesMs = windows.flatMap((window) => [
      window.start + Math.min(500, window.duration * 0.25),
      window.start + window.duration * 0.75
    ]);
    signal?.throwIfAborted();
    const frames = await renderTimelineFrames({
      sequence: { ...sequence.toTimelineSequence(), ...document },
      timesMs,
      width: 540,
      loadAsset: (assetId) => {
        signal?.throwIfAborted();
        return loadMediaRefBytes({ asset_id: assetId }, run.context);
      }
    });
    signal?.throwIfAborted();
    if (
      !frames.complete ||
      !frames.frames.length ||
      frames.effectsNotApplied.length ||
      frames.fontsUnavailable.length
    ) {
      feedback = {
        renderDefects: frames.frames.map((frame) => ({
          timeMs: frame.time_ms,
          dropped: frame.dropped,
          degraded: frame.degraded,
          failures: frame.failures
        })),
        effectsNotApplied: frames.effectsNotApplied,
        fontsUnavailable: frames.fontsUnavailable
      };
      continue;
    }
    let verdict: z.infer<typeof reviewSchema> | undefined;
    const content: MessageContent[] = [
      {
        type: "text",
        text: json({
          storyboard: board,
          resolvedProduction: input,
          timeline: document,
          frameTimesMs: timesMs,
          instruction:
            "Visually review all rendered frames against approved semantic graphics and full-cut direction. Find clipped/overlapped copy, hidden assets, wrong hierarchy/contrast, awkward motion endpoints and continuity failures. The first images are labeled design references derived from the expected Storyboard revision. The subsequent images are the actual candidate cut. Compare candidate composition against these references while assessing motion and visual defects. These references are derived from approved/current semantic intent, not a separate historical pixel approval. Exact identity is independently checked mechanically. Fail on any material defect."
        })
      },
      ...referenceImages,
      ...frames.frames.map(
        (frame): MessageContent => ({
          type: "image_url",
          image: {
            uri: `data:image/png;base64,${Buffer.from(frame.png).toString("base64")}`
          }
        })
      )
    ];
    await drive(
      [
        {
          role: "system",
          content:
            "You are the visual finishing reviewer. Inspect the actual supplied composited frame pixels. Call review_finished_cut with actionable findings and a specific visual summary. Never approve without inspecting the whole cut."
        },
        { role: "user", content }
      ],
      [review],
      async (call) => {
        if (call.name !== review.name) {
          return "Call review_finished_cut.";
        }
        if (verdict) {
          return "Review already recorded. End this review turn.";
        }
        const parsed = reviewSchema.safeParse(call.args);
        if (!parsed.success) {
          return json(parsed.error.issues);
        }
        if (parsed.data.passed && parsed.data.findings.length) {
          return "A passing review cannot contain unresolved findings.";
        }
        verdict = parsed.data;
        return "Review recorded.";
      }
    );
    if (!verdict) {
      throw new Error("Finished cut has no explicit visual review.");
    }
    const evidence: FinishedCutReview = {
      round,
      ...verdict,
      referenceFrames: referenceEvidence,
      frames: frames.frames.map((frame) => ({
        timeMs: frame.time_ms,
        sha256: createHash("sha256").update(frame.png).digest("hex"),
        width: frame.width,
        height: frame.height
      }))
    };
    reviews.push(evidence);
    if (!verdict.passed) {
      feedback = evidence;
      continue;
    }
    for (const clip of document.clips) {
      if (clip.storyboardBoardId !== input.boardId) {
        continue;
      }
      stampStoryboardMaterializationBaseline(clip);
      const previous = input.current?.clips.find(
        (value) => value.id === clip.id
      );
      if (
        previous?.storyboardMaterializationBaseline &&
        !clip.storyboardElementId?.startsWith("$agent:")
      ) {
        const prior: unknown = JSON.parse(
          previous.storyboardMaterializationBaseline
        );
        const accepted: unknown = JSON.parse(
          clip.storyboardMaterializationBaseline ?? "null"
        );
        if (isRecord(prior) && isRecord(accepted)) {
          for (const field of ["transform", "startMs", "durationMs"] as const) {
            if (json(previous[field]) !== json(prior[field])) {
              accepted[field] = prior[field];
            }
          }
          clip.storyboardMaterializationBaseline = json(accepted);
        }
      }
    }
    document.storyboardMaterializations = [
      ...(document.storyboardMaterializations ?? []).filter(
        (entry) => entry.boardId !== input.boardId
      ),
      {
        boardId: input.boardId,
        elementKeys: document.clips
          .filter((clip) => clip.storyboardBoardId === input.boardId)
          .map((clip) => `${clip.storyboardShotId}/${clip.storyboardElementId}`)
      }
    ];
    return { document, reviews };
  }
  throw new Error(
    `Finished cut still has unresolved defects after three candidates: ${json(feedback)}`
  );
}
