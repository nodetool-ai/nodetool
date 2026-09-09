/**
 * Step 3 of the script flow — the voices (PRD § 9.3).
 *
 * One row of TTS model and voice dropdowns per speaker in the cast. The voice
 * can be heard after it is chosen: pressing `Hear this voice` reads that
 * speaker's own first line, so the choice is made on the words the creator
 * wrote rather than on a stock sample. Each sample is one TTS call, made when
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

import React, { memo, useCallback, useMemo } from "react";
import type { ScriptPace } from "@nodetool-ai/protocol/api-schemas/scripts.js";

import { formatUsd } from "@nodetool-ai/model-pricing";

import {
  AlertBanner,
  AudioPlayback,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  SelectField,
  Text
} from "../../ui_primitives";
import { getScriptAgentHandler } from "../../../components/script/scriptAgentBridge";
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
import { getModelUnitPrice } from "../../../utils/modelUnitPricing";
import type { BugReportContext } from "../../../utils/bugReportBundle";
import ReportBugButton from "../../support/ReportBugButton";
import { useSetupVoices } from "./useSetupVoices";
import type { SetupVoice } from "./useSetupVoices";

/** The languages the flow offers to write and read in. */
const LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Italian",
  "Japanese",
  "Korean",
  "Mandarin",
  "Hindi"
];

const PACES: ReadonlyArray<{ value: ScriptPace; label: string }> = [
  { value: "slow", label: "Slow" },
  { value: "normal", label: "Normal" },
  { value: "fast", label: "Fast" }
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
  characters: number
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
  return low === high
    ? `about ${formatUsd(low)} each`
    : `about ${formatUsd(low)}–${formatUsd(high)} each`;
};

interface SetupVoiceModel {
  id: string;
  label: string;
  provider: string;
  model: string;
  voices: readonly SetupVoice[];
}

const voiceModelId = (voice: Pick<SetupVoice, "provider" | "model">): string =>
  `${voice.provider}:${voice.model}`;

const groupVoiceModels = (voices: readonly SetupVoice[]): SetupVoiceModel[] => {
  const grouped = new Map<string, SetupVoiceModel>();
  for (const voice of voices) {
    const id = voiceModelId(voice);
    const current = grouped.get(id);
    if (current) {
      current.voices = [...current.voices, voice];
      continue;
    }
    grouped.set(id, {
      id,
      label: `${voice.modelLabel} (${voice.provider})`,
      provider: voice.provider,
      model: voice.model,
      voices: [voice]
    });
  }
  return [...grouped.values()];
};

interface SpeakerVoiceRowProps {
  scriptId: string;
  speaker: ScriptSpeaker;
  line: string;
  voices: readonly SetupVoice[];
  pace: ScriptPace;
  speed: number | undefined;
}

const SpeakerVoiceRow: React.FC<SpeakerVoiceRowProps> = ({
  scriptId,
  speaker,
  line,
  voices,
  pace,
  speed
}) => {
  const { sampleFor, play, spokenText } = useVoiceSamples(speed);
  const models = useMemo(() => groupVoiceModels(voices), [voices]);
  const selectedVoice = voices.find(
    (voice) =>
      speaker.voice?.model === voice.model &&
      speaker.voice.voice === voice.voice &&
      speaker.voice.provider === voice.provider
  );
  const selectedModel = models.find(
    (model) =>
      speaker.voice?.model === model.model &&
      speaker.voice.provider === model.provider
  );
  const modelOptions = useMemo(
    () => [
      { value: "", label: "Choose a model" },
      ...models.map((model) => ({ value: model.id, label: model.label }))
    ],
    [models]
  );
  const voiceOptions = useMemo(
    () => [
      { value: "", label: "Choose a voice" },
      ...(selectedModel?.voices.map((voice) => ({
        value: voice.id,
        label: voice.label
      })) ?? [])
    ],
    [selectedModel]
  );

  const bindVoice = useCallback(
    (voice: SetupVoice) => {
      getScriptAgentHandler(scriptId).setSpeakerVoice(speaker.id, {
        provider: voice.provider,
        model: voice.model,
        voice: voice.voice
      });
    },
    [scriptId, speaker.id]
  );

  const selectModel = useCallback(
    (id: string) => {
      const picked = models.find((model) => model.id === id)?.voices[0];
      if (!picked) return;
      bindVoice(picked);
    },
    [bindVoice, models]
  );

  const selectVoice = useCallback(
    (id: string) => {
      const picked = selectedModel?.voices.find((voice) => voice.id === id);
      if (!picked) return;
      bindVoice(picked);
    },
    [bindVoice, selectedModel]
  );

  const spoken = spokenText(line);
  const hasLine = spoken !== "";

  const sample = selectedVoice ? sampleFor(selectedVoice, line) : null;
  const cost =
    hasLine && selectedVoice
      ? auditionCost([selectedVoice], spoken.length)
      : null;
  const paceNote =
    selectedVoice &&
    speed !== undefined &&
    !providerAppliesPace(selectedVoice.provider)
      ? `This provider reads at its own pace, not ${pace}.`
      : null;
  const sampleErrorContext = useMemo<BugReportContext | null>(
    () =>
      sample?.error
        ? {
            source: "manual",
            summary: `Voice sample failed for ${speaker.name}`,
            errorText: sample.error,
            provider: selectedVoice?.provider,
            model: selectedVoice?.model
          }
        : null,
    [sample?.error, selectedVoice?.model, selectedVoice?.provider, speaker.name]
  );

  return (
    <FlexColumn gap={GAP.normal} component="section">
      <FlexColumn gap={GAP.micro}>
        <Text size="normal" component="h3">
          {speaker.name}
        </Text>
        <Caption color="secondary" component="p">
          {hasLine
            ? `Samples read: “${spoken}”`
            : "This speaker has no lines yet, so there is nothing to sample."}
        </Caption>
        {/* Every audition is a speech call, so the step says so before one is
            pressed rather than after it is billed (F23). */}
        {hasLine ? (
          <Caption color="secondary" component="p">
            {`Each sample is one speech call of ${spoken.length} characters${cost === null ? "" : ` · ${cost}`}.`}
          </Caption>
        ) : null}
      </FlexColumn>
      <FlexRow gap={GAP.comfortable} wrap align="flex-end">
        <SelectField
          label={`TTS model for ${speaker.name}`}
          value={selectedModel?.id ?? ""}
          options={modelOptions}
          onChange={selectModel}
        />
        <SelectField
          label={`Voice for ${speaker.name}`}
          value={selectedVoice?.id ?? ""}
          options={voiceOptions}
          onChange={selectVoice}
          disabled={!selectedModel}
        />
        {hasLine ? (
          <EditorButton
            variant="outlined"
            disabled={!selectedVoice || sample?.pending}
            aria-label={
              selectedVoice
                ? `Hear ${selectedVoice.label} for ${speaker.name}`
                : `Hear voice for ${speaker.name}`
            }
            onClick={() => {
              if (selectedVoice) void play(selectedVoice, line);
            }}
          >
            {sample?.pending
              ? "Generating sample"
              : selectedVoice
                ? `Hear ${selectedVoice.label}`
                : "Hear voice"}
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
      {paceNote ? (
        <Caption color="secondary" role="status">
          {paceNote}
        </Caption>
      ) : null}
      {sample?.assetId ? (
        <AudioPlayback
          locator={`asset://${sample.assetId}`}
          label={`${selectedVoice?.label ?? "Voice"} sample`}
        />
      ) : null}
      <EditorButton
        variant="text"
        size="small"
        onClick={() => openProviderOnboarding()}
      >
        Add a voice provider
      </EditorButton>
    </FlexColumn>
  );
};

export interface VoicesStepProps {
  scriptId: string;
}

const VoicesStepInternal: React.FC<VoicesStepProps> = ({ scriptId }) => {
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
    <FlexColumn gap={GAP.spacious}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Choose the voices
        </Text>
        <Text size="normal" color="secondary">
          Hear each one read your own words before you pick it.
        </Text>
      </FlexColumn>

      <FlexColumn
        gap={GAP.tight}
        component="section"
        aria-label="Read settings"
      >
        <FlexRow gap={GAP.comfortable} wrap align="flex-end">
          <SelectField
            label="Language"
            value={language}
            options={LANGUAGES.map((name) => ({ value: name, label: name }))}
            onChange={setLanguage}
          />
          <SelectField
            label="Pace"
            value={pace}
            options={PACES}
            onChange={setPace}
          />
        </FlexRow>
        {/* Each control says what it reaches. Pace was reaching nothing at
            all, and language belongs to the writer, not to the speech call
            this step's button makes (F12). */}
        <Caption color="secondary" component="p">
          Pace is sent with every sample and every take. Language is what the
          script is written in: change it, then rewrite on the Format step to
          apply it.
        </Caption>
      </FlexColumn>

      {cast.length === 0 ? (
        <Caption color="secondary" component="p">
          The script has no cast yet. Write it first and every speaker will show
          up here.
        </Caption>
      ) : null}

      {loading && voices.length === 0 ? (
        <Caption color="secondary" component="p">
          Looking up the voices your providers offer…
        </Caption>
      ) : null}

      {error ? (
        <AlertBanner
          severity="error"
          action={
            <EditorButton variant="text" size="small" onClick={retry}>
              Try again
            </EditorButton>
          }
        >
          {`The voice list could not be loaded. ${error}`}
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
              Connect a provider
            </EditorButton>
          }
        >
          No connected provider offers a voice yet.
        </AlertBanner>
      ) : null}

      {cast.map((speaker) => (
        <SpeakerVoiceRow
          key={speaker.id}
          scriptId={scriptId}
          speaker={speaker}
          line={firstLineOf(script?.sections ?? [], speaker.id)}
          voices={voices}
          pace={pace}
          speed={speed}
        />
      ))}
    </FlexColumn>
  );
};

export const VoicesStep = memo(VoicesStepInternal);
VoicesStep.displayName = "ScriptVoicesStep";

export default VoicesStep;
