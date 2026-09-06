/**
 * The image flow's config: the one place that maps a sketch document's
 * `setup.stage` onto a step (PRD § 10.1–10.3, § 6.4).
 *
 * Everything the flow needs is on the document, so any host builds the same
 * config and gets the same four steps back. `done` maps to no step: the
 * document belongs to the editor from there on (D3), which is also why a
 * document with no `setup` at all opens as the editor and always has.
 */

import { createElement, useCallback, useMemo, useRef } from "react";
import type { SketchSetupStage } from "@nodetool-ai/protocol/api-schemas/sketch.js";

import { useSketchStore } from "../../sketch/state/useSketchStore";
import { useRefineBrief } from "../../../hooks/sketch/useRefineBrief";
import { useUploadFirstLayer } from "../../../hooks/sketch/useUploadFirstLayer";
import type { SetupFlowConfig, SetupStep } from "../types";
import { IdeaStep } from "./IdeaStep";
import { LookStep, useLookStep, type LookStepControls } from "./LookStep";
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
  /** Runs once the last step has written `done` and the batch is enqueued. */
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
  const { expandBrief, refining, error: refineError } = useRefineBrief();
  const upload = useUploadFirstLayer(onFinish);
  const look = useLookStep();

  // The reason a refused run gives arrives as state one render after the call
  // resolves, so the step's own closure cannot see it. Mirror it and read the
  // mirror, so the shell puts the real message on the button.
  const refineErrorRef = useRef<string | null>(null);
  refineErrorRef.current = refineError;

  const onStageChange = useCallback(
    (next: SketchSetupStage) => setSetup({ stage: next }),
    [setSetup]
  );

  const startBlank = useCallback(() => {
    setSetup({ stage: "done" });
    onFinish();
  }, [onFinish, setSetup]);

  const refine = useCallback(async () => {
    const refined = await expandBrief();
    if (!refined) {
      throw new Error(
        refineErrorRef.current ?? "The model did not return a brief."
      );
    }
  }, [expandBrief]);

  const reRefine = useCallback(() => {
    void expandBrief();
  }, [expandBrief]);

  const steps = useMemo<SetupStep<SketchSetupStage>[]>(
    () => [
      {
        stage: "idea",
        label: "Idea",
        primaryLabel: "Continue",
        canAdvance: brief.trim().length > 0,
        render: () =>
          createElement(IdeaStep, { onStartBlank: startBlank, upload })
      },
      {
        // Use case and review are both step 2, so they collapse into one
        // stepper entry (PRD § 6.2).
        stage: "useCase",
        label: "Brief",
        primaryLabel: "Refine the brief",
        canAdvance: (useCase ?? "").length > 0,
        pending: refining,
        render: () => createElement(UseCaseStep),
        // D4: this is the only thing the step does. No layer is added and no
        // job is started — the answer is text the creator reviews next.
        onAdvance: refine
      },
      {
        stage: "review",
        label: "Brief",
        primaryLabel: "Continue to look",
        render: () =>
          createElement(ReviewStep, { onReRefine: reRefine, refining })
      },
      {
        stage: "look",
        label: "Look",
        primaryLabel: "Generate your image",
        canAdvance: look.canAdvance,
        primaryDetail: look.primaryDetail,
        render: () => createElement(LookStep, { look }),
        // `generate` writes the terminal stage itself, before it enqueues
        // anything (D3); the host then shows the contact sheet.
        onAdvance: async () => {
          onGenerated(await look.generate());
        }
      }
    ],
    [brief, look, onGenerated, reRefine, refine, refining, startBlank, upload, useCase]
  );

  return {
    config: { labels: FLOW_LABELS, steps, stage, onStageChange },
    look
  };
};

export default useImageSetupFlow;
