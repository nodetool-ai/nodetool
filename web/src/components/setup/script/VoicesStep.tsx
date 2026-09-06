/**
 * Step 3 of the script flow — the voices (PRD § 9.3).
 *
 * One row of voice tiles per speaker in the cast. A tile is heard before it is
 * chosen: pressing `Hear this voice` reads that speaker's own first line in
 * that voice, so the choice is made on the words the creator wrote rather than
 * on a stock sample. Each sample is one TTS call, made when it is asked for and
 * kept for the session (`useVoiceSamples`) — a grid of a dozen voices over four
 * speakers would otherwise bill a dozen calls per render.
 *
 * Picking a tile binds the voice through the same handler
 * `ui_script_set_speaker_voice` calls, so the headless path and this one write
 * the same thing (§ 9.6).
 *
 * Language and pace sit here because § 9.3 puts them here, and each now says
 * what it reaches: pace is sent with every speech call the flow makes, and a
 * voice whose provider ignores it says so; language is what the writer wrote in,
 * so changing it after the script exists is a rewrite, and the step says that
 * rather than pretending the button applies it (F12).
 */

import React, { memo, useCallback } from "react";
import type { ScriptPace } from "@nodetool-ai/protocol/api-schemas/scripts.js";

import { formatUsd } from "@nodetool-ai/model-pricing";

import {
  AlertBanner,
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
import { PresetTileGrid } from "../PresetTileGrid";
import type { PresetTile } from "../PresetTileGrid";
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
  sections: ReadonlyArray<{ lines: ReadonlyArray<{ speakerId?: string | null; text: string }> }>,
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

  const selectedId = voices.find(
    (voice) =>
      speaker.voice?.model === voice.model &&
      speaker.voice.voice === voice.voice &&
      speaker.voice.provider === voice.provider
  )?.id;

  const select = useCallback(
    (id: string) => {
      const picked = voices.find((voice) => voice.id === id);
      if (!picked) return;
      getScriptAgentHandler(scriptId).setSpeakerVoice(speaker.id, {
        provider: picked.provider,
        model: picked.model,
        voice: picked.voice
      });
    },
    [scriptId, speaker.id, voices]
  );

  const spoken = spokenText(line);
  const hasLine = spoken !== "";

  const tiles: PresetTile[] = voices.map((voice) => {
    const sample = sampleFor(voice, line);
    // One line under the title, in the order it matters: what went wrong, then
    // what this voice will not do with the pace that was asked for.
    const note =
      sample.error ??
      (speed !== undefined && !providerAppliesPace(voice.provider)
        ? `Reads at its own pace, not ${pace}`
        : undefined);
    const tile: PresetTile = { id: voice.id, title: voice.label };
    // A speaker with nothing to say has nothing to audition, so the tile
    // offers no audition rather than a button that returns nothing (F13).
    if (hasLine) {
      tile.onPlaySample = () => play(voice, line);
      tile.samplePending = sample.pending;
    }
    if (note !== undefined) {
      tile.description = note;
    }
    if (hasLine && sample.assetId !== undefined) {
      tile.audio = `asset://${sample.assetId}`;
    }
    return tile;
  });

  const cost = hasLine ? auditionCost(voices, spoken.length) : null;

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
      <PresetTileGrid
        label={`Voices for ${speaker.name}`}
        presets={tiles}
        selectedId={selectedId ?? null}
        onSelect={select}
        onAddOwn={() => openProviderOnboarding()}
        addOwnLabel="Add a voice provider"
        aspectRatio="4/1"
        minColumnWidth={200}
        reservePreview
      />
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

      <FlexColumn gap={GAP.tight} component="section" aria-label="Read settings">
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
