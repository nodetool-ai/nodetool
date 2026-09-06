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
import { usePlanBeats } from "../../../hooks/timeline/usePlanBeats";
import type { SetupFlowConfig, SetupStep } from "../types";
import { FormatStep } from "./FormatStep";
import { IdeaStep } from "./IdeaStep";
import { LookStep, useLookStep } from "./LookStep";
import { ReviewStep } from "./ReviewStep";
import { videoFormatById } from "./formats";

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
 */
export const newVideoSetupDocument = (brief: string) => ({
  tracks: [],
  clips: [],
  markers: [],
  setup: { stage: "idea" as const, brief }
});

/** The flow's name, above the stepper. Each step body carries its own heading. */
const FLOW_LABELS = { title: "Video" } as const;

export interface VideoSetupFlowOptions {
  /** Runs after the last step writes stage `done` — the host opens the cut. */
  onFinish?: () => void;
  /** Hands the brief to the script flow (E3); its `Send to timeline` returns. */
  onStartFromScript?: (brief: string) => void;
}

export const useVideoSetupFlow = ({
  onFinish,
  onStartFromScript
}: VideoSetupFlowOptions = {}): SetupFlowConfig<TimelineSetupStage> => {
  const stage = useVideoSetupStage();
  const setSetup = useTimelineStore((state) => state.setSetup);
  const brief = useTimelineStore((state) => state.setup?.brief ?? "");
  const formatId = useTimelineStore((state) => state.setup?.format);
  const { plan, planning } = usePlanBeats();

  // The two look choices that are not already on the document. They live here
  // rather than inside the step body because the price and the generate action
  // both read them, and those hang off the shell's button.
  const [voiceOn, setVoiceOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);
  const look = useLookStep({ voiceOn, musicOn });

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

  const replan = useCallback(() => {
    // The review's own `Re-plan` runs outside the shell's primary button, so a
    // refusal has no button to land on; the step keeps the plan it had and the
    // hook's error is what the creator sees next.
    void plan({ replan: true }).catch(() => undefined);
  }, [plan]);

  const steps = useMemo<SetupStep<TimelineSetupStage>[]>(
    () => [
      {
        stage: "idea",
        label: "Idea",
        primaryLabel: "Continue",
        canAdvance: brief.trim().length > 0,
        render: () =>
          createElement(IdeaStep, {
            // The blank escape hatch and the last step land in the same place:
            // stage `done` and the timeline (PRD § 8.1).
            onStartBlank: finish,
            onStartFromScript: startFromScript
          })
      },
      {
        // Format and review are both step 2, so they collapse to one stepper
        // entry (PRD § 6.2).
        stage: "format",
        label: "Beats",
        primaryLabel: "Plan the beats",
        canAdvance: videoFormatById(formatId) !== null,
        pending: planning,
        render: () => createElement(FormatStep),
        // The Director runs here and writes text only — no clip, no job (D4,
        // criterion 3). A refused run leaves the creator on the format step
        // with the reason on the button, which is what the throw is for.
        onAdvance: () => plan()
      },
      {
        stage: "review",
        label: "Beats",
        primaryLabel: "Continue to look",
        render: () =>
          createElement(ReviewStep, { onReplan: replan, replanPending: planning })
      },
      {
        stage: "look",
        label: "Look",
        primaryLabel: "Generate your video",
        canAdvance: look.canAdvance,
        primaryDetail: look.primaryDetail,
        render: () =>
          createElement(LookStep, {
            voiceOn,
            musicOn,
            onVoiceChange: setVoiceOn,
            onMusicChange: setMusicOn,
            musicAvailable: look.musicAvailable
          }),
        // `generate` writes the terminal stage itself, before it enqueues
        // anything (D3); the host opens the timeline once the jobs are away.
        onAdvance: async () => {
          await look.generate();
          onFinish?.();
        }
      }
    ],
    [
      brief,
      finish,
      formatId,
      look,
      musicOn,
      onFinish,
      plan,
      planning,
      replan,
      startFromScript,
      voiceOn
    ]
  );

  return { labels: FLOW_LABELS, steps, stage, onStageChange };
};

export default useVideoSetupFlow;
