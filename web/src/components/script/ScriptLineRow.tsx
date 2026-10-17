/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo, useState } from "react";
import type {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  MouseEvent
} from "react";
import MicNoneIcon from "@mui/icons-material/MicNone";
import CheckIcon from "@mui/icons-material/Check";
import RefreshIcon from "@mui/icons-material/Refresh";
import HistoryIcon from "@mui/icons-material/History";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import TheaterComedyIcon from "@mui/icons-material/TheaterComedy";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import ErrorBanner from "../support/ErrorBanner";
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
  StatusPill,
  EditorButton,
  CONTROL,
  SHADOW,
  Z_INDEX,
  SPACING,
  SPACING_PX,
  BORDER_RADIUS,
  TYPOGRAPHY,
  MOTION
} from "../ui_primitives";
import {
  useScriptStore,
  useLineVoicing,
  lineStatus,
  effectiveVoice,
  type ScriptLine,
  type ScriptSpeaker
} from "../../stores/script/ScriptStore";
import { voiceLine } from "../../stores/script/scriptVoicing";
import { playTake } from "../../stores/script/playTake";
import { getErrorMessage } from "../../utils/errorHandling";
import { formatDuration } from "../../utils/formatUtils";
import ScriptTakeGallery from "./ScriptTakeGallery";
import { takeWorkflowMedia } from "./scriptWorkflowMedia";
import { SendToWorkflowButton } from "../workflows/SendToWorkflowMenu";
import ScriptShotChip from "./ScriptShotChip";
import { ScriptSpeakerPicker, SPEAKER_GUTTER } from "./ScriptSpeakerPicker";
import ScriptTakeWaveform from "./ScriptTakeWaveform";
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

/** Width of the screenplay speaker gutter: avatar plus the speaker's name. */
const GUTTER = SPEAKER_GUTTER;

/** Width of the hover-revealed drag handle rail left of the gutter. */
const DRAG_RAIL = 20;

/** Width of the take column: status, voice button and waveform. */
const TAKE_COLUMN = 264;

/** Column gap of the row grid, in px. */
const COLUMN_GAP = SPACING_PX.xl;

/**
 * Below this row width the take column drops under the dialogue, so the text
 * keeps a readable measure beside two docks.
 */
const STACK_BELOW = 800;

/** Below this row width the speaker sits above the dialogue as well. */
const NARROW_BELOW = 560;

/**
 * Left offset (px) of the line's text column: drag rail + gutter and the
 * column gaps around them. Add-line buttons and insert affordances align to
 * this so they sit under the dialogue, not the speaker names.
 */
export const TEXT_INSET = DRAG_RAIL + COLUMN_GAP + GUTTER + COLUMN_GAP;

const PAUSE_AFTER_MS = [
  { ms: 0, label: "No pause after" },
  { ms: 500, label: "0.5s pause" },
  { ms: 1000, label: "1s pause" },
  { ms: 2000, label: "2s pause" }
] as const;

/**
 * Borderless field styling: the script reads as a document, so the input
 * chrome only materializes on hover/focus.
 */
const quietField = {
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
  }
} as const;

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

  const currentTake = line.takes.find((t) => t.id === line.currentTakeId);
  const hasCurrentTake = !!currentTake;
  const currentTakeMedia = useMemo(
    () => (currentTake ? [takeWorkflowMedia(currentTake)] : []),
    [currentTake]
  );
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
    <ScriptSpeakerPicker
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
        gap={SPACING.xs}
        sx={{
          flexShrink: 0,
          width: mobile ? "auto" : GUTTER,
          // Under the name, past the avatar.
          paddingLeft: mobile
            ? SPACING.none
            : `${CONTROL.height.md + SPACING_PX.md}px`
        }}
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
      gap={SPACING.xs}
      align="flex-start"
      sx={{ flexShrink: 0, width: mobile ? "auto" : GUTTER }}
    >
      {speakerButton}
      {shotGutter}
    </FlexColumn>
  ) : (
    speakerButton
  );

  const directionField = showDirection && (
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
          ...TYPOGRAPHY.sans.label,
          fontStyle: "italic",
          color: "text.secondary"
        }
      }}
    />
  );

  const textColumn = (
    <FlexColumn gap={SPACING.none} style={{ flex: 1, minWidth: 0 }}>
      {directionField}
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
          "& .MuiOutlinedInput-input": {
            ...TYPOGRAPHY.sans.body,
            color: "text.primary",
            letterSpacing: "-0.005em"
          },
          // A read-only script still reads as a script, not as greyed fields.
          "& .MuiOutlinedInput-input.Mui-disabled": {
            WebkitTextFillColor: "inherit"
          }
        }}
      />
      {pauseLabel && (
        <Caption color="secondary" sx={{ paddingLeft: SPACING.sm }}>
          {pauseLabel} pause
        </Caption>
      )}
      {voiceError && (
        <ErrorBanner
          report={{
            source: "job-failure",
            summary: "Voicing a script line failed",
            errorText: voiceError
          }}
        >
          {voiceError}
        </ErrorBanner>
      )}
    </FlexColumn>
  );

  const takeNumber = currentTake
    ? line.takes.findIndex((t) => t.id === currentTake.id) + 1
    : 0;

  const statusIndicator =
    status === "stale" ? (
      <Tooltip title="The text or voice changed since this take">
        <StatusPill tone="warning" sx={pillSx}>
          <RefreshIcon fontSize="inherit" />
          Stale
        </StatusPill>
      </Tooltip>
    ) : status === "voiced" ? (
      <StatusPill tone="done" sx={pillSx}>
        <CheckIcon fontSize="inherit" />
        Take {takeNumber}
      </StatusPill>
    ) : (
      <StatusPill tone="neutral" sx={pillSx}>
        Draft
      </StatusPill>
    );

  const duration = currentTake ? (
    <Box
      component="span"
      sx={{
        ...TYPOGRAPHY.mono.caption,
        color: "text.secondary",
        whiteSpace: "nowrap"
      }}
    >
      {(currentTake.durationMs / 1000).toFixed(1)} s
    </Box>
  ) : null;

  const voiceButton = voicing ? (
    <FlexRow align="center" sx={{ paddingX: SPACING.md }}>
      <LoadingSpinner size="small" />
    </FlexRow>
  ) : (
    !readOnly && (
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
          <EditorButton
            size="small"
            variant="outlined"
            aria-label="Voice line"
            disabled={!voice}
            onClick={() => void onVoice()}
            startIcon={<MicNoneIcon />}
            sx={{
              borderRadius: BORDER_RADIUS.pill,
              whiteSpace: "nowrap",
              ...(status === "stale"
                ? {
                    color: "warning.main",
                    borderColor:
                      "rgba(var(--palette-warning-mainChannel) / 0.5)",
                    backgroundColor:
                      "rgba(var(--palette-warning-mainChannel) / 0.12)"
                  }
                : { color: "text.secondary", borderColor: "divider" })
            }}
          >
            Voice
          </EditorButton>
        </span>
      </Tooltip>
    )
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
            label={option.label}
            selected={pauseMs === option.ms}
            onClick={() => setPause(option.ms)}
          />
        ))}
        <MenuItemPrimitive
          dividerBefore
          label="Duplicate line"
          icon={<ContentCopyIcon fontSize="small" />}
          onClick={() => {
            duplicateLine(scriptId, line.id);
            closeMore();
          }}
        />
        <MenuItemPrimitive
          color="error"
          dividerBefore
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

  // Secondary actions stay out of the reading flow until the row is hovered
  // or focused; the voice button and the take status are always on screen.
  const actions = (
    <FlexRow
      gap={SPACING.none}
      align="center"
      wrap={mobile}
    >
      {!readOnly && (
        <ToolbarIconButton
          tooltip={showDirection ? "Delete direction" : "Add direction"}
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
      {hasCurrentTake && (
        <SendToWorkflowButton
          items={currentTakeMedia}
          tooltip="Send current take to a workflow"
        />
      )}
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

  const speakerColor = speaker?.color ?? "var(--palette-text-secondary)";

  const takeColumn = (
    <FlexColumn
      className="script-line-take"
      gap={SPACING.sm}
      sx={{ minWidth: 0 }}
    >
      <FlexRow align="center" gap={SPACING.md} fullWidth>
        {statusIndicator}
        {duration}
        <Box sx={{ flex: 1 }} />
        {voiceButton}
      </FlexRow>
      <ScriptTakeWaveform
        take={currentTake}
        color={speakerColor}
        stale={status === "stale"}
        onPlay={hasCurrentTake ? () => void playCurrent() : undefined}
      />
    </FlexColumn>
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

  // The active line (playing, or jumped to) is marked by a bar in the
  // speaker's colour down its left edge, over a faint lift.
  const activeSx = highlighted
    ? {
        backgroundColor: "action.selected",
        boxShadow: `inset 3px 0 0 ${speakerColor}`
      }
    : undefined;

  if (mobile) {
    // Stacked layout: speaker tag + always-visible actions on top, dialogue
    // and take below. No hover reveal, no drag rail — none of which work on
    // touch.
    return (
      <FlexColumn
        gap={SPACING.sm}
        fullWidth
        data-line-id={line.id}
        sx={{
          position: "relative",
          paddingX: SPACING.md,
          paddingY: SPACING.lg,
          transition: MOTION.background,
          ...activeSx
        }}
      >
        <FlexRow align="center" gap={SPACING.sm} fullWidth>
          {gutter}
          <Box sx={{ flex: 1 }} />
          {actions}
        </FlexRow>
        {textColumn}
        <FlexColumn gap={SPACING.sm} fullWidth>
          <FlexRow align="center" gap={SPACING.md} fullWidth>
            {statusIndicator}
            {duration}
            <Box sx={{ flex: 1 }} />
            {voiceButton}
          </FlexRow>
          <ScriptTakeWaveform
            take={currentTake}
            color={speakerColor}
            stale={status === "stale"}
            onPlay={hasCurrentTake ? () => void playCurrent() : undefined}
          />
        </FlexColumn>
        {gallery}
      </FlexColumn>
    );
  }

  return (
    <Box
      data-line-id={line.id}
      onDragOver={onDragOver}
      onDrop={onDrop}
      sx={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: `${DRAG_RAIL}px ${GUTTER}px minmax(0, 1fr) ${TAKE_COLUMN}px`,
        alignItems: "center",
        columnGap: `${COLUMN_GAP}px`,
        rowGap: SPACING.md,
        paddingY: SPACING.xl,
        paddingRight: SPACING.xl,
        opacity: isDragging ? 0.4 : 1,
        transition: `${MOTION.background}, ${MOTION.shadow}`,
        [`@container script-lines (max-width: ${STACK_BELOW}px)`]: {
          gridTemplateColumns: `${DRAG_RAIL}px ${GUTTER}px minmax(0, 1fr)`,
          alignItems: "start",
          "& .script-line-take": { gridColumn: "3 / 4" },
          "& .script-line-toolbar": { right: `${SPACING_PX.xl}px` }
        },
        [`@container script-lines (max-width: ${NARROW_BELOW}px)`]: {
          gridTemplateColumns: `${DRAG_RAIL}px minmax(0, 1fr)`,
          "& > :not(:first-of-type)": { gridColumn: "2 / 3" },
          "& .script-line-take": { gridColumn: "2 / 3" }
        },
        ...activeSx,
        "&:hover": {
          backgroundColor: highlighted ? "action.selected" : "action.hover"
        },
        // Hidden until the row is hovered or focused; a pointer can only
        // reach it through the hovered row, so it never catches a stray click.
        "& .script-line-toolbar": {
          opacity: 0,
          transition: MOTION.opacity
        },
        "&:hover .script-line-toolbar, &:focus-within .script-line-toolbar": {
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
          <FlexRow
            className="script-line-drag"
            draggable
            onDragStart={handleDragStart}
            onDragEnd={onDragEnd}
            aria-label="Drag to reorder line"
            justify="center"
            sx={{
              color: "text.disabled",
              cursor: "grab",
              "&:active": { cursor: "grabbing" },
              "&:hover": { color: "text.secondary" }
            }}
          >
            <DragIndicatorIcon fontSize="small" />
          </FlexRow>
        </Tooltip>
      ) : (
        <Box />
      )}

      {gutter}

      {textColumn}

      {takeColumn}

      {/* Secondary actions float over the dialogue's top-right corner. */}
      <Box
        className="script-line-toolbar"
        sx={{
          position: "absolute",
          top: SPACING.xs,
          right: `${TAKE_COLUMN + COLUMN_GAP + SPACING_PX.xl}px`,
          zIndex: Z_INDEX.raised,
          paddingX: SPACING.micro,
          borderRadius: BORDER_RADIUS.md,
          border: "1px solid",
          borderColor: "divider",
          backgroundColor: "background.paper",
          boxShadow: (theme) => SHADOW(theme).sm
        }}
      >
        {actions}
      </Box>

      {gallery}
    </Box>
  );
};

/** Take status pills read in the row's sans label type, icon first. */
const pillSx = {
  ...TYPOGRAPHY.sans.label,
  gap: SPACING.xs
} as const;

/** Only the edited line's `line` changes identity (see `mapLine` in
 *  ScriptStore), so the rest of the document skips the row body entirely. */
export default memo(ScriptLineRow);
