/** @jsxImportSource @emotion/react */
import { useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import PersonAddIcon from "@mui/icons-material/PersonAddAlt";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  FlexColumn,
  FlexRow,
  Text,
  Caption,
  Chip,
  SelectField,
  TextInput,
  EditorButton,
  ToolbarIconButton,
  Divider,
  EmptyState,
  SPACING,
  BORDER_RADIUS,
  getSpacingPx
} from "../ui_primitives";
import TTSModelSelect from "../properties/TTSModelSelect";
import type { TTSModelValue } from "../../stores/ApiTypes";
import { useInStudio } from "../../studio/StudioContext";
import { STUDIO_VOICE } from "../../studio/curatedModels";
import {
  useScriptStore,
  type ScriptSpeaker,
  type VoiceBinding
} from "../../stores/script/ScriptStore";
import { useEntities } from "../../serverState/useEntities";
import ImageRefPreview from "../node/ImageRefPreview";

interface ScriptCastPanelProps {
  scriptId: string;
  cast: ScriptSpeaker[];
  readOnly: boolean;
}

let speakerCounter = 0;
const newSpeakerId = (): string =>
  `spk_${Date.now().toString(36)}_${(speakerCounter++).toString(36)}`;

/** VoiceBinding → the TTSModelValue shape the picker consumes. */
const voiceToModelValue = (voice: VoiceBinding | null): TTSModelValue => ({
  type: "tts_model",
  id: voice?.model ?? "",
  provider: voice?.provider ?? "empty",
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
  const theme = useTheme();
  const updateSpeaker = useScriptStore((s) => s.updateSpeaker);
  const removeSpeaker = useScriptStore((s) => s.removeSpeaker);
  const { data: entities } = useEntities();

  const onVoiceChange = useCallback(
    (value: TTSModelValue) =>
      updateSpeaker(scriptId, speaker.id, {
        voice: modelValueToVoice(value)
      }),
    [updateSpeaker, scriptId, speaker.id]
  );

  const onEntityChange = useCallback(
    (value: string) =>
      updateSpeaker(scriptId, speaker.id, {
        entityId: value ? value : null
      }),
    [updateSpeaker, scriptId, speaker.id]
  );

  const linkedEntity = speaker.entityId
    ? entities?.find((e) => e.id === speaker.entityId) ?? null
    : null;
  const isDangling =
    !!speaker.entityId && !!entities && !linkedEntity;
  const entityOptions = [
    { value: "", label: "No entity" },
    ...(entities ?? []).map((e) => ({
      value: e.id,
      label: `${e.name} · ${e.kind}`
    }))
  ];

  return (
    <FlexColumn gap={SPACING.xs} fullWidth>
      <FlexRow align="center" gap={SPACING.sm} fullWidth>
        <span
          aria-hidden
          style={{
            width: getSpacingPx(SPACING.lg),
            height: getSpacingPx(SPACING.lg),
            borderRadius: BORDER_RADIUS.circle,
            backgroundColor: speaker.color ?? "action.disabled",
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
      {!readOnly ? (
        <FlexColumn gap={SPACING.xs} fullWidth>
          <SelectField
            label="Linked entity"
            value={speaker.entityId ?? ""}
            onChange={onEntityChange}
            options={entityOptions}
            size="small"
            hideLabel
          />
          {linkedEntity && (
            <FlexRow align="center" gap={SPACING.xs}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: BORDER_RADIUS.xs,
                  overflow: "hidden",
                  flexShrink: 0,
                  background: theme.vars.palette.background.default
                }}
              >
                <ImageRefPreview
                  value={linkedEntity.reference_images?.[0]}
                />
              </div>
              <Chip
                label={`${linkedEntity.name} · ${linkedEntity.kind}`}
                size="small"
                compact
              />
            </FlexRow>
          )}
          {isDangling && (
            <Caption color="warning">
              Linked entity not found — it was removed. Pick another or clear it.
            </Caption>
          )}
        </FlexColumn>
      ) : linkedEntity ? (
        <FlexRow align="center" gap={SPACING.xs}>
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: BORDER_RADIUS.xs,
              overflow: "hidden",
              flexShrink: 0,
              background: theme.vars.palette.background.default
            }}
          >
            <ImageRefPreview value={linkedEntity.reference_images?.[0]} />
          </div>
          <Chip
            label={`${linkedEntity.name} · ${linkedEntity.kind}`}
            size="small"
            compact
          />
        </FlexRow>
      ) : speaker.entityId ? (
        <Caption color="warning">Linked entity missing</Caption>
      ) : null}
    </FlexColumn>
  );
};

const ScriptCastPanel = ({
  scriptId,
  cast,
  readOnly
}: ScriptCastPanelProps) => {
  const theme = useTheme();
  const addSpeaker = useScriptStore((s) => s.addSpeaker);
  // Studio hands a new speaker a curated voice, so the beginner shell never
  // starts a cast on an unset picker.
  const inStudio = useInStudio();

  const onAdd = useCallback(() => {
    addSpeaker(scriptId, {
      id: newSpeakerId(),
      name: `Speaker ${cast.length + 1}`,
      color: [
        theme.vars.palette.primary.main,
        theme.vars.palette.secondary.main,
        theme.vars.palette.success.main,
        theme.vars.palette.warning.main,
        theme.vars.palette.info.main,
        theme.vars.palette.error.main
      ][cast.length % 6],
      voice:
        inStudio && STUDIO_VOICE
          ? modelValueToVoice(STUDIO_VOICE)
          : null
    });
  }, [addSpeaker, scriptId, cast.length, theme, inStudio]);

  return (
    <FlexColumn
      gap={SPACING.md}
      sx={{
        width: "100%",
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
          description="Add a speaker, pick a voice, then click a line's name to assign it."
          actionText={readOnly ? undefined : "Add speaker"}
          onAction={readOnly ? undefined : onAdd}
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
