/** @jsxImportSource @emotion/react */
import { useCallback, useState } from "react";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import PersonAddIcon from "@mui/icons-material/PersonAddAlt";
import {
  Box,
  EditorMenu,
  MenuItemPrimitive,
  TruncatedText,
  Tooltip,
  CONTROL,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
  MOTION,
  StatusDot
} from "../ui_primitives";
import {
  useScriptStore,
  type ScriptSpeaker,
  type VoiceBinding
} from "../../stores/script/ScriptStore";
import type { TTSModelValue } from "../../stores/ApiTypes";
import { useInStudio } from "../../studio/StudioContext";
import { STUDIO_VOICE } from "../../studio/curatedModels";
import ScriptSpeakerAvatar from "./ScriptSpeakerAvatar";

/** Width of the screenplay speaker gutter: avatar plus the speaker's name. */
export const SPEAKER_GUTTER = 148;

let speakerCounter = 0;
const newSpeakerId = (): string =>
  `spk_${Date.now().toString(36)}_${(speakerCounter++).toString(36)}`;

const voiceFromStudio = (value: TTSModelValue): VoiceBinding => ({
  provider: String(value.provider),
  model: value.id,
  voice: value.selected_voice || value.voices?.[0] || ""
});

const SpeakerDot = ({ color }: { color: string | undefined }) => (
  <StatusDot size="medium" sx={{ bgcolor: color ?? "action.disabled" }} />
);

export interface ScriptSpeakerPickerProps {
  scriptId: string;
  lineId: string;
  speaker: ScriptSpeaker | null;
  cast: readonly ScriptSpeaker[];
  readOnly: boolean;
  mobile: boolean;
  /**
   * Writes the line's speaker. Without it the pick is patched onto the line
   * directly, as the editor does. The setup review passes the agent handler's
   * setter, so its edits and `ui_script_set_speaker` stay one path.
   */
  onAssign?: (speakerId: string | null) => void;
  /**
   * A colour dot and the name in sentence case, instead of the portrait and
   * the uppercase screenplay name. The setup review uses it, where the words
   * matter more than who reads them.
   */
  quiet?: boolean;
}

/**
 * The line's speaker as the screenplay prints it: the speaker's portrait and
 * name in the speaker's colour, opening a menu of the cast. `quiet` reduces it
 * to a dot and the name.
 */
export const ScriptSpeakerPicker = ({
  scriptId,
  lineId,
  speaker,
  cast,
  readOnly,
  mobile,
  onAssign,
  quiet = false
}: ScriptSpeakerPickerProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const inStudio = useInStudio();
  const patchLine = useScriptStore((s) => s.patchLine);
  const addSpeaker = useScriptStore((s) => s.addSpeaker);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const close = useCallback(() => setAnchor(null), []);

  const assign = useCallback(
    (speakerId: string | null) => {
      if (onAssign) {
        onAssign(speakerId);
      } else {
        patchLine(scriptId, lineId, { speakerId });
      }
      close();
    },
    [onAssign, patchLine, scriptId, lineId, close]
  );

  const addAndAssign = useCallback(() => {
    const id = newSpeakerId();
    const palette = [
      theme.vars.palette.primary.main,
      theme.vars.palette.secondary.main,
      theme.vars.palette.success.main,
      theme.vars.palette.warning.main,
      theme.vars.palette.info.main,
      theme.vars.palette.error.main
    ];
    addSpeaker(scriptId, {
      id,
      name: t("i18n-next62.scriptSpeakerPicker.speakerDefaultName", {
        count: cast.length + 1
      }),
      color: palette[cast.length % palette.length],
      voice: inStudio && STUDIO_VOICE ? voiceFromStudio(STUDIO_VOICE) : null
    });
    if (onAssign) {
      onAssign(id);
    } else {
      patchLine(scriptId, lineId, { speakerId: id });
    }
    close();
  }, [
    onAssign,
    addSpeaker,
    patchLine,
    scriptId,
    lineId,
    cast.length,
    theme,
    inStudio,
    t,
    close
  ]);

  const label = speaker?.name ?? t("i18n-next62.scriptSpeakerPicker.noSpeaker");
  const canOpen = !readOnly;

  return (
    <>
      <Tooltip
        title={
          readOnly
            ? label
            : cast.length
            ? t("i18n-next62.scriptSpeakerPicker.changeSpeaker")
            : t("i18n-next62.scriptSpeakerPicker.addSpeaker")
        }
      >
        <Box
          component="button"
          type="button"
          disabled={!canOpen}
          aria-haspopup="menu"
          aria-expanded={!!anchor}
          aria-label={
            speaker
              ? t("i18n-next62.scriptSpeakerPicker.changeSpeakerAria", {
                  name: speaker.name
                })
              : t("i18n-next62.scriptSpeakerPicker.assignSpeaker")
          }
          onClick={
            canOpen
              ? (e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)
              : undefined
          }
          sx={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: quiet ? SPACING.sm : SPACING.md,
            width: mobile || quiet ? "auto" : SPEAKER_GUTTER,
            maxWidth: "100%",
            minWidth: 0,
            padding: SPACING.none,
            border: "none",
            background: "none",
            textAlign: "left",
            cursor: canOpen ? "pointer" : "default",
            ...TYPOGRAPHY.sans.label,
            ...(quiet
              ? {
                  color: speaker ? "text.secondary" : "text.disabled",
                  "&:hover:not(:disabled)": { color: "text.primary" }
                }
              : {
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: speaker
                    ? speaker.color ?? "text.primary"
                    : "text.disabled",
                  "&:hover:not(:disabled)": { filter: "brightness(1.2)" }
                }),
            transition: MOTION.fast,
            "&:focus-visible": {
              outline: "2px solid",
              outlineColor: "primary.main",
              outlineOffset: "2px",
              borderRadius: BORDER_RADIUS.sm
            }
          }}
        >
          {quiet ? (
            <SpeakerDot color={speaker?.color} />
          ) : (
            <ScriptSpeakerAvatar
              speaker={speaker}
              size={mobile ? CONTROL.height.xs : CONTROL.height.md}
            />
          )}
          <TruncatedText
            component="span"
            sx={{
              display: "block",
              flex: 1,
              minWidth: 0,
              margin: SPACING.none,
              font: "inherit",
              letterSpacing: "inherit",
              textTransform: "inherit",
              color: "inherit"
            }}
          >
            {label}
          </TruncatedText>
        </Box>
      </Tooltip>
      <EditorMenu
        anchorEl={anchor}
        open={!!anchor}
        onClose={close}
        anchorOrigin={{ vertical: "bottom", horizontal: mobile ? "left" : "right" }}
        transformOrigin={{ vertical: "top", horizontal: mobile ? "left" : "right" }}
      >
        <MenuItemPrimitive
          label={t("i18n-next62.scriptSpeakerPicker.noSpeaker")}
          selected={!speaker}
          onClick={() => assign(null)}
        />
        {cast.map((candidate) => (
          <MenuItemPrimitive
            key={candidate.id}
            label={candidate.name}
            selected={candidate.id === speaker?.id}
            icon={<SpeakerDot color={candidate.color} />}
            onClick={() => assign(candidate.id)}
          />
        ))}
        {!readOnly && (
          <MenuItemPrimitive
            dividerBefore
            label={t("i18n-next62.scriptSpeakerPicker.addSpeaker")}
            icon={<PersonAddIcon fontSize="small" />}
            onClick={addAndAssign}
          />
        )}
      </EditorMenu>
    </>
  );
};

export default ScriptSpeakerPicker;
