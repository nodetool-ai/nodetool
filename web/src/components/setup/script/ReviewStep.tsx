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
 * until step 3's button — except `Rewrite`, which is a writer call, and so
 * carries the same result/model/cost/wait summary the write itself does (F23).
 *
 * A script can also end here. `Open the editor without voicing` writes stage
 * `done` and hands the text over, because a script is a finished thing whether
 * or not anyone reads it out; the only way to leave with text used to be to go
 * back to step 1 and start blank (F16).
 */

import React, { memo, useCallback, useMemo } from "react";
import {
  countScriptWords,
  estimateSpokenSeconds,
  type ScriptPaceId
} from "@nodetool-ai/protocol";

import {
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  Label,
  Text
} from "../../ui_primitives";
import GenerationSummary from "../GenerationSummary";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import type { LanguageModelValue } from "../../../stores/ApiTypes";
import { getScriptAgentHandler } from "../../../components/script/scriptAgentBridge";
import {
  useScriptStore,
  useScriptSetup
} from "../../../stores/script/ScriptStore";
import { readScriptSource } from "../../../lib/script/importedScript";
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

/** The picker holds one model name; left free it outweighs the script. */
const MODEL_PICKER_WIDTH = 260;

/** What a rewrite is allowed to write, matching step 2's own budget. */
const REWRITE_MAX_TOKENS = 8192;

export interface ReviewStepProps {
  scriptId: string;
  /** Reruns the writer with the edited script as context. */
  onRewrite: () => void;
  rewriting?: boolean;
  /** Finishes setup on the text alone: stage `done`, no voices, no audio. */
  onOpenEditor: () => void;
}

const ReviewStepInternal: React.FC<ReviewStepProps> = ({
  scriptId,
  onRewrite,
  rewriting = false,
  onOpenEditor
}) => {
  const script = useScriptStore((state) => state.scripts[scriptId]);
  const setup = useScriptSetup(scriptId);
  const setSetup = useScriptStore((state) => state.setSetup);
  const pace = (setup?.pace ?? "normal") as ScriptPaceId;
  const source = readScriptSource(setup);
  // Until the picker is touched the writer runs on the chat model, so that is
  // what the picker shows — a blank control would claim no model is set while
  // the rewrite would happily use one.
  const chatModel = useGlobalChatStore((state) => state.selectedModel);
  const writerModel = setup?.writer_model ?? chatModel ?? null;

  const setWriterModel = useCallback(
    (value: LanguageModelValue) => {
      setSetup(scriptId, {
        writer_model: { provider: value.provider, id: value.id }
      });
    },
    [scriptId, setSetup]
  );

  const addLine = useCallback(() => {
    // The store the `ui_script_add_line` handler writes to, so a line added
    // here and a line added headlessly are the same line.
    useScriptStore.getState().addLine(scriptId);
  }, [scriptId]);

  const removeLine = useCallback(
    (lineId: string) => {
      useScriptStore.getState().removeLine(scriptId, lineId);
    },
    [scriptId]
  );

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
            hideLabel: true,
            compact: true,
            value: line.speakerId ?? "",
            options: speakerOptions,
            onChange: (value: string) => setLineSpeaker(line.id, value)
          },
          {
            id: line.id,
            label: "Line",
            hideLabel: true,
            placeholder: "Line",
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

  const emptyLineIds = useMemo(
    () =>
      (script?.sections ?? []).flatMap((section) =>
        section.lines
          .filter((line) => line.text.trim() === "")
          .map((line) => line.id)
      ),
    [script?.sections]
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

      {/* The model and the rewrite belong together: picking a different
          writer is only useful next to the button that runs it. */}
      <FlexRow gap={GAP.normal} align="center" wrap>
        <Label>Write with</Label>
        <Box sx={{ width: MODEL_PICKER_WIDTH }}>
          <LanguageModelSelect
            value={writerModel?.id ?? ""}
            provider={writerModel?.provider}
            placeholder="Select writer model"
            onChange={setWriterModel}
          />
        </Box>
        <EditorButton
          variant="outlined"
          size="small"
          disabled={rewriting}
          onClick={onRewrite}
        >
          {rewriting ? "Rewriting…" : "Rewrite"}
        </EditorButton>
      </FlexRow>

      {/* A rewrite is a model call like any other, so it says what it will
          cost before it is pressed rather than after (F23). */}
      <GenerationSummary
        result={`Rewrite ${words} words, keeping the lines it keeps`}
        next={
          source
            ? "This replaces your imported words with the model's. Your own text is dropped."
            : "Edits you have made are given to the writer as context."
        }
        model={writerModel}
        brief={setup?.brief ?? ""}
        maxOutputTokens={REWRITE_MAX_TOKENS}
      />

      {/* The step asks for at least one line with words in it, so it carries
          the control that produces one. It used to say "add a line" with
          nothing on the screen that could (F20). */}
      <FlexRow gap={GAP.normal} align="center" wrap>
        <EditorButton variant="outlined" size="small" onClick={addLine}>
          Add a line
        </EditorButton>
        {emptyLineIds.length > 0 ? (
          <EditorButton
            variant="text"
            size="small"
            onClick={() => emptyLineIds.forEach(removeLine)}
          >
            {`Remove ${emptyLineIds.length} empty ${emptyLineIds.length === 1 ? "line" : "lines"}`}
          </EditorButton>
        ) : null}
      </FlexRow>

      <PlanReview sections={sections} />

      <FlexRow gap={GAP.normal} align="center" wrap>
        <EditorButton variant="text" size="small" onClick={onOpenEditor}>
          Open the editor without voicing
        </EditorButton>
        <Caption color="secondary">
          Finish here with the text. You can voice it in the editor later.
        </Caption>
      </FlexRow>
    </FlexColumn>
  );
};

export const ReviewStep = memo(ReviewStepInternal);
ReviewStep.displayName = "ScriptReviewStep";

export default ReviewStep;
