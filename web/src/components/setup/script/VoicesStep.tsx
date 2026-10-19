/**
 * Step 3 of the script flow — the voices (PRD § 9.3).
 *
 * One shared TTS model picker, with its voice dropdown, per speaker in the
 * cast. The voice can be heard after it is chosen: pressing `Hear this voice`
 * reads that speaker's own first line, so the choice is made on the words the
 * creator wrote rather than on a stock sample. Each sample is one TTS call, made when
 * it is asked for and kept for the session (`useVoiceSamples`).
 *
 * Picking a voice binds it through the same handler
 * `ui_script_set_speaker_voice` calls, so the headless path and this one write
 * the same thing (§ 9.6).
 *
 * Language and pace sit here because § 9.3 puts them here, and each now says
 * what it reaches: pace is sent with every speech call the flow makes, and a
 * voice whose provider ignores it says so; language is what the writer wrote in,
 * so changing it after the script exists is a rewrite, and the step says that
 * rather than pretending the button applies it (F12).
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ScriptPace } from "@nodetool-ai/protocol/api-schemas/scripts.js";

import { formatUsd } from "@nodetool-ai/model-pricing";

import {
  AlertBanner,
  AudioPlayback,
  CONTROL,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  FormField,
  GAP,
  SelectField,
  Text
} from "../../ui_primitives";
import TTSModelSelect from "../../properties/TTSModelSelect";
import ScriptSpeakerAvatar from "../../script/ScriptSpeakerAvatar";
import { getScriptAgentHandler } from "../../../components/script/scriptAgentBridge";
import useModelPreferencesStore from "../../../stores/ModelPreferencesStore";
import { openProviderOnboarding } from "../../../stores/ProviderOnboardingStore";
import {
  useScriptStore,
  useScriptSetup
} from "../../../stores/script/ScriptStore";
import type { ScriptSpeaker } from "../../../stores/script/ScriptStore";
import { useVoiceSamples } from "../../../hooks/script/useVoiceSamples";
import {
  paceSpeed,
  providerAppliesPace
} from "../../../hooks/script/scriptPace";
import type { TTSModelValue } from "../../../stores/ApiTypes";
import { getModelUnitPrice } from "../../../utils/modelUnitPricing";
import type { BugReportContext } from "../../../utils/bugReportBundle";
import ReportBugButton from "../../support/ReportBugButton";
import { REVIEW_BLOCK, REVIEW_CONTENT_WIDTH } from "../reviewStyles";
import { useSetupVoices } from "./useSetupVoices";
import type { SetupVoice } from "./useSetupVoices";

/** The languages the flow offers to write and read in. */
const LANGUAGES = [
  { value: "English", key: "pass3_9.voices.english" },
  { value: "Spanish", key: "pass3_9.voices.spanish" },
  { value: "French", key: "pass3_9.voices.french" },
  { value: "German", key: "pass3_9.voices.german" },
  { value: "Portuguese", key: "pass3_9.voices.portuguese" },
  { value: "Italian", key: "pass3_9.voices.italian" },
  { value: "Japanese", key: "pass3_9.voices.japanese" },
  { value: "Korean", key: "pass3_9.voices.korean" },
  { value: "Mandarin", key: "pass3_9.voices.mandarin" },
  { value: "Hindi", key: "pass3_9.voices.hindi" }
];

const PACES: ReadonlyArray<{ value: ScriptPace; key: string }> = [
  { value: "slow", key: "pass3_9.voices.slow" },
  { value: "normal", key: "pass3_9.voices.normal" },
  { value: "fast", key: "pass3_9.voices.fast" }
];

/** The line a speaker's samples read: the first thing they say. */
const firstLineOf = (
  sections: ReadonlyArray<{
    lines: ReadonlyArray<{ speakerId?: string | null; text: string }>;
  }>,
  speakerId: string
): string => {
  for (const section of sections) {
    for (const line of section.lines) {
      if (line.speakerId === speakerId && line.text.trim() !== "") {
        return line.text;
      }
    }
  }
  return "";
};

/**
 * What one audition costs, when the catalog prices it. Nothing is claimed when
 * nothing was measured (PRD § 6.2), and two models with different rates give a
 * range rather than one number that is wrong for half the grid.
 */
const auditionCost = (
  voices: readonly SetupVoice[],
  characters: number,
  formatCost: (low: number, high: number) => string
): string | null => {
  const models = new Map<string, { id: string; provider: string }>();
  for (const voice of voices) {
    models.set(`${voice.provider}:${voice.model}`, {
      id: voice.model,
      provider: voice.provider
    });
  }
  const prices: number[] = [];
  for (const model of models.values()) {
    const price = getModelUnitPrice(model, { characters });
    if (price && !price.declined && Number.isFinite(price.unit_price)) {
      prices.push(price.unit_price);
    }
  }
  if (prices.length === 0) {
    return null;
  }
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  return formatCost(low, high);
};

interface SpeakerVoiceRowProps {
  scriptId: string;
  speaker: ScriptSpeaker;
  line: string;
  voices: readonly SetupVoice[];
  pace: ScriptPace;
  speed: number | undefined;
  readOnly: boolean;
}

const SpeakerVoiceRow: React.FC<SpeakerVoiceRowProps> = ({
  scriptId,
  speaker,
  line,
  voices,
  pace,
  speed,
  readOnly
}) => {
  const { t } = useTranslation();
  const { sampleFor, play, spokenText } = useVoiceSamples(speed);
  // Each press of `Hear` remounts the player with autoplay, so a sample that
  // is already cached plays again instead of the press doing nothing.
  const [playRequest, setPlayRequest] = useState(0);
  // A model with no preset voices hands back no voice to bind.
  const [noPresetVoice, setNoPresetVoice] = useState(false);
  const bound = speaker.voice;
  const ttsDefault = useModelPreferencesStore((s) => s.defaults["tts_model"]);
  // A speaker with no voice yet starts on the Settings speech model, so a
  // connected provider is enough to hear the script.
  useEffect(() => {
    if (readOnly || bound || !ttsDefault) {
      return;
    }
    const first = voices.find(
      (voice) =>
        voice.provider === ttsDefault.provider && voice.model === ttsDefault.id
    );
    if (first) {
      getScriptAgentHandler(scriptId).setSpeakerVoice(speaker.id, {
        provider: first.provider,
        model: first.model,
        voice: first.voice
      });
    }
  }, [readOnly, bound, ttsDefault, voices, scriptId, speaker.id]);
  // A bound voice the list does not carry (still loading, or a provider that
  // dropped it) is still the speaker's voice, so it stays playable.
  const selectedVoice = useMemo<SetupVoice | undefined>(() => {
    if (!bound?.voice) {
      return undefined;
    }
    return (
      voices.find(
        (voice) =>
          voice.model === bound.model &&
          voice.voice === bound.voice &&
          voice.provider === bound.provider
      ) ?? {
        id: `${bound.provider}:${bound.model}:${bound.voice}`,
        label: bound.voice,
        modelLabel: bound.model,
        provider: bound.provider,
        model: bound.model,
        voice: bound.voice
      }
    );
  }, [bound, voices]);
  // The TTS select reads the voice off `selected_voice`, so the binding is
  // rebuilt as its value.
  const modelValue = useMemo<TTSModelValue | "">(
    () =>
      bound
        ? {
            type: "tts_model",
            id: bound.model,
            provider: bound.provider as TTSModelValue["provider"],
            name: "",
            voices: [],
            selected_voice: bound.voice
          }
        : "",
    [bound]
  );

  const selectModel = useCallback(
    (value: TTSModelValue) => {
      if (readOnly) {
        return;
      }
      if (!value.selected_voice) {
        setNoPresetVoice(true);
        return;
      }
      setNoPresetVoice(false);
      getScriptAgentHandler(scriptId).setSpeakerVoice(speaker.id, {
        provider: value.provider,
        model: value.id,
        voice: value.selected_voice
      });
    },
    [readOnly, scriptId, speaker.id]
  );

  const spoken = spokenText(line);
  const hasLine = spoken !== "";

  const sample = selectedVoice ? sampleFor(selectedVoice, line) : null;
  const cost =
    hasLine && selectedVoice
      ? auditionCost([selectedVoice], spoken.length, (low, high) =>
          low === high
            ? t("i18n-next118.scriptVoices.sampleCostSingle", {
                cost: formatUsd(low)
              })
            : t("i18n-next118.scriptVoices.sampleCostRange", {
                low: formatUsd(low),
                high: formatUsd(high)
              })
        )
      : null;
  const paceNote =
    selectedVoice &&
    speed !== undefined &&
    !providerAppliesPace(selectedVoice.provider)
      ? t("pass3_9.voices.providerPace", { pace })
      : null;
  const sampleErrorContext = useMemo<BugReportContext | null>(
    () =>
      sample?.error
        ? {
            source: "manual",
            summary: t("pass3_9.voices.sampleFailed", { name: speaker.name }),
            errorText: sample.error,
            provider: selectedVoice?.provider,
            model: selectedVoice?.model
          }
        : null,
    [
      sample?.error,
      selectedVoice?.model,
      selectedVoice?.provider,
      speaker.name,
      t
    ]
  );

  return (
    <FlexColumn
      gap={GAP.normal}
      component="section"
      aria-label={speaker.name}
      sx={REVIEW_BLOCK}
    >
      {/* The portrait and colour the editor gives this speaker, so the card
          reads as the same person the review's gutter named. */}
      <FlexRow gap={GAP.normal} align="center">
        <ScriptSpeakerAvatar speaker={speaker} size={CONTROL.height.md} />
        <FlexColumn gap={GAP.micro} sx={{ minWidth: 0 }}>
          <Text size="normal" weight={600} component="h3">
            {speaker.name}
          </Text>
          <Caption color="secondary" component="p">
            {hasLine
              ? t("pass3_9.voices.samplesRead", { text: spoken })
              : t("pass3_9.voices.noLinesToSample")}
          </Caption>
          {/* Every audition is a speech call, so the step says so before one
              is pressed rather than after it is billed (F23). */}
          {hasLine ? (
            <Caption color="muted" component="p">
              {t("pass3_9.voices.sampleCost", {
                count: spoken.length,
                cost: cost ?? ""
              })}
            </Caption>
          ) : null}
        </FlexColumn>
      </FlexRow>
      <FlexRow gap={GAP.comfortable} wrap align="flex-end">
        {readOnly ? (
          <Text size="normal">
            {selectedVoice
              ? t("pass3_9.voices.voiceLabel", { voice: selectedVoice.label })
              : t("pass3_9.voices.noVoiceChosen")}
          </Text>
        ) : (
          <FormField
            label={t("pass3_9.voices.ttsModelFor", { name: speaker.name })}
            helperText={paceNote ?? undefined}
            error={
              noPresetVoice ? t("pass3_9.voices.noPresetVoices") : undefined
            }
          >
            <TTSModelSelect
              value={modelValue}
              onChange={selectModel}
              voiceLabel={t("pass3_9.voices.voiceFor", { name: speaker.name })}
            />
          </FormField>
        )}
        {hasLine ? (
          <EditorButton
            variant="outlined"
            // A view-mode tab replays a sample already made but pays for
            // no new one.
            disabled={
              !selectedVoice ||
              sample?.pending ||
              (readOnly && !sample?.assetId)
            }
            aria-label={
              selectedVoice
                ? t("pass3_9.voices.hearVoiceFor", {
                    voice: selectedVoice.label,
                    name: speaker.name
                  })
                : t("pass3_9.voices.hearVoiceForName", { name: speaker.name })
            }
            onClick={() => {
              if (selectedVoice) {
                play(selectedVoice, line);
                setPlayRequest((count) => count + 1);
              }
            }}
          >
            {sample?.pending
              ? t("pass3_9.voices.generatingSample")
              : selectedVoice
                ? t("pass3_9.voices.hearVoiceNamed", {
                    voice: selectedVoice.label
                  })
                : t("pass3_9.voices.hearVoice")}
          </EditorButton>
        ) : null}
      </FlexRow>
      {sample?.error && sampleErrorContext ? (
        <AlertBanner
          severity="error"
          action={<ReportBugButton context={sampleErrorContext} />}
        >
          {sample.error}
        </AlertBanner>
      ) : null}
      {readOnly && paceNote ? (
        <Caption color="secondary" role="status">
          {paceNote}
        </Caption>
      ) : null}
      {sample?.assetId ? (
        <AudioPlayback
          key={playRequest}
          locator={`asset://${sample.assetId}`}
          label={t("pass3_9.voices.voiceSample", {
            voice: selectedVoice?.label ?? t("pass3_9.voices.voice")
          })}
          autoPlay={playRequest > 0}
        />
      ) : null}
    </FlexColumn>
  );
};

export interface VoicesStepProps {
  scriptId: string;
  /** A view-mode tab: the voices show and existing samples play, nothing changes. */
  readOnly?: boolean;
}

const VoicesStepInternal: React.FC<VoicesStepProps> = ({
  scriptId,
  readOnly = false
}) => {
  const { t } = useTranslation();
  const script = useScriptStore((state) => state.scripts[scriptId]);
  const setup = useScriptSetup(scriptId);
  const setSetup = useScriptStore((state) => state.setSetup);
  const { voices, loading, error, retry, noProvider } = useSetupVoices();

  const setLanguage = useCallback(
    (value: string) => setSetup(scriptId, { language: value }),
    [scriptId, setSetup]
  );
  const setPace = useCallback(
    (value: string) => setSetup(scriptId, { pace: value as ScriptPace }),
    [scriptId, setSetup]
  );

  const cast = script?.cast ?? [];
  const pace = setup?.pace ?? "normal";
  const speed = paceSpeed(pace);
  const language = setup?.language ?? "English";

  return (
    <FlexColumn
      gap={GAP.spacious}
      sx={{ width: "100%", maxWidth: REVIEW_CONTENT_WIDTH }}
    >
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          {t("i18n-next115.scriptVoices.heading")}
        </Text>
        <Text size="normal" color="secondary">
          {t("i18n-next115.scriptVoices.description")}
        </Text>
      </FlexColumn>

      <FlexColumn
        gap={GAP.tight}
        component="section"
        aria-label={t("pass3_9.voices.readSettings")}
      >
        {/* Each control says what it reaches. Pace was reaching nothing at
            all, and language belongs to the writer, not to the speech call
            this step's button makes (F12). */}
        <FlexRow gap={GAP.comfortable} wrap align="flex-start">
          <SelectField
            label={t("pass3_9.voices.language")}
            value={language}
            options={LANGUAGES.map(({ value, key }) => ({
              value,
              label: t(key)
            }))}
            disabled={readOnly}
            onChange={setLanguage}
            description={t("pass3_9.voices.languageDescription")}
          />
          <SelectField
            label={t("pass3_9.voices.pace")}
            value={pace}
            options={PACES.map(({ value, key }) => ({ value, label: t(key) }))}
            disabled={readOnly}
            onChange={setPace}
            description={t("pass3_9.voices.paceDescription")}
          />
        </FlexRow>
      </FlexColumn>

      {cast.length === 0 ? (
        <Caption color="secondary" component="p">
          {t("i18n-next118.scriptVoices.noCast")}
        </Caption>
      ) : null}

      {loading && voices.length === 0 ? (
        <Caption color="secondary" component="p">
          {t("i18n-next115.scriptVoices.loading")}
        </Caption>
      ) : null}

      {error ? (
        <AlertBanner
          severity="error"
          action={
            <EditorButton variant="text" size="small" onClick={retry}>
              {t("i18n-next118.scriptVoices.tryAgain")}
            </EditorButton>
          }
        >
          {t("pass3_9.voices.loadError", { error })}
        </AlertBanner>
      ) : null}

      {noProvider ? (
        <AlertBanner
          severity="info"
          action={
            <EditorButton
              variant="text"
              size="small"
              onClick={() => openProviderOnboarding()}
            >
              {t("i18n-next118.scriptVoices.connectProvider")}
            </EditorButton>
          }
        >
          {t("pass3_9.voices.noProviderVoice")}
        </AlertBanner>
      ) : null}

      <FlexColumn gap={GAP.comfortable}>
        {cast.map((speaker) => (
          <SpeakerVoiceRow
            key={speaker.id}
            scriptId={scriptId}
            speaker={speaker}
            line={firstLineOf(script?.sections ?? [], speaker.id)}
            voices={voices}
            pace={pace}
            speed={speed}
            readOnly={readOnly}
          />
        ))}
      </FlexColumn>

      {/* Once for the step, not once per speaker: every card's link opened
          the same provider settings. */}
      {readOnly || noProvider ? null : (
        <FlexRow gap={GAP.normal} align="center" wrap>
          <Caption color="secondary">
            {t("pass3_9.voices.missingVoice")}
          </Caption>
          <EditorButton
            variant="text"
            size="small"
            onClick={() => openProviderOnboarding()}
          >
            {t("pass3_9.voices.addProvider")}
          </EditorButton>
        </FlexRow>
      )}
    </FlexColumn>
  );
};

export const VoicesStep = memo(VoicesStepInternal);
VoicesStep.displayName = "ScriptVoicesStep";

export default VoicesStep;
