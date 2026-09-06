/**
 * Step 2's review — the script before anything is voiced (PRD § 9.2, D4).
 *
 * The words, the speaker on each line and the direction note, laid out the way
 * the editor lays them out, and editable in place. Every edit goes through the
 * same handler the `ui_script_set_line_text` and `ui_script_set_speaker` tools
 * call, so what a creator can fix here an agent can fix headlessly and neither
 * path can drift from the other (§ 9.6, criterion 6).
 *
 * Nothing here spends anything: no take is recorded and no provider is called
 * until step 3's button.
 */

import React, { memo, useCallback, useMemo } from "react";
import {
  countScriptWords,
  estimateSpokenSeconds,
  type ScriptPaceId
} from "@nodetool-ai/protocol";

import { Caption, FlexColumn, GAP, Text } from "../../ui_primitives";
import { getScriptAgentHandler } from "../../../components/script/scriptAgentBridge";
import {
  useScriptStore,
  useScriptSetup
} from "../../../stores/script/ScriptStore";
import { PlanReview } from "../PlanReview";
import type { PlanReviewSection } from "../PlanReview";

/** A duration as the review states it: seconds under a minute, else m:ss. */
const spokenLength = (seconds: number): string => {
  const rounded = Math.round(seconds);
  if (rounded < 60) {
    return `${rounded}s`;
  }
  return `${Math.floor(rounded / 60)}m ${String(rounded % 60).padStart(2, "0")}s`;
};

export interface ReviewStepProps {
  scriptId: string;
  /** Reruns the writer with the edited script as context. */
  onRewrite: () => void;
  rewriting?: boolean;
}

const ReviewStepInternal: React.FC<ReviewStepProps> = ({
  scriptId,
  onRewrite,
  rewriting = false
}) => {
  const script = useScriptStore((state) => state.scripts[scriptId]);
  const setup = useScriptSetup(scriptId);
  const pace = (setup?.pace ?? "normal") as ScriptPaceId;

  const setLineText = useCallback(
    (lineId: string, text: string) => {
      getScriptAgentHandler(scriptId).setLineText(lineId, text);
    },
    [scriptId]
  );

  const setLineSpeaker = useCallback(
    (lineId: string, speakerId: string) => {
      getScriptAgentHandler(scriptId).setLineSpeaker(
        lineId,
        speakerId === "" ? null : speakerId
      );
    },
    [scriptId]
  );

  const speakerOptions = useMemo(
    () => (script?.cast ?? []).map((speaker) => ({
      value: speaker.id,
      label: speaker.name
    })),
    [script?.cast]
  );

  const sections = useMemo<PlanReviewSection[]>(
    () =>
      (script?.sections ?? []).map((section) => ({
        id: section.id,
        header: section.title ?? "Script",
        rows: section.lines.flatMap((line) => [
          {
            id: `${line.id}-speaker`,
            label: "Speaker",
            value: line.speakerId ?? "",
            options: speakerOptions,
            onChange: (value: string) => setLineSpeaker(line.id, value)
          },
          {
            id: line.id,
            label: "Line",
            value: line.text,
            multiline: true,
            onChange: (value: string) => setLineText(line.id, value)
          },
          ...(line.direction === undefined
            ? []
            : [
                {
                  id: `${line.id}-direction`,
                  label: "Direction",
                  value: line.direction,
                  readOnly: true,
                  onChange: () => undefined
                }
              ]),
          // A subtitle import brought its own timing, and the take has to hit
          // it — so it is shown beside the words it belongs to rather than
          // sitting unseen on the document (PRD § 9.1).
          ...(line.targetDurationMs === undefined
            ? []
            : [
                {
                  id: `${line.id}-target`,
                  label: "Target length",
                  value: `${(line.targetDurationMs / 1000).toFixed(1)}s`,
                  readOnly: true,
                  onChange: () => undefined
                }
              ])
        ])
      })),
    [script?.sections, setLineSpeaker, setLineText, speakerOptions]
  );

  const words = useMemo(
    () =>
      (script?.sections ?? []).reduce(
        (total, section) =>
          total +
          section.lines.reduce(
            (sum, line) => sum + countScriptWords(line.text),
            0
          ),
        0
      ),
    [script?.sections]
  );

  return (
    <FlexColumn gap={GAP.spacious}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Read it through
        </Text>
        <Caption color="secondary" component="p">
          {`${words} words · about ${spokenLength(estimateSpokenSeconds(words, pace))} spoken at a ${pace} read`}
        </Caption>
      </FlexColumn>

      <PlanReview
        sections={sections}
        replanLabel="Rewrite"
        onReplan={onRewrite}
        replanPending={rewriting}
      />
    </FlexColumn>
  );
};

export const ReviewStep = memo(ReviewStepInternal);
ReviewStep.displayName = "ScriptReviewStep";

export default ReviewStep;
