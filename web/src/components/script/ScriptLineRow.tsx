/** @jsxImportSource @emotion/react */
import { memo, useCallback, useState } from "react";
import type {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  MouseEvent
} from "react";
import { useTheme } from "@mui/material/styles";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import HistoryIcon from "@mui/icons-material/History";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import TheaterComedyIcon from "@mui/icons-material/TheaterComedy";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PersonAddIcon from "@mui/icons-material/PersonAddAlt";
import {
  FlexColumn,
  FlexRow,
  Box,
  Text,
  Caption,
  TextInput,
  Tooltip,
  ToolbarIconButton,
  LoadingSpinner,
  Popover,
  EditorMenu,
  MenuItemPrimitive,
  TruncatedText,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
  MOTION,
  getSpacingPx
} from "../ui_primitives";
import {
  useScriptStore,
  useLineVoicing,
  lineStatus,
  effectiveVoice,
  type ScriptLine,
  type ScriptSpeaker,
  type VoiceBinding
} from "../../stores/script/ScriptStore";
import type { TTSModelValue } from "../../stores/ApiTypes";
import { voiceLine } from "../../stores/script/scriptVoicing";
import { playTake } from "../../stores/script/playTake";
import { getErrorMessage } from "../../utils/errorHandling";
import { formatDuration } from "../../utils/formatUtils";
import { useInStudio } from "../../studio/StudioContext";
import { STUDIO_VOICE } from "../../studio/curatedModels";
import ScriptTakeGallery from "./ScriptTakeGallery";
import ScriptShotChip from "./ScriptShotChip";
import type { ScriptLineShotLink } from "../../hooks/script/useScriptShotLinks";

/**
 * A keyboard intent bubbled up from a line's text field. The pane owns the
 * section/ordering, so it turns these into store mutations and cross-line
 * focus moves:
 * - `split`  — Enter: keep `before` on this line, carry `after` to a new line
 *   below (inheriting the speaker) and focus it.
 * - `delete-empty` — Backspace on an empty, unvoiced line: remove it and focus
 *   the previous line's end.
 * - `focus` — Arrow up/down at the text boundary: move focus to the sibling.
 */
export type LineKeyNav =
  | { type: "split"; before: string; after: string }
  | { type: "delete-empty" }
  | { type: "focus"; dir: -1 | 1 };

interface ScriptLineRowProps {
  scriptId: string;
  line: ScriptLine;
  cast: ScriptSpeaker[];
  highlighted: boolean;
  readOnly: boolean;
  /** True while this row is the one being dragged (dimmed as it lifts out). */
  isDragging?: boolean;
  /**
   * Narrow layout: the wide screenplay gutter and hover-revealed actions/drag
   * rail don't work on touch, so the row stacks vertically with the speaker tag
   * above the text and the action bar always visible.
   */
  mobile?: boolean;
  /**
   * The storyboard shot covering this line, when the script links a board.
   * Its keyframe rides in the gutter as a click-through to the board.
   */
  shotLink?: ScriptLineShotLink | null;
  /** True when the linked board carries no shot for this line (design section 4). */
  orphaned?: boolean;
  onKeyNav?: (lineId: string, nav: LineKeyNav) => void;
  onDragStart?: (e: DragEvent<HTMLElement>) => void;
  onDragEnd?: (e: DragEvent<HTMLElement>) => void;
  onDragOver?: (e: DragEvent<HTMLElement>) => void;
  onDrop?: (e: DragEvent<HTMLElement>) => void;
}

/** Width of the screenplay speaker gutter. */
const GUTTER = 104;

/** Width of the hover-revealed drag handle rail left of the gutter. */
const DRAG_RAIL = 20;

/**
 * Left offset (px) of the line's text column: drag rail + gutter and the two
 * SPACING.xl flex gaps around them. Add-line buttons and insert affordances
 * align to this so they sit under the dialogue, not the speaker names.
 */
export const TEXT_INSET = DRAG_RAIL + SPACING.xl * 4 + GUTTER + SPACING.xl * 4;

const PAUSE_AFTER_MS = [
  { ms: 0, label: "No pause after" },
  { ms: 500, label: "0.5s pause" },
  { ms: 1000, label: "1s pause" },
  { ms: 2000, label: "2s pause" }
] as const;

let speakerCounter = 0;
const newSpeakerId = (): string =>
  `spk_${Date.now().toString(36)}_${(speakerCounter++).toString(36)}`;

const voiceFromStudio = (value: TTSModelValue): VoiceBinding => ({
  provider: String(value.provider),
  model: value.id,
  voice: value.selected_voice || value.voices?.[0] || ""
});

/**
 * Borderless field styling: the script reads as a document, so the input
 * chrome only materializes on hover/focus.
 */
const quietField = {
  "& .MuiOutlinedInput-root": {
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
  }
} as const;

const SpeakerDot = ({ color }: { color: string | undefined }) => (
  <Box
    aria-hidden
    sx={{
      width: getSpacingPx(SPACING.md),
      height: getSpacingPx(SPACING.md),
      borderRadius: BORDER_RADIUS.circle,
      backgroundColor: color ?? "action.disabled",
      flexShrink: 0
    }}
  />
);

const SpeakerPicker = ({
  scriptId,
  lineId,
  speaker,
  cast,
  readOnly,
  mobile
}: {
  scriptId: string;
  lineId: string;
  speaker: ScriptSpeaker | null;
  cast: ScriptSpeaker[];
  readOnly: boolean;
  mobile: boolean;
}) => {
  const theme = useTheme();
  const inStudio = useInStudio();
  const patchLine = useScriptStore((s) => s.patchLine);
  const addSpeaker = useScriptStore((s) => s.addSpeaker);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const close = useCallback(() => setAnchor(null), []);

  const assign = useCallback(
    (speakerId: string | null) => {
      patchLine(scriptId, lineId, { speakerId });
      close();
    },
    [patchLine, scriptId, lineId, close]
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
      name: `Speaker ${cast.length + 1}`,
      color: palette[cast.length % palette.length],
      voice: inStudio && STUDIO_VOICE ? voiceFromStudio(STUDIO_VOICE) : null
    });
    patchLine(scriptId, lineId, { speakerId: id });
    close();
  }, [
    addSpeaker,
    patchLine,
    scriptId,
    lineId,
    cast.length,
    theme,
    inStudio,
    close
  ]);

  const label = speaker?.name ?? "no speaker";
  const canOpen = !readOnly;

  return (
    <>
      <Tooltip
        title={
          readOnly
            ? label
            : cast.length
              ? "Change speaker"
              : "Add a speaker"
        }
      >
        <Box
          component="span"
          sx={{
            flexShrink: 0,
            display: "inline-flex",
            width: mobile ? "auto" : GUTTER,
            marginTop: mobile ? SPACING.none : SPACING.sm
          }}
        >
          <Box
            component="button"
            type="button"
            disabled={!canOpen}
            aria-haspopup="menu"
            aria-expanded={!!anchor}
            aria-label={
              speaker ? `${speaker.name}, change speaker` : "Assign speaker"
            }
            onClick={
              canOpen
                ? (e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)
                : undefined
            }
            sx={{
              width: "100%",
              minWidth: 0,
              padding: SPACING.none,
              border: "none",
              background: "none",
              textAlign: mobile ? "left" : "right",
              cursor: canOpen ? "pointer" : "default",
              ...TYPOGRAPHY.sans.label,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: speaker ? speaker.color ?? "text.primary" : "text.disabled",
              transition: MOTION.fast,
              "&:hover:not(:disabled)": { color: "primary.main" }
            }}
          >
            <TruncatedText
              component="span"
              sx={{
                display: "block",
                width: "100%",
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
          compact
          label="No speaker"
          selected={!speaker}
          onClick={() => assign(null)}
        />
        {cast.map((candidate) => (
          <MenuItemPrimitive
            key={candidate.id}
            compact
            label={candidate.name}
            selected={candidate.id === speaker?.id}
            icon={<SpeakerDot color={candidate.color} />}
            onClick={() => assign(candidate.id)}
          />
        ))}
        {!readOnly && (
          <MenuItemPrimitive
            compact
            dividerBefore
            label="Add speaker"
            icon={<PersonAddIcon fontSize="small" />}
            onClick={addAndAssign}
          />
        )}
      </EditorMenu>
    </>
  );
};

const ScriptLineRow = ({
  scriptId,
  line,
  cast,
  highlighted,
  readOnly,
  isDragging = false,
  mobile = false,
  shotLink = null,
  orphaned = false,
  onKeyNav,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop
}: ScriptLineRowProps) => {
  const patchLine = useScriptStore((s) => s.patchLine);
  const removeLine = useScriptStore((s) => s.removeLine);
  const duplicateLine = useScriptStore((s) => s.duplicateLine);
  const voicing = useLineVoicing(line.id);
  const [galleryAnchor, setGalleryAnchor] = useState<HTMLElement | null>(null);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [directionOpen, setDirectionOpen] = useState(false);

  const voice = effectiveVoice(line, cast);
  const status = lineStatus(line, voice);
  const speaker = cast.find((s) => s.id === line.speakerId) ?? null;

  const onTextChange = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      patchLine(scriptId, line.id, { text: e.target.value }),
    [patchLine, scriptId, line.id]
  );

  // Text-field keyboard shortcuts (ElevenLabs-Studio feel). The row reads the
  // caret from the textarea and bubbles an intent; the pane applies it.
  const onTextKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (readOnly || !onKeyNav) return;
      const el = e.target as HTMLTextAreaElement;
      // Enter splits the line at the caret; Shift+Enter keeps a soft newline.
      // Skip while an IME composition is open so committing a candidate with
      // Enter doesn't create a line.
      if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        const caret = el.selectionStart ?? el.value.length;
        onKeyNav(line.id, {
          type: "split",
          before: el.value.slice(0, caret),
          after: el.value.slice(caret)
        });
        return;
      }
      const atStart = el.selectionStart === 0 && el.selectionEnd === 0;
      const atEnd =
        el.selectionStart === el.value.length &&
        el.selectionEnd === el.value.length;
      if (e.key === "Backspace" && el.value === "" && line.takes.length === 0) {
        e.preventDefault();
        onKeyNav(line.id, { type: "delete-empty" });
      } else if (e.key === "ArrowUp" && atStart) {
        onKeyNav(line.id, { type: "focus", dir: -1 });
      } else if (e.key === "ArrowDown" && atEnd) {
        onKeyNav(line.id, { type: "focus", dir: 1 });
      }
    },
    [readOnly, onKeyNav, line.id, line.takes.length]
  );

  const onDirectionChange = useCallback(
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      patchLine(scriptId, line.id, { direction: e.target.value }),
    [patchLine, scriptId, line.id]
  );

  const onVoice = useCallback(async () => {
    setVoiceError(null);
    try {
      await voiceLine(scriptId, line.id);
    } catch (error) {
      setVoiceError(getErrorMessage(error, "Voicing failed"));
    }
  }, [scriptId, line.id]);

  const playCurrent = useCallback(async () => {
    const take = line.takes.find((t) => t.id === line.currentTakeId);
    if (take) {
      await playTake(take.assetId);
    }
  }, [line.takes, line.currentTakeId]);

  const hasCurrentTake = !!line.takes.find((t) => t.id === line.currentTakeId);
  // A direction is opt-in: an empty one stays out of the reading flow until
  // the author asks for it, so untouched lines sit as tight as printed dialogue.
  const hasDirection = !!line.direction?.trim();
  const showDirection = hasDirection || directionOpen;
  const pauseMs = line.pauseAfterMs ?? 0;
  const pauseLabel = pauseMs > 0 ? formatDuration(pauseMs) : null;

  const toggleDirection = useCallback(() => {
    setDirectionOpen((open) => {
      if (open || hasDirection) {
        patchLine(scriptId, line.id, { direction: "" });
        return false;
      }
      return true;
    });
  }, [hasDirection, patchLine, scriptId, line.id]);

  const closeMore = useCallback(() => setMoreAnchor(null), []);

  const setPause = useCallback(
    (ms: number) => {
      patchLine(scriptId, line.id, { pauseAfterMs: ms || undefined });
      closeMore();
    },
    [patchLine, scriptId, line.id, closeMore]
  );

  const draggable = !readOnly && !mobile && !!onDragStart;

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLElement>) => {
      // Some browsers only initiate a drag once dataTransfer carries a payload.
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", line.id);
      onDragStart?.(e);
    },
    [onDragStart, line.id]
  );

  const speakerButton = (
    <SpeakerPicker
      scriptId={scriptId}
      lineId={line.id}
      speaker={speaker}
      cast={cast}
      readOnly={readOnly}
      mobile={mobile}
    />
  );

  // Gutter link block: the covering shot's still (click through to the board),
  // or the badge saying the linked board covers this line with no shot at all.
  const shotGutter =
    shotLink || orphaned ? (
      <FlexRow
        align="center"
        justify={mobile ? "flex-start" : "flex-end"}
        gap={SPACING.xs}
        sx={{ flexShrink: 0, width: mobile ? "auto" : GUTTER }}
      >
        {shotLink && (
          <ScriptShotChip shot={shotLink.shot} onOpen={shotLink.open} />
        )}
        {orphaned && (
          <Tooltip title="No storyboard shot covers this line">
            <Text size="smaller" color="warning">
              No shot
            </Text>
          </Tooltip>
        )}
      </FlexRow>
    ) : null;

  const gutter = shotGutter ? (
    <FlexColumn
      gap={SPACING.micro}
      align={mobile ? "flex-start" : "flex-end"}
      sx={{ flexShrink: 0, width: mobile ? "auto" : GUTTER }}
    >
      {speakerButton}
      {shotGutter}
    </FlexColumn>
  ) : (
    speakerButton
  );

  const textColumn = (
    <FlexColumn gap={SPACING.none} style={{ flex: 1, minWidth: 0 }}>
      <TextInput
        value={line.text}
        onChange={onTextChange}
        onKeyDown={onTextKeyDown}
        placeholder="Write a line…"
        multiline
        hideLabel
        label="Line text"
        compact
        fullWidth
        disabled={readOnly}
        inputProps={{ "data-script-line": line.id }}
        sx={{
          ...quietField,
          "& .MuiOutlinedInput-input": { ...TYPOGRAPHY.sans.body }
        }}
      />
      {showDirection && (
        <TextInput
          autoFocus={!hasDirection}
          value={line.direction ?? ""}
          onChange={onDirectionChange}
          placeholder="Direction (e.g. whispering, tired)…"
          hideLabel
          label="Direction"
          compact
          fullWidth
          disabled={readOnly}
          sx={{
            ...quietField,
            "& .MuiOutlinedInput-input": {
              fontStyle: "italic",
              color: "text.secondary"
            }
          }}
        />
      )}
      {pauseLabel && (
        <Caption color="secondary" sx={{ paddingLeft: SPACING.sm }}>
          {pauseLabel} pause
        </Caption>
      )}
      {voiceError && (
        <Text size="smaller" color="error" sx={{ paddingLeft: SPACING.sm }}>
          {voiceError}
        </Text>
      )}
    </FlexColumn>
  );

  const statusIndicator =
    status === "stale" ? (
      <Text size="smaller" color="warning">
        Stale
      </Text>
    ) : (
      <Tooltip title={status === "voiced" ? "Voiced" : "Not voiced yet"}>
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: BORDER_RADIUS.circle,
            backgroundColor:
              status === "voiced" ? "success.main" : "action.disabled"
          }}
        />
      </Tooltip>
    );

  const moreMenu = !readOnly && (
    <>
      <ToolbarIconButton
        tooltip="More line actions"
        ariaLabel="More line actions"
        onClick={(e: MouseEvent<HTMLElement>) => setMoreAnchor(e.currentTarget)}
        icon={<MoreVertIcon fontSize="small" />}
      />
      <EditorMenu
        anchorEl={moreAnchor}
        open={!!moreAnchor}
        onClose={closeMore}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        {PAUSE_AFTER_MS.map((option) => (
          <MenuItemPrimitive
            key={option.ms}
            compact
            label={option.label}
            selected={pauseMs === option.ms}
            onClick={() => setPause(option.ms)}
          />
        ))}
        <MenuItemPrimitive
          compact
          dividerBefore
          label="Duplicate line"
          icon={<ContentCopyIcon fontSize="small" />}
          onClick={() => {
            duplicateLine(scriptId, line.id);
            closeMore();
          }}
        />
        <MenuItemPrimitive
          compact
          color="error"
          label="Delete line"
          icon={<DeleteOutlineIcon fontSize="small" />}
          onClick={() => {
            removeLine(scriptId, line.id);
            closeMore();
          }}
        />
      </EditorMenu>
    </>
  );

  const actions = (
    <FlexRow
      className={mobile ? undefined : "script-line-actions"}
      gap={SPACING.none}
      align="center"
      wrap={mobile}
      sx={mobile || voicing ? { opacity: "1 !important" } : undefined}
    >
      {voicing ? (
        <LoadingSpinner size={20} />
      ) : (
        <Tooltip
          title={
            voice
              ? status === "stale"
                ? "Re-voice line"
                : "Voice line"
              : "Assign a voice to this speaker first"
          }
        >
          <span>
            <ToolbarIconButton
              tooltip=""
              ariaLabel="Voice line"
              disabled={readOnly || !voice}
              onClick={() => void onVoice()}
              icon={<GraphicEqIcon fontSize="small" />}
            />
          </span>
        </Tooltip>
      )}
      {!readOnly && (
        <ToolbarIconButton
          tooltip={showDirection ? "Remove direction" : "Add direction"}
          onClick={toggleDirection}
          icon={<TheaterComedyIcon fontSize="small" />}
          sx={showDirection ? { color: "primary.main" } : undefined}
        />
      )}
      <ToolbarIconButton
        tooltip="Play current take"
        disabled={!hasCurrentTake}
        onClick={() => void playCurrent()}
        icon={<PlayArrowIcon fontSize="small" />}
      />
      <ToolbarIconButton
        tooltip={`Takes (${line.takes.length})`}
        onClick={(e: MouseEvent<HTMLElement>) =>
          setGalleryAnchor(e.currentTarget)
        }
        icon={<HistoryIcon fontSize="small" />}
      />
      {moreMenu}
    </FlexRow>
  );

  const gallery = (
    <Popover
      open={!!galleryAnchor}
      anchorEl={galleryAnchor}
      onClose={() => setGalleryAnchor(null)}
      anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      transformOrigin={{ vertical: "top", horizontal: "right" }}
    >
      <ScriptTakeGallery
        scriptId={scriptId}
        lineId={line.id}
        takes={line.takes}
        currentTakeId={line.currentTakeId ?? null}
      />
    </Popover>
  );

  if (mobile) {
    // Stacked layout: speaker tag + always-visible actions on top, dialogue
    // below. No hover reveal, no drag rail — none of which work on touch.
    return (
      <FlexColumn
        gap={SPACING.xs}
        fullWidth
        data-line-id={line.id}
        sx={{
          position: "relative",
          padding: SPACING.sm,
          borderRadius: BORDER_RADIUS.sm,
          backgroundColor: highlighted ? "action.selected" : "transparent",
          transition: MOTION.background
        }}
      >
        <FlexRow align="center" gap={SPACING.sm} fullWidth>
          {gutter}
          <Box sx={{ flex: 1 }} />
          {statusIndicator}
          {actions}
        </FlexRow>
        {textColumn}
        {gallery}
      </FlexColumn>
    );
  }

  return (
    <FlexRow
      align="flex-start"
      gap={SPACING.xl}
      fullWidth
      data-line-id={line.id}
      onDragOver={onDragOver}
      onDrop={onDrop}
      sx={{
        position: "relative",
        padding: SPACING.sm,
        paddingLeft: SPACING.none,
        borderRadius: BORDER_RADIUS.sm,
        backgroundColor: highlighted ? "action.selected" : "transparent",
        opacity: isDragging ? 0.4 : 1,
        transition: MOTION.background,
        "&:hover": {
          backgroundColor: highlighted ? "action.selected" : "action.hover"
        },
        "& .script-line-actions": {
          opacity: 0,
          transition: MOTION.opacity
        },
        "&:hover .script-line-actions, &:focus-within .script-line-actions": {
          opacity: 1
        },
        "& .script-line-drag": {
          opacity: 0,
          transition: MOTION.opacity
        },
        "&:hover .script-line-drag": { opacity: 1 }
      }}
    >
      {draggable ? (
        <Tooltip title="Drag to reorder">
          <Box
            className="script-line-drag"
            draggable
            onDragStart={handleDragStart}
            onDragEnd={onDragEnd}
            aria-label="Drag to reorder line"
            sx={{
              flexShrink: 0,
              width: DRAG_RAIL,
              display: "flex",
              justifyContent: "center",
              alignItems: "flex-start",
              marginTop: SPACING.sm,
              color: "text.disabled",
              cursor: "grab",
              "&:active": { cursor: "grabbing" },
              "&:hover": { color: "text.secondary" }
            }}
          >
            <DragIndicatorIcon fontSize="small" />
          </Box>
        </Tooltip>
      ) : (
        <Box sx={{ flexShrink: 0, width: DRAG_RAIL }} />
      )}

      {gutter}

      {textColumn}

      <FlexRow
        align="center"
        justify="flex-end"
        gap={SPACING.xs}
        sx={{ flexShrink: 0, marginTop: SPACING.xs }}
      >
        {statusIndicator}
        {actions}
      </FlexRow>

      {gallery}
    </FlexRow>
  );
};

/** Only the edited line's `line` changes identity (see `mapLine` in
 *  ScriptStore), so the rest of the document skips the row body entirely. */
export default memo(ScriptLineRow);
