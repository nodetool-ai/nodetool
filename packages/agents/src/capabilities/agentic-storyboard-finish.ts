import { createHash } from "node:crypto";
import { z } from "zod";
import type { StoryboardDocument, TimelineSequence } from "@nodetool-ai/models";
import {
  zodToJsonSchema,
  budgetFromContext,
  isProviderStop,
  type Message,
  type MessageContent,
  type ProviderTool,
  type BaseProvider,
  type TurnBudget,
  type RunBudget
} from "@nodetool-ai/runtime";
import {
  isRecord,
  resolveEffectiveProductionRequirement
} from "@nodetool-ai/protocol";
import { buildTimelineToolContracts } from "@nodetool-ai/protocol/api-schemas/timeline-tool-contracts.js";
import { uiToolParams } from "@nodetool-ai/protocol/api-schemas/ui-tool-contract.js";
import { validateTimelineSequence } from "@nodetool-ai/execution/timeline-debug";
import {
  ANIMATED_PROPERTIES,
  STAGGER_UNITS,
  DEFAULT_BEAT_TOLERANCE_MS,
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
export interface FinishedCutRuntime {
  readonly provider: BaseProvider;
  readonly model: string;
  readonly budget?: TurnBudget | RunBudget;
}

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

/** Compare authored composition, excluding ownership baseline and animation IDs. */
function composition(document: FinishedStoryboardDocument): string {
  const trackIndices = new Map(
    document.tracks.map((track) => [track.id, track.index])
  );
  return json(
    document.clips
      .map((clip) => ({
        id: clip.id,
        trackIndex: trackIndices.get(clip.trackId),
        mediaType: clip.mediaType,
        transform: clip.transform,
        layout: clip.layout,
        flexItem: clip.flexItem,
        mask: clip.mask,
        transitionIn: clip.transitionIn,
        textStyle: clip.textStyle,
        shapeStyle: clip.shapeStyle,
        opacity: clip.opacity ?? 1,
        hidden: clip.hidden ?? false,
        blendMode: clip.blendMode ?? "normal",
        parentId: clip.parentId,
        matte: clip.matte,
        crop: clip.crop,
        effects: clip.effects,
        animations: (clip.animations ?? []).map(
          ({ id: _id, ...animation }) => animation
        )
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  );
}

/** Existing authored presentation survives while semantic source truth is refreshed. */
function reuseAcceptedPresentation(
  input: FinishStoryboardInput,
  scaffold: FinishedStoryboardDocument
): FinishedStoryboardDocument {
  const document = structuredClone(scaffold);
  const accepted = new Map(input.current?.clips.map((clip) => [clip.id, clip]));
  const protectedColors = new Set<string>();
  for (const shot of input.shots) {
    const protections = new Map(
      (
        resolveEffectiveProductionRequirement(input.production, shot.production)
          ?.protected_inputs ?? []
      ).map((protection) => [protection.id, protection])
    );
    for (const element of shot.graphics?.elements ?? []) {
      if (
        element.protected_input_id &&
        protections.get(element.protected_input_id)?.kind === "brand_color"
      ) {
        protectedColors.add(`${shot.id}/${element.id}`);
      }
    }
  }
  for (const clip of document.clips) {
    const prior = accepted.get(clip.id);
    if (
      !prior ||
      clip.storyboardBoardId !== input.boardId ||
      prior.mediaType !== clip.mediaType ||
      prior.storyboardShotId !== clip.storyboardShotId ||
      prior.storyboardElementId !== clip.storyboardElementId
    ) {
      continue;
    }
    const protectedColor = protectedColors.has(
      `${clip.storyboardShotId}/${clip.storyboardElementId}`
    );
    Object.assign(
      clip,
      structuredClone({
        transform: prior.transform,
        layout: prior.layout,
        flexItem: prior.flexItem,
        opacity: prior.opacity,
        hidden: prior.hidden,
        blendMode: prior.blendMode,
        parentId: prior.parentId,
        mask: prior.mask,
        matte: prior.matte,
        crop: prior.crop,
        effects: prior.effects,
        animations: prior.animations,
        transitionIn: prior.transitionIn
      })
    );
    if (clip.textStyle && prior.textStyle) {
      clip.textStyle = {
        ...prior.textStyle,
        text: clip.textStyle.text,
        ...(protectedColor && {
          color: clip.textStyle.color
        })
      };
    }
    if (clip.shapeStyle && prior.shapeStyle) {
      clip.shapeStyle = {
        ...prior.shapeStyle,
        kind: clip.shapeStyle.kind,
        ...(protectedColor && {
          fill: clip.shapeStyle.fill
        })
      };
    }
  }
  return document;
}

/** A child authors only an in-memory draft. Existing CAS is the sole write. */
export async function finishStoryboardAgentically(
  run: CapabilityRun,
  input: FinishStoryboardInput,
  board: StoryboardDocument,
  sequence: TimelineSequence,
  scaffold: FinishedStoryboardDocument,
  runtime: FinishedCutRuntime
): Promise<{
  document: FinishedStoryboardDocument;
  reviews: FinishedCutReview[];
  costUsd: number;
}> {
  const initialCost = runtime.provider.getTotalCost();
  const needsInitialAuthoring = !input.current;
  const scaffoldComposition = composition(scaffold);
  if (input.shots.length === 0 || input.shots.length > 24) {
    throw new Error(
      "Agentic finishing supports 1–24 shots per reviewed cut. Split a larger board before finishing."
    );
  }
  const signal = run.signal ?? run.context.signal;
  let document = reuseAcceptedPresentation(input, scaffold);
  const preflightPolicy = validateProducedTimeline(input, document);
  const preflightStructure = validateTimelineSequence(document, {
    fps: sequence.fps,
    width: input.width,
    height: input.height
  });
  if (preflightPolicy.length || !preflightStructure.ok) {
    throw new Error(
      `Accepted presentation cannot honor the current production requirements: ${json({ policy: preflightPolicy, structural: preflightStructure })}`
    );
  }
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
  const permittedOpNames = [
    "get_state",
    "list_animation_presets",
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
    "add_group"
  ] as const;
  const permittedOps = new Set<string>(permittedOpNames);
  const contracts = buildTimelineToolContracts({
    staggerUnits: STAGGER_UNITS,
    animatedProperties: ANIMATED_PROPERTIES,
    beatToleranceMs: DEFAULT_BEAT_TOLERANCE_MS
  });
  const operationContracts = Object.fromEntries(
    permittedOpNames.map((op) => {
      const contract = contracts[`ui_timeline_${op}`];
      return [
        op,
        {
          description: contract.description,
          parameters: zodToJsonSchema(uiToolParams(contract))
        }
      ];
    })
  );
  const scopeInstructions =
    "Only these operations are available: " +
    [...permittedOps].join(", ") +
    ". Each op is {op, ...flat arguments} from operationContracts. There is no saved timeline_id requirement for this isolated draft. " +
    "Keep existing source layer startMs/durationMs, assets, exact protected text/colors and semantic ownership unchanged. " +
    "set_clip_params uses fontSizePx (not fontSize), textStyle and transform.position.x/y in sequence pixels relative to frame center. " +
    "Protected layers may use only fade (requires allowed opacity), slide (opacity+position) or pop (opacity+scale). " +
    "Other protected presets/custom curves, group inheritance, masks/effects fail policy validation. Unprotected decorative layers can use existing animation presets/custom curves. " +
    "New editable decorative layers require stable name/startMs/durationMs inside one shot window. Read every edit result and fix failures before submitting.";
  let previousCandidateImages: MessageContent[] = [];
  const inspect: ProviderTool = {
    name: "get_timeline",
    description:
      "Read the entire current isolated editable draft, with source and semantic provenance.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  };
  const submit: ProviderTool = {
    name: "submit_finished_cut",
    description:
      "Submit an authored draft for mandatory policy, structure, render and visual review. A new cut requires actual editable composition or motion changes from its deterministic scaffold. Existing reviewed cuts may remain unchanged. No document is saved yet.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  };
  const edit: ProviderTool = {
    ...editTimelineSpec,
    inputSchema: {
      type: "object",
      properties: {
        ops: {
          type: "array",
          items: { type: "object" },
          description: scopeInstructions
        }
      },
      required: ["ops"],
      additionalProperties: false
    },
    description:
      "Apply existing Timeline operations to this isolated draft. No save, generation or external write is available. Use exact clip IDs from get_timeline. " +
      scopeInstructions
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
    // SDK-native loops can issue parallel MCP callbacks despite sequentialTools.
    // Serialize access to this one isolated draft, including reads and submission.
    let executionTail: Promise<void> = Promise.resolve();
    for await (const event of runtime.provider.generateLoop({
      messages,
      model: runtime.model,
      effort: "medium",
      tools,
      executeTool: (call) => {
        const pending = executionTail.then(() => {
          signal?.throwIfAborted();
          return execute(call);
        });
        executionTail = pending.then(
          () => undefined,
          () => undefined
        );
        return pending;
      },
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
    await executionTail;
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

  for (let round = 0; round < 3; round += 1) {
    const beforeRevision = json(document);
    let submitted = false;
    const editResults: string[] = [];
    const recordEditResult = (result: string): string => {
      editResults.push(result.slice(0, 1600));
      return result;
    };
    const diagnostics = (): string =>
      json({
        previousReview: feedback,
        lastEditResults: editResults.slice(-4)
      }).slice(0, 8000);
    await drive(
      [
        {
          role: "system",
          content:
            "Finish the approved WHOLE CUT, not an isolated shot. The deterministic scaffold establishes faithful source layers and timing; it is your starting point, not evidence of agentic finishing. Inspect all derived design references and semantic graphic/motion direction, then deliberately author an editable composition: readable type hierarchy, balanced product/copy layout, graphic rhythm and continuity across the cut. Use the supplied full scaffold and operationContracts directly; do not request get_timeline or list_animation_presets redundantly when their data is already present. Author a focused batch of deliberate edits rather than redesigning every layer. Use existing Timeline operations and their exact operationContracts. Make meaningful layout, typography, decorative or animation choices that serve this board. Do not make arbitrary nudges, metadata changes or add empty layers merely to satisfy authoring. On a new cut, author actual layout or motion before submitting; on an existing finished cut, preserve good prior work and submit unchanged if no revision is needed. Preserve all source assets, exact copy/colors, semantic IDs, shot windows and manual edits. Do not invent or generate replacement media. Read every edit result, correct rejected edits, then submit_finished_cut when ready. At a revision, fix every reported defect. Storyboard contains semantic intent, never an animation implementation. The Timeline is execution truth."
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
                previousReview: feedback,
                needsInitialAuthoring,
                operationContracts,
                finishingConstraints: scopeInstructions
              })
            },
            ...referenceImages,
            ...previousCandidateImages
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
          if (
            needsInitialAuthoring &&
            composition(document) === scaffoldComposition
          ) {
            return recordEditResult(
              "This new cut is still the unchanged deterministic scaffold. Author meaningful editable layout or motion from the full-board direction with edit_timeline, read its result, then submit again. Read-only, no-op and metadata-only edits do not finish a new agentic cut."
            );
          }
          submitted = true;
          return "Candidate submitted for mandatory review.";
        }
        if (call.name !== edit.name) {
          return "Only isolated Timeline editing is available.";
        }
        const ops = parseOps(call.args["ops"]);
        if (!Array.isArray(ops)) {
          return recordEditResult(json(ops));
        }
        if (
          ops.some(
            (operation) =>
              !permittedOps.has(operation.op.replace("ui_timeline_", ""))
          )
        ) {
          return recordEditResult(
            "This finishing operation is unavailable. " + scopeInstructions
          );
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
            return recordEditResult(
              "New layers require an explicit stable semantic name, startMs and durationMs inside one shot window. Reuse that name on reruns; edit an existing layer with set_clip_params."
            );
          }
          const key = `${window.shotId}/$agent:${kind}:${encodeURIComponent(name.trim())}`;
          if (identities.has(key)) {
            return recordEditResult(
              `Duplicate semantic addition ${key} in one batch.`
            );
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
          return recordEditResult(json(existingResults));
        }
        // Hermetic mode removes generation, Blender rendering and DB-writing hooks.
        const outcome = await applyOps(run, sequence, document, pending, {
          hermetic: true
        });
        if (
          !outcome.records.some(
            (record) =>
              record.ok &&
              !["get_state", "list_animation_presets"].includes(
                record.op.replace("ui_timeline_", "")
              )
          )
        ) {
          return recordEditResult(
            json([...existingResults, ...outcome.records])
          );
        }
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
        return recordEditResult(json([...existingResults, ...outcome.records]));
      }
    );
    if (!submitted) {
      throw new Error(
        `Finished-cut agent did not submit a candidate: ${diagnostics()}`
      );
    }
    if (round > 0 && beforeRevision === json(document)) {
      throw new Error(
        `Finishing did not revise the draft after reported defects: ${diagnostics()}`
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
          for (const field of [
            "transform",
            "startMs",
            "durationMs",
            "layout",
            "flexItem",
            "mask",
            "transitionIn"
          ] as const) {
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
    if (json(document.markers) !== json(scaffold.markers)) {
      throw new Error(
        "Finishing cannot modify manually owned Timeline markers."
      );
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
    previousCandidateImages = frames.frames.flatMap(
      (frame): MessageContent[] => [
        {
          type: "text",
          text: `Previous candidate cut frame at ${frame.time_ms}ms. Revise defects identified in previousReview. This is the candidate, not the derived design reference.`
        },
        {
          type: "image_url",
          image: {
            uri: `data:image/png;base64,${Buffer.from(frame.png).toString("base64")}`
          }
        }
      ]
    );
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
    return {
      document,
      reviews,
      costUsd: Math.max(0, runtime.provider.getTotalCost() - initialCost)
    };
  }
  throw new Error(
    `Finished cut still has unresolved defects after three candidates: ${json(feedback)}`
  );
}
