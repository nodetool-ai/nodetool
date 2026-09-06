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
 */

import React, { memo, useCallback } from "react";
import type { ScriptPace } from "@nodetool-ai/protocol/api-schemas/scripts.js";

import {
  Caption,
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

interface SpeakerVoiceRowProps {
  scriptId: string;
  speaker: ScriptSpeaker;
  line: string;
  voices: readonly SetupVoice[];
}

const SpeakerVoiceRow: React.FC<SpeakerVoiceRowProps> = ({
  scriptId,
  speaker,
  line,
  voices
}) => {
  const { sampleFor, play } = useVoiceSamples();

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

  const tiles: PresetTile[] = voices.map((voice) => {
    const sample = sampleFor(voice, line);
    const tile: PresetTile = {
      id: voice.id,
      title: voice.label,
      onPlaySample: () => play(voice, line),
      samplePending: sample.pending
    };
    if (sample.assetId !== undefined) {
      tile.audio = `asset://${sample.assetId}`;
    }
    return tile;
  });

  return (
    <FlexColumn gap={GAP.normal} component="section">
      <FlexColumn gap={GAP.micro}>
        <Text size="normal" component="h3">
          {speaker.name}
        </Text>
        <Caption color="secondary" component="p">
          {line.trim() === ""
            ? "This speaker has no lines yet, so there is nothing to sample."
            : `Samples read: “${line}”`}
        </Caption>
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
  const { voices, loading } = useSetupVoices();

  const setLanguage = useCallback(
    (value: string) => setSetup(scriptId, { language: value }),
    [scriptId, setSetup]
  );
  const setPace = useCallback(
    (value: string) => setSetup(scriptId, { pace: value as ScriptPace }),
    [scriptId, setSetup]
  );

  const cast = script?.cast ?? [];

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

      <FlexRow gap={GAP.comfortable} wrap align="flex-end">
        <SelectField
          label="Language"
          value={setup?.language ?? "English"}
          options={LANGUAGES.map((name) => ({ value: name, label: name }))}
          onChange={setLanguage}
        />
        <SelectField
          label="Pace"
          value={setup?.pace ?? "normal"}
          options={PACES}
          onChange={setPace}
        />
      </FlexRow>

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

      {cast.map((speaker) => (
        <SpeakerVoiceRow
          key={speaker.id}
          scriptId={scriptId}
          speaker={speaker}
          line={firstLineOf(script?.sections ?? [], speaker.id)}
          voices={voices}
        />
      ))}
    </FlexColumn>
  );
};

export const VoicesStep = memo(VoicesStepInternal);
VoicesStep.displayName = "ScriptVoicesStep";

export default VoicesStep;
