/**
 * The image flow's config: the one place that maps a sketch document's
 * `setup.stage` onto a step (PRD § 10.1–10.3, § 6.4).
 *
 * Everything the flow needs is on the document, so any host builds the same
 * config and gets the same four steps back. `done` maps to no step: the
 * document belongs to the editor from there on (D3), which is also why a
 * document with no `setup` at all opens as the editor and always has.
 */

import { createElement, useCallback, useMemo, useState } from "react";
import {
  composeImagePrompt,
  type SketchSetupStage
} from "@nodetool-ai/protocol/api-schemas/sketch.js";

import { useSketchStore } from "../../sketch/state/useSketchStore";
import {
  REFINE_BRIEF_MAX_TOKENS,
  briefInputSignature,
  useRefineBrief
} from "../../../hooks/sketch/useRefineBrief";
import { useUploadFirstLayer } from "../../../hooks/sketch/useUploadFirstLayer";
import type { GenerationSummaryProps } from "../GenerationSummary";
import { IMAGE_INPUT_TOKENS } from "../generationEstimate";
import type {
  SetupFlowConfig,
  SetupOperationContext,
  SetupStep
} from "../types";
import { IdeaStep } from "./IdeaStep";
import { imageReferences, readReferences } from "./setupContext";
import {
  ImageModelFooterField,
  LookStep,
  useLookStep,
  type LookStepControls
} from "./LookStep";
import { BriefModelFooterField } from "./BriefModelSelect";
import { ReviewStep } from "./ReviewStep";
import { UseCaseStep } from "./UseCaseStep";

/** A document's stage, with the field's absence read as `done` (PRD § 6.4). */
export const useImageSetupStage = (): SketchSetupStage =>
  useSketchStore((state) => state.document.setup?.stage ?? "done");

/**
 * The flow's name, above the stepper. Each step body carries its own heading,
 * so this says what is being made and no more.
 */
const FLOW_LABELS = { title: "Image" } as const;

export interface ImageSetupFlowOptions {
  /**
   * Runs once the last step has written `done` and the batch's layers exist,
   * before their jobs are started, so the host shows the contact sheet in the
   * same render the stage leaves the flow (F14).
   */
  onGenerated: (layerIds: readonly string[]) => void;
  /** Runs when an alternative finishes the flow without generating. */
  onFinish: () => void;
}

export interface ImageSetupFlow {
  config: SetupFlowConfig<SketchSetupStage>;
  /** Exposed so the landing's `Make more variations` reuses the same batch. */
  look: LookStepControls;
}

export const useImageSetupFlow = ({
  onGenerated,
  onFinish
}: ImageSetupFlowOptions): ImageSetupFlow => {
  const stage = useImageSetupStage();
  const setSetup = useSketchStore((state) => state.setSetup);
  const brief = useSketchStore((state) => state.document.setup?.brief ?? "");
  const useCase = useSketchStore((state) => state.document.setup?.use_case);
  const refined = useSketchStore((state) => state.document.setup?.refined);
  // The refinement sends up to this many attached images, each billed as input.
  const referenceCount = useSketchStore(
    (state) => imageReferences(readReferences(state.document.setup)).length
  );
  const refinedFrom = useSketchStore((state) =>
    typeof state.document.setup?.refined_from === "string"
      ? state.document.setup.refined_from
      : null
  );
  const {
    expandBrief,
    cancel,
    refining,
    model: refineModel
  } = useRefineBrief();
  // Only a failed `Re-refine` belongs on the review. A use-case refinement
  // reports on the shell's button, and its failure must not greet a creator
  // who reaches the review with the brief they already had.
  const [reviewError, setReviewError] = useState<string | null>(null);
  const upload = useUploadFirstLayer(onFinish);
  const look = useLookStep();

  // A failed Re-refine belongs to the visit that asked for it. Coming back to
  // the review later must not show it, with a paid "Try again", again.
  const onStageChange = useCallback(
    (next: SketchSetupStage) => {
      setReviewError(null);
      setSetup({ stage: next });
    },
    [setSetup]
  );

  const startBlank = useCallback(() => {
    setSetup({ stage: "done" });
    onFinish();
  }, [onFinish, setSetup]);

  const refine = useCallback(
    async (context?: SetupOperationContext) => {
      setReviewError(null);
      const outcome = await expandBrief(context?.signal);
      if (!outcome.ok) {
        throw new Error(outcome.error ?? "The model did not return a brief.");
      }
    },
    [expandBrief]
  );

  // The review's fields are the creator's draft, so another pass polishes
  // them rather than replacing them with a fresh expansion (O4).
  const reRefine = useCallback(() => {
    setReviewError(null);
    void expandBrief(undefined, { keepEdits: true }).then((outcome) => {
      if (!outcome.ok) {
        setReviewError(outcome.error);
      }
    });
  }, [expandBrief]);

  // Coming back to the use case and pressing its button again must not pay for
  // the same expansion twice: the brief on the document already answers the
  // brief and use case it was written from (F15). Changing either makes the
  // button a refinement again, and the review's `Re-refine` is the explicit
  // way to ask for another one regardless.
  const briefIsCurrent =
    refined !== undefined &&
    refinedFrom === briefInputSignature({ brief, use_case: useCase });

  // What the expansion will cost, before it is asked for (PRD § 6.2, F23).
  // Nothing shows when no model is named, because nothing was measured.
  const refineSummary = useMemo<GenerationSummaryProps | undefined>(
    () =>
      refineModel
        ? {
            result: "Expand your sentence into a five-field brief you can edit",
            next: "You read and fix the brief next. No layer is added and no image is rendered here.",
            model: refineModel,
            brief,
            maxOutputTokens: REFINE_BRIEF_MAX_TOKENS,
            extraInputTokens: referenceCount * IMAGE_INPUT_TOKENS
          }
        : undefined,
    [brief, referenceCount, refineModel]
  );
  // Re-refine also sends the five edited fields back as context.
  const reRefineSummary = useMemo<GenerationSummaryProps | undefined>(
    () =>
      refineSummary && refined
        ? {
            ...refineSummary,
            brief: `${brief}\n${Object.values(refined).join("\n")}`
          }
        : refineSummary,
    [brief, refineSummary, refined]
  );

  // PRD § 10.3 renders `composeImagePrompt`, so an empty one is an empty
  // request. The review is where that is still fixable (F20).
  const promptIsWritable =
    composeImagePrompt({ brief, refined }).trim().length > 0;

  const steps = useMemo<SetupStep<SketchSetupStage>[]>(
    () => [
      {
        stage: "idea",
        label: "Idea",
        primaryLabel: "Continue",
        canAdvance: brief.trim().length > 0,
        blockedReason: "Describe the image, or upload one to edit",
        // An upload finishes the flow when it lands, so Continue waits for it
        // rather than racing it to the next step (F17).
        pending: upload.uploading,
        pendingLabel: "Reading your file",
        onCancel: upload.cancel,
        footerControls: (context) =>
          createElement(BriefModelFooterField, { readOnly: context.readOnly }),
        render: () =>
          createElement(IdeaStep, { onStartBlank: startBlank, upload })
      },
      {
        // Use case and review are both step 2, so they collapse into one
        // stepper entry (PRD § 6.2).
        stage: "useCase",
        label: "Brief",
        primaryLabel: briefIsCurrent
          ? "Continue to the brief"
          : "Refine the brief",
        canAdvance: (useCase ?? "").length > 0,
        blockedReason: "Pick an image use case",
        pending: refining,
        pendingLabel: "Refining the brief",
        generation: briefIsCurrent ? undefined : refineSummary,
        footerControls: (context) =>
          createElement(BriefModelFooterField, { readOnly: context.readOnly }),
        render: () => createElement(UseCaseStep),
        // D4: this is the only thing the step does. No layer is added and no
        // job is started — the answer is text the creator reviews next.
        onAdvance: briefIsCurrent ? undefined : refine,
        onCancel: cancel
      },
      {
        stage: "review",
        label: "Brief",
        primaryLabel: "Continue to look",
        canAdvance: promptIsWritable,
        blockedReason: "Write what the image shows before choosing the look",
        // The review's own `Re-refine` is a second call on the same brief.
        // The shell reads it too, so nothing moves the creator on while the
        // brief they are reading is being replaced (F2).
        pending: refining,
        pendingLabel: "Refining the brief",
        onCancel: cancel,
        render: () =>
          createElement(ReviewStep, {
            onReRefine: reRefine,
            refining,
            // The failure belongs beside the control that asked for it, with
            // the edited brief still in the boxes (F9).
            error: reviewError,
            generation: reRefineSummary
          })
      },
      {
        stage: "look",
        label: "Look",
        primaryLabel: "Generate your image",
        canAdvance: look.canAdvance,
        blockedReason: look.blockedReason,
        primaryDetail: look.primaryDetail,
        footerControls: (context) =>
          createElement(ImageModelFooterField, {
            look,
            readOnly: context.readOnly
          }),
        render: () => createElement(LookStep, { look }),
        // `generate` writes the terminal stage itself, before it enqueues
        // anything (D3). The host gets the layers in that same tick: waiting
        // for the start requests would leave a render where the stage is
        // `done`, no batch is known, and the bare editor shows (F14).
        onAdvance: async () => {
          await look.generate(onGenerated);
        }
      }
    ],
    [
      brief,
      briefIsCurrent,
      cancel,
      look,
      onGenerated,
      promptIsWritable,
      reRefine,
      refine,
      refineSummary,
      reRefineSummary,
      refining,
      reviewError,
      startBlank,
      upload,
      useCase
    ]
  );

  return {
    config: { labels: FLOW_LABELS, steps, stage, onStageChange },
    look
  };
};

export default useImageSetupFlow;
