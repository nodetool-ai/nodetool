/**
 * Step 2 of the script flow — the format (PRD § 9.2).
 *
 * Five cards and a length row. The card sets the cast shape and the section
 * layout the writer works to; the length sets how many words it aims for. Both
 * write straight to the document, so the flow's primary button has only the
 * writer left to run.
 */

import React, { memo, useCallback } from "react";

import {
  Box,
  Caption,
  FlexColumn,
  FlexRow,
  GAP,
  Text,
  TextInput
} from "../../ui_primitives";
import { useScriptStore, useScriptSetup } from "../../../stores/script/ScriptStore";
import { OptionCardGrid } from "../OptionCardGrid";
import { SetupCardButton } from "../SetupCardButton";
import {
  DEFAULT_LENGTH_SECONDS,
  FORMAT_CARDS,
  LENGTH_CHOICES
} from "./formats";

/** The longest a script the flow writes may be asked to run, in seconds. */
const MAX_CUSTOM_SECONDS = 3600;

export interface FormatStepProps {
  scriptId: string;
}

const FormatStepInternal: React.FC<FormatStepProps> = ({ scriptId }) => {
  const setup = useScriptSetup(scriptId);
  const setSetup = useScriptStore((state) => state.setSetup);
  const seconds = setup?.length_seconds ?? DEFAULT_LENGTH_SECONDS;
  const isPreset = LENGTH_CHOICES.some((choice) => choice.seconds === seconds);

  const selectFormat = useCallback(
    (id: string) => setSetup(scriptId, { format: id }),
    [scriptId, setSetup]
  );

  const selectLength = useCallback(
    (value: number) => setSetup(scriptId, { length_seconds: value }),
    [scriptId, setSetup]
  );

  const handleCustom = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = Number(event.target.value);
      if (Number.isFinite(value) && value > 0) {
        setSetup(scriptId, {
          length_seconds: Math.min(Math.round(value), MAX_CUSTOM_SECONDS)
        });
      }
    },
    [scriptId, setSetup]
  );

  return (
    <FlexColumn gap={GAP.spacious}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Choose your format
        </Text>
        <Text size="normal" color="secondary">
          It sets who speaks and how the script is laid out.
        </Text>
      </FlexColumn>

      <OptionCardGrid
        label="Format"
        options={FORMAT_CARDS}
        selectedId={setup?.format ?? null}
        onSelect={selectFormat}
      />

      <FlexColumn gap={GAP.normal}>
        <Caption color="secondary" component="p">
          How long should it run?
        </Caption>
        <FlexRow
          role="group"
          aria-label="Length"
          gap={GAP.normal}
          align="center"
          wrap
        >
          {LENGTH_CHOICES.map((choice) => (
            <Box key={choice.id} sx={{ width: 96 }}>
              <SetupCardButton
                selected={seconds === choice.seconds}
                onSelect={() => selectLength(choice.seconds)}
              >
                <Text size="normal" component="span">
                  {choice.label}
                </Text>
              </SetupCardButton>
            </Box>
          ))}
          <Box sx={{ width: 160 }}>
            <TextInput
              type="number"
              label="Custom seconds"
              value={isPreset ? "" : String(seconds)}
              placeholder="Custom"
              onChange={handleCustom}
            />
          </Box>
        </FlexRow>
      </FlexColumn>
    </FlexColumn>
  );
};

export const FormatStep = memo(FormatStepInternal);
FormatStep.displayName = "ScriptFormatStep";

export default FormatStep;
