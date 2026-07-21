/** @jsxImportSource @emotion/react */
import { useCallback, useState } from "react";
import type {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  MouseEvent
} from "react";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import HistoryIcon from "@mui/icons-material/History";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import TheaterComedyIcon from "@mui/icons-material/TheaterComedy";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import {
  FlexColumn,
  FlexRow,
  Box,
  Text,
  TextInput,
  Tooltip,
  ToolbarIconButton,
  LoadingSpinner,
  Popover,
  SPACING,
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
import { useAssetStore } from "../../stores/AssetStore";
import { getAssetUrl } from "../../utils/assetHelpers";
import ScriptTakeGallery from "./ScriptTakeGallery";

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
  onKeyNav?: (lineId: string, nav: LineKeyNav) => void;
  onDragStart?: (e: DragEvent<HTMLElement>) => void;
  onDragEnd?: (e: DragEvent<HTMLElement>) => void;
  onDragOver?: (e: DragEvent<HTMLElement>) => void;
  onDrop?: (e: DragEvent<HTMLElement>) => void;
}

/** Width of the screenplay speaker gutter. */
export const GUTTER = 104;

/** Width of the hover-revealed drag handle rail left of the gutter. */
export const DRAG_RAIL = 20;

/**
 * Left offset (px) of the line's text column: drag rail + gutter and the two
 * 16px flex gaps around them. Add-line buttons and insert affordances align to
 * this so they sit under the dialogue, not the speaker names.
 */
export const TEXT_INSET = DRAG_RAIL + 16 + GUTTER + 16;

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

const ScriptLineRow = ({
  scriptId,
  line,
  cast,
  highlighted,
  readOnly,
  isDragging = false,
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

  const cycleSpeaker = useCallback(() => {
    if (cast.length === 0) return;
    const idx = cast.findIndex((s) => s.id === line.speakerId);
    // Cycle: none → first → … → last → none.
    const next = idx < 0 ? cast[0] : (cast[idx + 1] ?? null);
    patchLine(scriptId, line.id, { speakerId: next?.id ?? null });
  }, [cast, line.speakerId, patchLine, scriptId, line.id]);

  const onVoice = useCallback(async () => {
    setVoiceError(null);
    try {
      await voiceLine(scriptId, line.id);
    } catch (error) {
      setVoiceError((error as Error).message ?? "Voicing failed");
    }
  }, [scriptId, line.id]);

  const playCurrent = useCallback(async () => {
    if (typeof Audio === "undefined") return;
    const take = line.takes.find((t) => t.id === line.currentTakeId);
    if (!take) return;
    try {
      const asset = await useAssetStore.getState().get(take.assetId);
      const url = getAssetUrl(asset);
      if (url) void new Audio(url).play().catch(() => undefined);
    } catch {
      // Asset unavailable.
    }
  }, [line.takes, line.currentTakeId]);

  const hasCurrentTake = !!line.takes.find((t) => t.id === line.currentTakeId);
  // A direction is opt-in: an empty one stays out of the reading flow until
  // the author asks for it, so untouched lines sit as tight as printed dialogue.
  const hasDirection = !!line.direction?.trim();
  const showDirection = hasDirection || directionOpen;

  const toggleDirection = useCallback(() => {
    setDirectionOpen((open) => {
      if (open || hasDirection) {
        patchLine(scriptId, line.id, { direction: "" });
        return false;
      }
      return true;
    });
  }, [hasDirection, patchLine, scriptId, line.id]);

  const draggable = !readOnly && !!onDragStart;

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLElement>) => {
      // Some browsers only initiate a drag once dataTransfer carries a payload.
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", line.id);
      onDragStart?.(e);
    },
    [onDragStart, line.id]
  );

  return (
    <FlexRow
      align="flex-start"
      gap={SPACING.md}
      fullWidth
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

      <Tooltip title={cast.length ? "Change speaker" : "Add a speaker first"}>
        <Box
          component="button"
          type="button"
          disabled={readOnly || !cast.length}
          onClick={readOnly ? undefined : cycleSpeaker}
          sx={{
            flexShrink: 0,
            width: GUTTER,
            marginTop: SPACING.sm,
            padding: SPACING.none,
            border: "none",
            background: "none",
            textAlign: "right",
            cursor: readOnly || !cast.length ? "default" : "pointer",
            ...TYPOGRAPHY.sans.label,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: speaker ? speaker.color ?? "text.primary" : "text.disabled",
            transition: MOTION.fast,
            "&:hover:not(:disabled)": { color: "primary.main" }
          }}
        >
          {speaker?.name ?? "no speaker"}
        </Box>
      </Tooltip>

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
        {voiceError && (
          <Text size="smaller" color="error" sx={{ paddingLeft: SPACING.sm }}>
            {voiceError}
          </Text>
        )}
      </FlexColumn>

      <FlexRow
        align="center"
        justify="flex-end"
        gap={SPACING.xs}
        sx={{ flexShrink: 0, marginTop: SPACING.xs }}
      >
        {status === "stale" ? (
          <Text size="smaller" color="warning">
            Stale
          </Text>
        ) : (
          <Tooltip title={status === "voiced" ? "Voiced" : "Not voiced yet"}>
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                backgroundColor:
                  status === "voiced" ? "success.main" : "action.disabled"
              }}
            />
          </Tooltip>
        )}
        <FlexRow
          className="script-line-actions"
          gap={SPACING.none}
          align="center"
          sx={voicing ? { opacity: "1 !important" } : undefined}
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
          {!readOnly && (
            <ToolbarIconButton
              tooltip="Duplicate line"
              onClick={() => duplicateLine(scriptId, line.id)}
              icon={<ContentCopyIcon fontSize="small" />}
            />
          )}
          {!readOnly && (
            <ToolbarIconButton
              tooltip="Delete line"
              onClick={() => removeLine(scriptId, line.id)}
              icon={<DeleteOutlineIcon fontSize="small" />}
            />
          )}
        </FlexRow>
      </FlexRow>

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
    </FlexRow>
  );
};

export default ScriptLineRow;
