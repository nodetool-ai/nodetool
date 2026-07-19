/** @jsxImportSource @emotion/react */
import { useCallback } from "react";
import PersonAddIcon from "@mui/icons-material/PersonAddAlt";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  FlexColumn,
  FlexRow,
  Text,
  TextInput,
  EditorButton,
  ToolbarIconButton,
  Divider,
  EmptyState,
  SPACING
} from "../ui_primitives";
import TTSModelSelect from "../properties/TTSModelSelect";
import type { TTSModelValue } from "../../stores/ApiTypes";
import {
  useScriptStore,
  type ScriptSpeaker,
  type VoiceBinding
} from "../../stores/script/ScriptStore";

interface ScriptCastPanelProps {
  scriptId: string;
  cast: ScriptSpeaker[];
  readOnly: boolean;
}

const SPEAKER_COLORS = [
  "#6ea8fe",
  "#f7a072",
  "#a0e7a0",
  "#e79ad0",
  "#f2d17c",
  "#8fd6d6"
];

let speakerCounter = 0;
const newSpeakerId = (): string =>
  `spk_${Date.now().toString(36)}_${(speakerCounter++).toString(36)}`;

/** VoiceBinding → the TTSModelValue shape the picker consumes. */
const voiceToModelValue = (voice: VoiceBinding | null): TTSModelValue => ({
  type: "tts_model",
  id: voice?.model ?? "",
  provider: (voice?.provider ?? "empty") as TTSModelValue["provider"],
  name: voice?.model ?? "",
  voices: voice?.voice ? [voice.voice] : [],
  selected_voice: voice?.voice ?? ""
});

const modelValueToVoice = (value: TTSModelValue): VoiceBinding => ({
  provider: String(value.provider),
  model: value.id,
  voice: value.selected_voice || value.voices?.[0] || ""
});

const SpeakerRow = ({
  scriptId,
  speaker,
  readOnly
}: {
  scriptId: string;
  speaker: ScriptSpeaker;
  readOnly: boolean;
}) => {
  const updateSpeaker = useScriptStore((s) => s.updateSpeaker);
  const removeSpeaker = useScriptStore((s) => s.removeSpeaker);

  const onVoiceChange = useCallback(
    (value: TTSModelValue) =>
      updateSpeaker(scriptId, speaker.id, {
        voice: modelValueToVoice(value)
      }),
    [updateSpeaker, scriptId, speaker.id]
  );

  return (
    <FlexColumn gap={SPACING.xs} fullWidth>
      <FlexRow align="center" gap={SPACING.sm} fullWidth>
        <span
          aria-hidden
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            backgroundColor: speaker.color ?? "#888",
            flexShrink: 0
          }}
        />
        <TextInput
          value={speaker.name}
          onChange={(e) =>
            updateSpeaker(scriptId, speaker.id, { name: e.target.value })
          }
          hideLabel
          label="Speaker name"
          compact
          fullWidth
          disabled={readOnly}
        />
        {!readOnly && (
          <ToolbarIconButton
            tooltip="Remove speaker"
            onClick={() => removeSpeaker(scriptId, speaker.id)}
            icon={<DeleteOutlineIcon fontSize="small" />}
          />
        )}
      </FlexRow>
      {!readOnly && (
        <TTSModelSelect
          value={voiceToModelValue(speaker.voice ?? null)}
          onChange={onVoiceChange}
        />
      )}
      {readOnly && speaker.voice && (
        <Text size="smaller" color="secondary">
          {speaker.voice.model} · {speaker.voice.voice}
        </Text>
      )}
    </FlexColumn>
  );
};

const ScriptCastPanel = ({
  scriptId,
  cast,
  readOnly
}: ScriptCastPanelProps) => {
  const addSpeaker = useScriptStore((s) => s.addSpeaker);

  const onAdd = useCallback(() => {
    addSpeaker(scriptId, {
      id: newSpeakerId(),
      name: `Speaker ${cast.length + 1}`,
      color: SPEAKER_COLORS[cast.length % SPEAKER_COLORS.length],
      voice: null
    });
  }, [addSpeaker, scriptId, cast.length]);

  return (
    <FlexColumn
      gap={SPACING.md}
      sx={{
        width: 300,
        flexShrink: 0,
        borderLeft: "1px solid",
        borderColor: "divider",
        padding: SPACING.md,
        height: "100%",
        overflowY: "auto"
      }}
    >
      <FlexRow align="center" justify="space-between" fullWidth>
        <Text size="normal" weight={600}>
          Cast
        </Text>
        {!readOnly && (
          <EditorButton
            size="small"
            variant="outlined"
            startIcon={<PersonAddIcon fontSize="small" />}
            onClick={onAdd}
          >
            Add
          </EditorButton>
        )}
      </FlexRow>
      <Divider />
      {cast.length === 0 ? (
        <EmptyState
          title="No speakers"
          description="Add a speaker and assign a voice to start voicing lines."
        />
      ) : (
        cast.map((speaker) => (
          <SpeakerRow
            key={speaker.id}
            scriptId={scriptId}
            speaker={speaker}
            readOnly={readOnly}
          />
        ))
      )}
    </FlexColumn>
  );
};

export default ScriptCastPanel;
