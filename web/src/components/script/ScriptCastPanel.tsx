/** @jsxImportSource @emotion/react */
import { useCallback, useState } from "react";
import { useTheme } from "@mui/material/styles";
import PersonAddIcon from "@mui/icons-material/PersonAddAlt";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import MicNoneIcon from "@mui/icons-material/MicNone";
import TuneIcon from "@mui/icons-material/Tune";
import {
  Box,
  FlexColumn,
  FlexRow,
  Caption,
  Chip,
  SelectField,
  TextInput,
  TruncatedText,
  EditorButton,
  ToolbarIconButton,
  EmptyState,
  SPACING,
  BORDER_RADIUS,
  EYEBROW,
  MOTION,
  TYPOGRAPHY
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
import { ENTITY_KIND_COLOR } from "../entities/entityKind";
import ScriptSpeakerAvatar from "./ScriptSpeakerAvatar";

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

/** Portrait size on a cast card. */
const CARD_AVATAR_PX = 52;

/** The name reads as the card's heading until it is hovered or focused. */
const quietNameField = {
  // Doubled class: TextInput's own field background sits on the same
  // selector one level down, so a single class would lose to it.
  "& .MuiOutlinedInput-root.MuiInputBase-root": {
    backgroundColor: "transparent",
    transition: MOTION.background,
    "& .MuiOutlinedInput-notchedOutline": {
      borderColor: "transparent",
      transition: MOTION.border
    },
    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "divider" },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
      borderColor: "primary.main"
    }
  },
  "& .MuiOutlinedInput-input": {
    ...TYPOGRAPHY.sans.title,
    paddingLeft: SPACING.xs
  },
  "& .MuiOutlinedInput-input.Mui-disabled": {
    WebkitTextFillColor: "inherit",
    color: "text.primary"
  }
} as const;

const SpeakerCard = ({
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
  const { data: entities } = useEntities();
  // A speaker with no voice opens on its settings: it cannot be voiced yet.
  const [expanded, setExpanded] = useState(() => !speaker.voice);

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
  const isDangling = !!speaker.entityId && !!entities && !linkedEntity;
  const entityOptions = [
    { value: "", label: "No entity" },
    ...(entities ?? []).map((e) => ({
      value: e.id,
      label: `${e.name} · ${e.kind}`
    }))
  ];
  const voiceSummary = speaker.voice
    ? speaker.voice.voice || speaker.voice.model
    : "No voice";

  return (
    <FlexColumn
      gap={SPACING.md}
      fullWidth
      sx={{
        padding: SPACING.lg,
        borderRadius: BORDER_RADIUS.lg,
        border: "1px solid",
        borderColor: expanded ? "action.selected" : "divider",
        backgroundColor: "action.hover",
        transition: MOTION.border
      }}
    >
      <FlexRow align="center" gap={SPACING.lg} fullWidth>
        <ScriptSpeakerAvatar speaker={speaker} size={CARD_AVATAR_PX} />
        <FlexColumn gap={SPACING.micro} sx={{ flex: 1, minWidth: 0 }}>
          <FlexRow align="center" gap={SPACING.xs} fullWidth>
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
              sx={quietNameField}
            />
            {linkedEntity && (
              <Chip
                label={linkedEntity.kind}
                compact
                variant="outlined"
                color={ENTITY_KIND_COLOR[linkedEntity.kind]}
                sx={{ flexShrink: 0 }}
              />
            )}
          </FlexRow>
          <FlexRow
            align="center"
            gap={SPACING.xs}
            sx={{ paddingLeft: SPACING.xs, minWidth: 0 }}
          >
            <MicNoneIcon
              sx={{
                fontSize: "var(--fontSizeNormal)",
                color: speaker.voice ? "info.main" : "text.disabled"
              }}
            />
            <TruncatedText
              title={speaker.voice?.model}
              sx={{ ...TYPOGRAPHY.sans.label, color: "text.secondary" }}
            >
              {voiceSummary}
            </TruncatedText>
          </FlexRow>
        </FlexColumn>
        {!readOnly && (
          <ToolbarIconButton
            tooltip={expanded ? "Hide voice settings" : "Voice settings"}
            ariaLabel={expanded ? "Hide voice settings" : "Voice settings"}
            onClick={() => setExpanded((open) => !open)}
            icon={<TuneIcon fontSize="small" />}
            sx={expanded ? { color: "primary.main" } : undefined}
          />
        )}
      </FlexRow>
      {readOnly && linkedEntity && (
        <Caption color="secondary">
          {linkedEntity.name} · {linkedEntity.kind}
        </Caption>
      )}
      {readOnly && !linkedEntity && speaker.entityId && (
        <Caption color="warning">Linked entity missing</Caption>
      )}
      {!readOnly && expanded && (
        <FlexColumn gap={SPACING.sm} fullWidth>
          <TTSModelSelect
            value={voiceToModelValue(speaker.voice ?? null)}
            onChange={onVoiceChange}
          />
          <SelectField
            label="Linked entity"
            value={speaker.entityId ?? ""}
            onChange={onEntityChange}
            options={entityOptions}
            size="small"
            hideLabel
          />
          {isDangling && (
            <Caption color="warning">
              Linked entity not found — it was removed. Pick another or clear it.
            </Caption>
          )}
          <FlexRow justify="flex-end">
            <EditorButton
              size="small"
              variant="text"
              color="error"
              startIcon={<DeleteOutlineIcon />}
              onClick={() => removeSpeaker(scriptId, speaker.id)}
            >
              Remove speaker
            </EditorButton>
          </FlexRow>
        </FlexColumn>
      )}
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
      gap={SPACING.lg}
      sx={{
        width: "100%",
        paddingX: SPACING.xl,
        paddingY: SPACING.xl,
        height: "100%",
        overflowY: "auto"
      }}
    >
      <FlexRow align="center" justify="space-between" fullWidth>
        <Box
          component="h3"
          sx={{ ...EYEBROW, margin: SPACING.none, color: "text.secondary" }}
        >
          Cast
        </Box>
        {!readOnly && (
          <EditorButton
            size="small"
            variant="text"
            startIcon={<PersonAddIcon />}
            onClick={onAdd}
          >
            Add
          </EditorButton>
        )}
      </FlexRow>
      {cast.length === 0 ? (
        <EmptyState
          title="No speakers"
          description="Add a speaker, pick a voice, then click a line's name to assign it."
          actionText={readOnly ? undefined : "Add speaker"}
          onAction={readOnly ? undefined : onAdd}
        />
      ) : (
        cast.map((speaker) => (
          <SpeakerCard
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
