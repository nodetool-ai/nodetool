/**
 * Step 2 of the script flow — the format (PRD § 9.2).
 *
 * Five cards and a length row. The card sets the cast shape and the section
 * layout the writer works to; the length sets how many words it aims for. Both
 * write straight to the document, so the flow's primary button has only the
 * writer left to run.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import {
  Box,
  FlexColumn,
  FlexRow,
  FormField,
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
const customSecondsError = (
  draft: string,
  t: TFunction
): string | null => {
  const value = Number(draft.trim());
  if (draft.trim() === "" || !Number.isInteger(value)) {
    return t("pass3_8.script.format.customLength.wholeNumberError", {
      min: MIN_CUSTOM_SECONDS,
      max: MAX_CUSTOM_SECONDS
    });
  }
  if (value < MIN_CUSTOM_SECONDS || value > MAX_CUSTOM_SECONDS) {
    return t("pass3_8.script.format.customLength.rangeError", {
      minSeconds: MIN_CUSTOM_SECONDS,
      maxMinutes: MAX_CUSTOM_SECONDS / 60
    });
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
  const { t } = useTranslation();
  const setup = useScriptSetup(scriptId);
  const setSetup = useScriptStore((state) => state.setSetup);
  const chatModel = useGlobalChatStore((state) => state.selectedModel);
  const writerModel = setup?.writer_model ?? chatModel;
  return (
    <SetupFooterField label={t("pass3_8.script.format.modelLabel")}>
      <LanguageModelSelect
        value={writerModel?.id ?? ""}
        provider={writerModel?.provider}
        placeholder={t("pass3_8.script.format.writerModelPlaceholder")}
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
  const { t } = useTranslation();
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
      FORMAT_CARDS.map((card) => ({
        ...card,
        title: t(`pass3_8.script.format.cards.${card.id}.title`),
        description: t(`pass3_8.script.format.cards.${card.id}.description`),
        disabled: readOnly || card.disabled
      })),
    [readOnly, t]
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
        label:
          choice.seconds < 60
            ? t("pass3_8.script.format.length.secondsShort", {
                count: choice.seconds
              })
            : t("pass3_8.script.format.length.minutesShort", {
                count: choice.seconds / 60
              }),
        disabled: readOnly
      })),
      {
        id: CUSTOM_LENGTH_ID,
        label: t("pass3_8.script.format.length.custom"),
        disabled: readOnly
      }
    ],
    [readOnly, t]
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
    if (readOnly || customSecondsError(customDraft, t) !== null) {
      return;
    }
    setSetup(scriptId, { length_seconds: Number(customDraft) });
  }, [customDraft, readOnly, scriptId, setSetup, t]);

  const customError = custom ? customSecondsError(customDraft, t) : null;

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
          {t("pass3_8.script.format.heading")}
        </Text>
        <Text size="normal" color="secondary">
          {t("pass3_8.script.format.description")}
        </Text>
      </FlexColumn>

      <OptionCardGrid
        label={t("pass3_8.script.format.groupLabel")}
        options={formatCards}
        selectedId={setup?.format ?? null}
        onSelect={selectFormat}
      />

      <FlexRow gap={GAP.normal} align="flex-start" wrap>
        {/* One choice among four, so one tab stop and arrow keys between the
            options — four cards announcing themselves as independent toggles
            described the wrong control (F26). The seconds field is not one of
            the options and stays outside the group. */}
        <FormField label={t("pass3_8.script.format.length.label")}>
          <FlexRow
            role="radiogroup"
            aria-label={t("pass3_8.script.format.length.groupLabel")}
            gap={GAP.normal}
            wrap
          >
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
        </FormField>
        {custom ? (
          <Box sx={{ width: CUSTOM_FIELD_WIDTH }}>
            <TextInput
              type="number"
              label={t("pass3_8.script.format.customLength.label")}
              value={customDraft}
              slotProps={{
                htmlInput: {
                  min: MIN_CUSTOM_SECONDS,
                  max: MAX_CUSTOM_SECONDS,
                  step: 1
                }
              }}
              placeholder={t("pass3_8.script.format.length.custom")}
              disabled={readOnly}
              errorMessage={customError ?? undefined}
              helperText={t("pass3_8.script.format.customLength.helper", {
                min: MIN_CUSTOM_SECONDS,
                max: MAX_CUSTOM_SECONDS
              })}
              onChange={handleCustom}
              onBlur={commitCustom}
              onKeyDown={handleCustomKeyDown}
            />
          </Box>
        ) : null}
      </FlexRow>
    </FlexColumn>
  );
};

export const FormatStep = memo(FormatStepInternal);
FormatStep.displayName = "ScriptFormatStep";

export default FormatStep;
