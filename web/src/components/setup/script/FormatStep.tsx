/**
 * Step 2 of the script flow — the format (PRD § 9.2).
 *
 * Five cards and a length row. The card sets the cast shape and the section
 * layout the writer works to; the length sets how many words it aims for. Both
 * write straight to the document, so the flow's primary button has only the
 * writer left to run.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";

import {
  Box,
  Caption,
  FlexColumn,
  FlexRow,
  GAP,
  Text,
  TextInput
} from "../../ui_primitives";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { SetupFooterField } from "../SetupFooterField";
import {
  useScriptStore,
  useScriptSetup
} from "../../../stores/script/ScriptStore";
import { OptionCardGrid } from "../OptionCardGrid";
import { SetupCardButton, useRovingRadioGroup } from "../SetupCardButton";
import {
  DEFAULT_LENGTH_SECONDS,
  FORMAT_CARDS,
  LENGTH_CHOICES
} from "./formats";

/** The fourth option in the length row, not a toggle beside the other three. */
const CUSTOM_LENGTH_ID = "custom";

/** The longest a script the flow writes may be asked to run, in seconds. */
const MAX_CUSTOM_SECONDS = 3600;
const MIN_CUSTOM_SECONDS = 5;

/** The custom field holds three digits and its range note. */
const CUSTOM_FIELD_WIDTH = 200;

/** Every length card is the same width, whatever its label. */
const LENGTH_CARD_WIDTH = 96;

/** What the field holds while it is being typed, and what it means. */
const customSecondsError = (draft: string): string | null => {
  const value = Number(draft.trim());
  if (draft.trim() === "" || !Number.isFinite(value)) {
    return `Enter a whole number of seconds, ${MIN_CUSTOM_SECONDS}–${MAX_CUSTOM_SECONDS}.`;
  }
  if (value < MIN_CUSTOM_SECONDS || value > MAX_CUSTOM_SECONDS) {
    return `Scripts run between ${MIN_CUSTOM_SECONDS} seconds and ${MAX_CUSTOM_SECONDS / 60} minutes.`;
  }
  return null;
};

export interface FormatStepProps {
  scriptId: string;
  onValidationChange?: (error: string | null) => void;
  /** A view-mode tab: the choices show but cannot be changed. */
  readOnly?: boolean;
}

/** The writer model, for the shell's footer beside the estimate it prices. */
export const WriterModelFooterField: React.FC<{
  scriptId: string;
  readOnly?: boolean;
}> = ({ scriptId, readOnly = false }) => {
  const setup = useScriptSetup(scriptId);
  const setSetup = useScriptStore((state) => state.setSetup);
  const chatModel = useGlobalChatStore((state) => state.selectedModel);
  const writerModel = setup?.writer_model ?? chatModel;
  return (
    <SetupFooterField label="Model">
      <LanguageModelSelect
        value={writerModel?.id ?? ""}
        provider={writerModel?.provider}
        placeholder="Writer model"
        disabled={readOnly}
        onChange={(value) => {
          if (readOnly) {
            return;
          }
          setSetup(scriptId, {
            writer_model: { id: value.id, provider: value.provider }
          });
        }}
      />
    </SetupFooterField>
  );
};

const FormatStepInternal: React.FC<FormatStepProps> = ({
  scriptId,
  onValidationChange,
  readOnly = false
}) => {
  const setup = useScriptSetup(scriptId);
  const setSetup = useScriptStore((state) => state.setSetup);
  const seconds = setup?.length_seconds ?? DEFAULT_LENGTH_SECONDS;
  const [custom, setCustom] = useState(
    () => !LENGTH_CHOICES.some((choice) => choice.seconds === seconds)
  );
  // The field holds what was typed, not what the document holds: rounding and
  // clamping mid-keystroke rewrote "90" to "9" the moment the 9 was typed, and
  // clearing the field put the old number back (F21). Commit on blur or submit.
  const [customDraft, setCustomDraft] = useState(() => String(seconds));

  const selectFormat = useCallback(
    (id: string) => {
      if (!readOnly) {
        setSetup(scriptId, { format: id });
      }
    },
    [readOnly, scriptId, setSetup]
  );

  const formatCards = useMemo(
    () =>
      readOnly
        ? FORMAT_CARDS.map((card) => ({ ...card, disabled: true }))
        : FORMAT_CARDS,
    [readOnly]
  );

  const startCustom = useCallback(() => {
    if (readOnly) {
      return;
    }
    setCustom(true);
    setCustomDraft(String(seconds));
  }, [readOnly, seconds]);

  // The four options the row offers, `Custom` among them rather than beside
  // them: picking any one unpicks the rest.
  const lengthOptions = useMemo(
    () => [
      ...LENGTH_CHOICES.map((choice) => ({
        id: choice.id,
        label: choice.label,
        disabled: readOnly
      })),
      { id: CUSTOM_LENGTH_ID, label: "Custom", disabled: readOnly }
    ],
    [readOnly]
  );

  const selectedLengthId = custom
    ? CUSTOM_LENGTH_ID
    : (LENGTH_CHOICES.find((choice) => choice.seconds === seconds)?.id ?? null);

  const selectLengthOption = useCallback(
    (id: string) => {
      if (readOnly) {
        return;
      }
      if (id === CUSTOM_LENGTH_ID) {
        startCustom();
        return;
      }
      const choice = LENGTH_CHOICES.find((entry) => entry.id === id);
      if (!choice) {
        return;
      }
      setCustom(false);
      setSetup(scriptId, { length_seconds: choice.seconds });
    },
    [readOnly, scriptId, setSetup, startCustom]
  );

  const radioProps = useRovingRadioGroup(
    lengthOptions,
    selectedLengthId,
    selectLengthOption
  );

  const handleCustom = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setCustomDraft(event.target.value);
    },
    []
  );

  // Confirmed on blur, and only when it means something: an unreadable draft
  // leaves the document's length alone and says why under the field.
  const commitCustom = useCallback(() => {
    if (readOnly || customSecondsError(customDraft) !== null) {
      return;
    }
    setSetup(scriptId, { length_seconds: Math.round(Number(customDraft)) });
  }, [customDraft, readOnly, scriptId, setSetup]);

  const customError = custom ? customSecondsError(customDraft) : null;

  useEffect(() => {
    onValidationChange?.(customError);
  }, [customError, onValidationChange]);

  useEffect(() => () => onValidationChange?.(null), [onValidationChange]);

  const handleCustomKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      if (customError) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      commitCustom();
    }
  };

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
        options={formatCards}
        selectedId={setup?.format ?? null}
        onSelect={selectFormat}
      />

      <FlexColumn gap={GAP.normal}>
        <Caption color="secondary" component="p">
          How long should it run?
        </Caption>
        <FlexRow gap={GAP.normal} align="center" wrap>
          {/* One choice among four, so one tab stop and arrow keys between the
              options — four cards announcing themselves as independent
              toggles described the wrong control (F26). The seconds field is
              not one of the options and stays outside the group. */}
          <FlexRow role="radiogroup" aria-label="Length" gap={GAP.normal} wrap>
            {lengthOptions.map((option) => {
              const radio = radioProps(option);
              return (
                <Box key={option.id} sx={{ width: LENGTH_CARD_WIDTH }}>
                  <SetupCardButton
                    {...radio}
                    disabled={readOnly}
                    onSelect={() => selectLengthOption(option.id)}
                  >
                    <Text size="normal" component="span">
                      {option.label}
                    </Text>
                  </SetupCardButton>
                </Box>
              );
            })}
          </FlexRow>
          {custom ? (
            <Box sx={{ width: CUSTOM_FIELD_WIDTH }}>
              <TextInput
                type="number"
                label="Custom seconds"
                value={customDraft}
                slotProps={{
                  htmlInput: {
                    min: MIN_CUSTOM_SECONDS,
                    max: MAX_CUSTOM_SECONDS,
                    step: 1
                  }
                }}
                placeholder="Custom"
                disabled={readOnly}
                error={customError !== null}
                helperText={
                  customError ??
                  `${MIN_CUSTOM_SECONDS}–${MAX_CUSTOM_SECONDS} seconds`
                }
                onChange={handleCustom}
                onBlur={commitCustom}
                onKeyDown={handleCustomKeyDown}
              />
            </Box>
          ) : null}
        </FlexRow>
      </FlexColumn>
    </FlexColumn>
  );
};

export const FormatStep = memo(FormatStepInternal);
FormatStep.displayName = "ScriptFormatStep";

export default FormatStep;
