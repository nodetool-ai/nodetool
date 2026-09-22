/**
 * The video flow's config: the one place that maps a sequence's `setup.stage`
 * onto a step (PRD § 6.4, § 8.1–8.3).
 *
 * Everything the flow needs is on the document, so any host — the New Project
 * tab, a workspace timeline tab, the Studio timeline page — builds the same
 * config from the open sequence and gets the same four steps back. A sequence
 * with no `setup` maps to no step: it belongs to the editor, exactly as it did
 * before this flow existed (D3, criterion 2).
 */

import { createElement, useCallback, useMemo, useState } from "react";
import type { TimelineSetupStage } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import {
  usePlanBeats,
  videoPlanFingerprint,
  type PlanBeatsContext
} from "../../../hooks/timeline/usePlanBeats";
import type {
  SetupFlowConfig,
  SetupOperationContext,
  SetupStep
} from "../types";
import type { VideoSetupContext, VideoSetupReference } from "./setupContext";
import { useVideoSetupContext } from "./setupContext";

export type { VideoSetupContext, VideoSetupReference } from "./setupContext";
import { FormatStep } from "./FormatStep";
import { IdeaStep } from "./IdeaStep";
import { LookStep, useLookStep } from "./LookStep";
import { ReviewStep } from "./ReviewStep";
import { videoFormatById } from "./formats";
import { toLanguageModelValue, useDirectorModel } from "./directorModel";
import {
  productionAuthoringBlocker,
  productionGenerationBlocker,
  productionReviewFingerprint,
  REVIEW_REQUIRED
} from "./productionAuthoring";
import { assetIdFromLocator } from "../../../utils/mediaRef";

/**
 * A sequence's stage, with the field's absence read as `done` — an old
 * sequence has no setup and opens as the editor, as it always did.
 */
export const useVideoSetupStage = (): TimelineSetupStage =>
  useTimelineStore((state) => state.setup?.stage ?? "done");

/**
 * The document a sequence created from an entry card starts life with: the
 * typed prompt as the brief, the stage at `idea` (PRD § 6.1). The create
 * endpoint takes no document, so the host PATCHes this straight after creating
 * the sequence — before the flow reads it, so the copy the flow loads is
 * already the one the creator asked for.
 *
 * `context` is optional and only written when it holds something, so every
 * existing caller keeps the document it had.
 */
export const newVideoSetupDocument = (
  brief: string,
  context: VideoSetupContext = {}
) => {
  // Each field is added only when it holds something, so a caller with no
  // context writes the document it wrote before these existed. An explicit
  // `undefined` would not do: `timelineSetup` is a passthrough schema, and an
  // omitted key and a key holding `undefined` are different on the wire.
  const carried: {
    references?: VideoSetupReference[];
    entityIds?: string[];
    creative_context?: VideoSetupContext["creativeContext"];
  } = {};
  if (context.references && context.references.length > 0) {
    carried.references = [...context.references];
  }
  if (context.entityIds && context.entityIds.length > 0) {
    carried.entityIds = [...context.entityIds];
  }
  const carriedBindings = (context.references ?? []).flatMap((reference) => {
    const assetId = assetIdFromLocator(reference.uri);
    if (!assetId || reference.role === "inspiration") {
      return [];
    }
    return [
      {
        kind: reference.role ?? "product",
        asset_id: assetId,
        ...(reference.name && { label: reference.name })
      }
    ];
  });
  if (context.creativeContext || carriedBindings.length > 0) {
    const creativeContext: NonNullable<VideoSetupContext["creativeContext"]> = {
      schema_version: 1,
      ...context.creativeContext
    };
    if (context.creativeContext?.approved_claims) {
      creativeContext.approved_claims = [
        ...context.creativeContext.approved_claims
      ];
    }
    if (context.creativeContext?.prohibited_claims) {
      creativeContext.prohibited_claims = [
        ...context.creativeContext.prohibited_claims
      ];
    }
    const bindings = [
      ...(context.creativeContext?.reference_bindings ?? []),
      ...carriedBindings
    ].filter(
      (binding, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.kind === binding.kind &&
            candidate.asset_id === binding.asset_id
        ) === index
    );
    if (bindings.length > 0) {
      creativeContext.reference_bindings = bindings;
    }
    carried.creative_context = creativeContext;
  }
  return {
    tracks: [],
    clips: [],
    markers: [],
    setup: { stage: "idea" as const, brief, ...carried }
  };
};

/** The flow's name, above the stepper. Each step body carries its own heading. */
const FLOW_LABELS = { title: "Video" } as const;

/**
 * What a plan was drafted from. Two runs of the Director over the same brief
 * and format produce the same kind of plan, so this is the whole test for
 * whether the plan on the document still answers the current inputs (F15).
 */
export interface VideoSetupFlowOptions {
  /** Runs after the last step writes stage `done` — the host opens the cut. */
  onFinish?: () => void;
  /**
   * Hands the brief to the script flow (E3); its `Send to timeline` returns.
   * A host that cannot open a script passes nothing, and the card is offered
   * disabled rather than enabled with nothing behind it (F5).
   */
  onStartFromScript?: (brief: string) => void;
}

export const useVideoSetupFlow = ({
  onFinish,
  onStartFromScript
}: VideoSetupFlowOptions = {}): SetupFlowConfig<TimelineSetupStage> => {
  const stage = useVideoSetupStage();
  const [reviewError, setReviewError] = useState<string>();
  const [contextError, setContextError] = useState<string>();
  const setSetup = useTimelineStore((state) => state.setSetup);
  const brief = useTimelineStore((state) => state.setup?.brief ?? "");
  const formatId = useTimelineStore((state) => state.setup?.format);
  const persistedPlanFingerprint = useTimelineStore(
    (state) => state.setup?.["planFingerprint"]
  );
  const reviewedProduction = useTimelineStore(
    (state) => state.setup?.["production_review_fingerprint"]
  );
  const clips = useTimelineStore((state) => state.clips);
  const beats = useTimelineStore((state) => state.setup?.beats);
  const updateBeat = useTimelineStore((state) => state.updateBeat);
  const { plan, cancel: cancelPlan, planning } = usePlanBeats();
  // The beats are drafted by whichever model the format step picked, so the
  // estimate, the block and the run all read the one field it writes.
  const director = useDirectorModel();

  // The two look choices, read off the document so a remount resumes with the
  // choices the creator made (F17). Voiceover is a field of its own: absent
  // means they have not said, and then the beats' own lines decide. Music is
  // per beat, which is where PRD § 8.5 puts it.
  const storedVoiceover = useTimelineStore((state) => state.setup?.voiceover);
  const [musicChoice, setMusicChoice] = useState<boolean | null>(null);
  const voiceOn =
    storedVoiceover ??
    (beats ?? []).some((beat) => (beat.voiceover ?? "").trim().length > 0);
  const musicOn = musicChoice ?? (beats ?? []).some((beat) => beat.music);
  const look = useLookStep({ voiceOn, musicOn });

  const { references, entityIds, creativeContext } = useVideoSetupContext();
  const planContext = useMemo<PlanBeatsContext>(
    () => ({
      references,
      entityIds,
      creativeContext,
      clips: clips
        .filter(
          (clip) =>
            clip.sourceType === "imported" &&
            (clip.mediaType === "video" || clip.mediaType === "image")
        )
        .slice()
        .sort((left, right) => left.startMs - right.startMs)
        .map((clip) => ({
          clipId: clip.id,
          name: clip.name,
          mediaType: clip.mediaType === "image" ? "image" : "video",
          ...(clip.currentAssetId && { assetId: clip.currentAssetId })
        }))
    }),
    [clips, creativeContext, entityIds, references]
  );
  // The persisted fingerprint is the source of truth after reload. A missing
  // value is treated as current for legacy plans, preserving their old flow.
  const inputsKey = videoPlanFingerprint({
    brief,
    formatId,
    modelId: director.model?.id ?? "",
    context: planContext
  });
  const hasPlan = (beats?.length ?? 0) > 0;
  const reviewKey = productionReviewFingerprint({ inputsKey, beats });
  const hasProductionContext =
    creativeContext !== undefined ||
    (beats ?? []).some((beat) => beat.production !== undefined);
  const productionBlocker =
    hasProductionContext && reviewedProduction !== reviewKey
      ? REVIEW_REQUIRED
      : productionGenerationBlocker(
          beats ?? [],
          (creativeContext?.reference_bindings?.length ?? 0) > 0
        );
  // Older plans have no persisted fingerprint. Keep the old flow's
  // in-session baseline so edits still require an explicit re-plan, while a
  // reload of an old document remains eligible to continue as before.
  const [legacyPlanInputs, setLegacyPlanInputs] = useState<string | null>(null);
  if (typeof persistedPlanFingerprint !== "string") {
    if (hasPlan && legacyPlanInputs === null) {
      setLegacyPlanInputs(inputsKey);
    } else if (!hasPlan && legacyPlanInputs !== null) {
      setLegacyPlanInputs(null);
    }
  }
  const planIsCurrent =
    hasPlan &&
    (typeof persistedPlanFingerprint === "string"
      ? persistedPlanFingerprint === inputsKey
      : legacyPlanInputs === null || legacyPlanInputs === inputsKey);

  // Switching Voiceover is a decision about the output, so it is written down
  // as one. A cut that comes out silent is then the creator's word rather than
  // an inference from whether the Director happened to write any lines (F11,
  // F17).
  const handleVoice = useCallback(
    (on: boolean) => setSetup({ voiceover: on }),
    [setSetup]
  );

  // The bed is a per-beat field of the plan (PRD § 8.5), so the switch writes
  // it onto the document rather than only into this hook: a remount reads the
  // creator's choice back off the beats (F17).
  const handleMusic = useCallback(
    (on: boolean) => {
      setMusicChoice(on);
      for (const beat of beats ?? []) {
        updateBeat(beat.id, { music: on });
      }
    },
    [beats, updateBeat]
  );

  const onStageChange = useCallback(
    (next: TimelineSetupStage) => setSetup({ stage: next }),
    [setSetup]
  );

  const finish = useCallback(() => {
    setSetup({ stage: "done" });
    onFinish?.();
  }, [onFinish, setSetup]);

  const startFromScript = useCallback(
    () => onStartFromScript?.(brief),
    [brief, onStartFromScript]
  );

  const runPlan = useCallback(
    async (operation?: SetupOperationContext) => {
      // A second run over an edited plan sends that plan back as context, so the
      // creator's edits shape the rewrite instead of being discarded (F15).
      // Nothing else is passed: `plan` reads its own context off the sequence —
      // the composer's references and entities, and any clips the creator
      // dropped on step 1 (F4, F10, PRD § 8.1).
      await plan({ replan: hasPlan, signal: operation?.signal });
    },
    [hasPlan, plan]
  );

  const replan = useCallback(() => {
    // The review's own `Re-plan` runs outside the shell's primary button, so a
    // refusal has no button to land on; the step keeps the plan it had and the
    // hook's error is what the creator sees next.
    void runPlan().catch(() => undefined);
  }, [runPlan]);

  // Nothing generated is worth carrying into the paid step: an empty beat
  // renders an empty prompt, and a beat with no length renders nothing at all
  // (F20).
  const emptyBeats = (beats ?? []).filter(
    (beat) => beat.prompt.trim().length === 0 || !(beat.duration_ms > 0)
  ).length;

  const steps = useMemo<SetupStep<TimelineSetupStage>[]>(
    () => [
      {
        stage: "idea",
        label: "Idea",
        primaryLabel: "Continue",
        canAdvance: brief.trim().length > 0 && !contextError,
        blockedReason:
          contextError ?? "Describe the video, or bring your own media",
        render: () =>
          createElement(IdeaStep, {
            // The blank escape hatch and the last step land in the same place:
            // stage `done` and the timeline (PRD § 8.1).
            onStartBlank: finish,
            onStartFromScript: onStartFromScript ? startFromScript : undefined,
            onValidationChange: setContextError
          })
      },
      {
        // Format and review are both step 2, so they collapse to one stepper
        // entry (PRD § 6.2).
        stage: "format",
        label: "Beats",
        // A plan that still answers the brief and format on the document is
        // the plan the creator edited, so coming back here and pressing on
        // returns them to it rather than replacing it (F15).
        primaryLabel: planIsCurrent
          ? "Continue to the beats"
          : hasPlan
            ? "Re-plan the beats"
            : "Plan the beats",
        canAdvance:
          videoFormatById(formatId) !== null && director.model !== null,
        blockedReason:
          videoFormatById(formatId) === null
            ? "Pick a video template"
            : "Pick a model to draft the beats",
        generation: planIsCurrent
          ? undefined
          : {
              result: `Draft ${videoFormatById(formatId)?.beatCount ?? "the"} beats as an editable text outline`,
              next: hasPlan
                ? "The brief or the template changed, so the beats are drafted again with your edited plan as context. No generated clips, voice or music yet."
                : "Review the beat descriptions and timing next. No generated clips, voice or music yet; media generation is a separate step in Look.",
              model: director.model
                ? toLanguageModelValue(director.model)
                : null,
              brief,
              maxOutputTokens: 8192
            },
        pending: planning,
        pendingLabel: "Planning the beats",
        render: () => createElement(FormatStep),
        // The Director runs here and writes text only — no clip, no job (D4,
        // criterion 3). A refused run leaves the creator on the format step
        // with the reason on the button, which is what the throw is for.
        onAdvance: planIsCurrent ? undefined : runPlan
      },
      {
        stage: "review",
        label: "Beats",
        primaryLabel: "Continue to look",
        canAdvance:
          hasPlan &&
          emptyBeats === 0 &&
          !reviewError &&
          !productionAuthoringBlocker(beats ?? []),
        blockedReason:
          reviewError ??
          productionAuthoringBlocker(beats ?? []) ??
          (hasPlan
            ? `Fill in ${emptyBeats} beat${emptyBeats === 1 ? "" : "s"}: every beat needs a description and a length`
            : "Plan the beats first — there is nothing to review yet"),
        // `Re-plan` runs outside the shell's primary button, so the shell has
        // to read its wait: the creator cannot leave the plan while the plan
        // is being rewritten under them (F2).
        pending: planning,
        pendingLabel: "Re-planning the beats",
        onCancel: cancelPlan,
        render: () =>
          createElement(ReviewStep, {
            onReplan: replan,
            replanPending: planning,
            onValidationChange: setReviewError
          }),
        onAdvance: () => {
          setSetup({ production_review_fingerprint: reviewKey });
        }
      },
      {
        stage: "look",
        label: "Look",
        primaryLabel: "Generate your video",
        canAdvance: !productionBlocker && look.canAdvance,
        blockedReason: productionBlocker ?? look.blockedReason,
        primaryDetail: look.primaryDetail,
        render: () =>
          createElement(LookStep, {
            voiceOn,
            musicOn,
            onVoiceChange: handleVoice,
            onMusicChange: handleMusic,
            musicAvailable: look.musicAvailable
          }),
        // `generate` writes the terminal stage itself, before it enqueues
        // anything (D3); the host opens the timeline once the jobs are away.
        onAdvance: async (operation) => {
          if (productionBlocker) {
            throw new Error(productionBlocker);
          }
          await look.generate(operation?.signal);
          onFinish?.();
        }
      }
    ],
    [
      brief,
      beats,
      cancelPlan,
      director.model,
      contextError,
      emptyBeats,
      finish,
      formatId,
      handleMusic,
      handleVoice,
      hasPlan,
      look,
      musicOn,
      onFinish,
      onStartFromScript,
      planIsCurrent,
      planning,
      productionBlocker,
      reviewKey,
      reviewError,
      setSetup,
      replan,
      runPlan,
      startFromScript,
      voiceOn
    ]
  );

  return { labels: FLOW_LABELS, steps, stage, onStageChange };
};

export default useVideoSetupFlow;
