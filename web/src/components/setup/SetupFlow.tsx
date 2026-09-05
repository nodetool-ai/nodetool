/**
 * SetupFlow — the one shell every guided creation flow renders in (PRD § 6.2).
 *
 * Stepper, `Back`, the primary button, and a slot for the current step's body.
 * The flow is a function of the document's stage plus its fields (D1, D3): the
 * shell keeps no wizard store, only the transient busy/error state of the
 * action it is awaiting. It assumes no route, no store and no host layout, so
 * the same component renders inside a workspace tab and inside Studio, sized
 * to whatever container it is given.
 */

import React, { useCallback, useMemo, useState } from "react";

import {
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  PADDING,
  ScrollArea,
  Text
} from "../ui_primitives";
import type { SetupFlowConfig, SetupStep } from "./types";

export type { SetupFlowConfig, SetupFlowLabels, SetupStep } from "./types";

/** One stepper entry: a label and the step that entering it rewinds to. */
interface StepperEntry {
  label: string;
  firstIndex: number;
}

/**
 * Consecutive steps sharing a label are one stepper entry. A flow's step 2
 * spans two stages — the picker and the plan review it produces — and the
 * creator should see one dot for both (PRD § 6.2).
 */
const stepperEntries = <Stage extends string>(
  steps: readonly SetupStep<Stage>[]
): StepperEntry[] =>
  steps.reduce<StepperEntry[]>((entries, step, index) => {
    const last = entries[entries.length - 1];
    if (last?.label === step.label) {
      return entries;
    }
    return [...entries, { label: step.label, firstIndex: index }];
  }, []);

export interface SetupFlowProps<Stage extends string> {
  config: SetupFlowConfig<Stage>;
}

export function SetupFlow<Stage extends string>({
  config
}: SetupFlowProps<Stage>): React.ReactElement | null {
  const { labels, steps, stage, onStageChange } = config;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentIndex = steps.findIndex((step) => step.stage === stage);
  const entries = useMemo(() => stepperEntries(steps), [steps]);
  const step = currentIndex >= 0 ? steps[currentIndex] : undefined;

  const handleBack = useCallback(() => {
    setError(null);
    const previous = steps[currentIndex - 1];
    if (previous) {
      onStageChange(previous.stage);
    }
  }, [currentIndex, onStageChange, steps]);

  const handleRewind = useCallback(
    (index: number) => {
      setError(null);
      onStageChange(steps[index].stage);
    },
    [onStageChange, steps]
  );

  const handlePrimary = useCallback(async () => {
    if (!step) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await step.onAdvance?.();
      // The last step's action writes the terminal stage itself, so there is
      // nothing left for the shell to advance.
      const next = steps[currentIndex + 1];
      if (next) {
        onStageChange(next.stage);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [currentIndex, onStageChange, step, steps]);

  // A stage outside the flow (a finished document) belongs to the editor, not
  // to this shell.
  if (!step) {
    return null;
  }

  const currentEntry = entries.reduce(
    (best, entry, index) => (entry.firstIndex <= currentIndex ? index : best),
    0
  );
  const pending = busy || step.pending === true;

  return (
    <FlexColumn
      fullWidth
      fullHeight
      gap={GAP.spacious}
      padding={PADDING.section}
      sx={{ minHeight: 0 }}
    >
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          {labels.title}
        </Text>
        {labels.subline ? (
          <Text size="normal" color="secondary">
            {labels.subline}
          </Text>
        ) : null}
      </FlexColumn>

      <Box component="nav" aria-label="Setup steps">
        <FlexRow
          component="ol"
          gap={GAP.comfortable}
          align="center"
          sx={{ listStyle: "none", margin: 0, padding: 0 }}
        >
          {entries.map((entry, index) => (
            <Box component="li" key={entry.label}>
              {index < currentEntry ? (
                <EditorButton
                  variant="text"
                  onClick={() => handleRewind(entry.firstIndex)}
                >
                  {`${index + 1}. ${entry.label}`}
                </EditorButton>
              ) : (
                <Text
                  size="small"
                  component="span"
                  color={index === currentEntry ? "primary" : "secondary"}
                  aria-current={index === currentEntry ? "step" : undefined}
                >
                  {`${index + 1}. ${entry.label}`}
                </Text>
              )}
            </Box>
          ))}
        </FlexRow>
      </Box>

      <ScrollArea fullHeight sx={{ flex: 1, minHeight: 0 }}>
        {step.render()}
      </ScrollArea>

      {error ? (
        <Text size="small" color="error" role="alert">
          {error}
        </Text>
      ) : null}

      <FlexRow gap={GAP.normal} align="center" justify="space-between">
        <EditorButton
          variant="text"
          onClick={handleBack}
          disabled={currentIndex === 0}
        >
          Back
        </EditorButton>
        <FlexRow gap={GAP.normal} align="center">
          {step.primaryDetail ? (
            <Caption color="secondary">{step.primaryDetail}</Caption>
          ) : null}
          <EditorButton
            variant="contained"
            onClick={handlePrimary}
            disabled={step.canAdvance === false || pending}
          >
            {step.primaryLabel}
          </EditorButton>
        </FlexRow>
      </FlexRow>
    </FlexColumn>
  );
}

export default SetupFlow;
