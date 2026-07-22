/** @jsxImportSource @emotion/react */
import { useCallback, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { useTheme } from "@mui/material/styles";
import { useMediaQuery } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import MovieIcon from "@mui/icons-material/Movie";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import {
  FlexColumn,
  FlexRow,
  Box,
  Text,
  TextInput,
  EditorButton,
  ToolbarIconButton,
  UndoRedoButtons,
  EmptyState,
  AlertBanner,
  LoadingSpinner,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
  MOTION,
  Z_INDEX
} from "../ui_primitives";
import {
  useScript,
  useScriptStore,
  useScriptCanUndo,
  useScriptCanRedo,
  type ScriptSection
} from "../../stores/script/ScriptStore";
import { voiceAll } from "../../stores/script/scriptVoicing";
import { exportScriptSubtitles } from "../../stores/script/scriptSubtitles";
import { useScriptPlaythrough } from "../../hooks/script/useScriptPlaythrough";
import { useAssembleScriptTimeline } from "../../hooks/script/useAssembleScriptTimeline";
import ScriptLineRow, { TEXT_INSET, type LineKeyNav } from "./ScriptLineRow";
import ScriptSaveIndicator from "./ScriptSaveIndicator";

interface ScriptDocumentPaneProps {
  scriptId: string;
  readOnly: boolean;
}

/** A pending drop position: land the dragged line before `beforeLineId` (or at
 * the end of `sectionId` when null). */
interface DropTarget {
  sectionId: string;
  beforeLineId: string | null;
}

interface LineDnd {
  draggingLineId: string | null;
  dropTarget: DropTarget | null;
  onLineDragStart: (lineId: string) => void;
  onLineDragEnd: () => void;
  setDropTarget: (target: DropTarget | null) => void;
  onLineDrop: () => void;
}

/**
 * A hover-revealed gap between lines: a hairline with a centered "+" that
 * inserts a new line at this position. Also acts as a drop target so a line can
 * be dropped precisely between two others.
 */
const InsertLineGap = ({
  onInsert,
  onDragOver,
  onDrop,
  active,
  inset
}: {
  onInsert: () => void;
  onDragOver: (e: DragEvent<HTMLElement>) => void;
  onDrop: (e: DragEvent<HTMLElement>) => void;
  active: boolean;
  inset: number;
}) => (
  <Box
    onDragOver={onDragOver}
    onDrop={onDrop}
    sx={{
      marginLeft: `${inset}px`,
      height: 12,
      display: "flex",
      alignItems: "center",
      cursor: "pointer",
      "& .insert-line-rule": {
        opacity: active ? 1 : 0,
        transition: MOTION.opacity
      },
      "&:hover .insert-line-rule": { opacity: 1 }
    }}
  >
    <Box
      component="button"
      type="button"
      onClick={onInsert}
      aria-label="Insert line here"
      className="insert-line-rule"
      sx={{
        display: "flex",
        alignItems: "center",
        gap: SPACING.xs,
        width: "100%",
        padding: SPACING.none,
        border: "none",
        background: "none",
        cursor: "pointer",
        color: "primary.main"
      }}
    >
      <AddIcon sx={{ fontSize: 14 }} />
      <Box
        sx={{
          flex: 1,
          height: 2,
          borderRadius: BORDER_RADIUS.sm,
          backgroundColor: "primary.main"
        }}
      />
    </Box>
  </Box>
);

const SectionBlock = ({
  scriptId,
  section,
  currentLineId,
  readOnly,
  mobile,
  dnd,
  onKeyNav
}: {
  scriptId: string;
  section: ScriptSection;
  currentLineId: string | null;
  readOnly: boolean;
  mobile: boolean;
  dnd: LineDnd;
  onKeyNav: (lineId: string, nav: LineKeyNav) => void;
}) => {
  const cast = useScript(scriptId).cast;
  const setSectionTitle = useScriptStore((s) => s.setSectionTitle);
  const addLine = useScriptStore((s) => s.addLine);
  const insertLine = useScriptStore((s) => s.insertLine);
  const removeSection = useScriptStore((s) => s.removeSection);

  // On mobile the wide speaker gutter collapses, so insert affordances and
  // add-line buttons align to the left edge instead of under the dialogue.
  const inset = mobile ? 0 : TEXT_INSET;

  const isTarget = (beforeLineId: string | null): boolean =>
    dnd.dropTarget?.sectionId === section.id &&
    dnd.dropTarget.beforeLineId === beforeLineId;

  // Snap a drag hovering a row to the nearest gap (before this line, or before
  // the next one), so the active gap's rule marks where the drop will land.
  const onRowDragOver =
    (lineId: string, nextLineId: string | null) =>
    (e: DragEvent<HTMLElement>) => {
      if (!dnd.draggingLineId) return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const after = e.clientY - rect.top > rect.height / 2;
      dnd.setDropTarget({
        sectionId: section.id,
        beforeLineId: after ? nextLineId : lineId
      });
    };

  const onGapDragOver =
    (beforeLineId: string | null) => (e: DragEvent<HTMLElement>) => {
      if (!dnd.draggingLineId) return;
      e.preventDefault();
      dnd.setDropTarget({ sectionId: section.id, beforeLineId });
    };

  const onGapDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    dnd.onLineDrop();
  };

  return (
    <FlexColumn
      gap={SPACING.xs}
      fullWidth
      sx={{
        "& .section-remove": { opacity: 0, transition: MOTION.opacity },
        "&:hover .section-remove, &:focus-within .section-remove": {
          opacity: 1
        }
      }}
    >
      <FlexRow
        align="center"
        gap={SPACING.sm}
        fullWidth
        sx={{
          borderBottom: "1px solid",
          borderColor: "divider",
          paddingBottom: SPACING.xs,
          marginBottom: SPACING.sm
        }}
      >
        <TextInput
          value={section.title ?? ""}
          onChange={(e) =>
            setSectionTitle(scriptId, section.id, e.target.value)
          }
          placeholder="Untitled section"
          hideLabel
          label="Section title"
          compact
          fullWidth
          disabled={readOnly}
          sx={{
            "& .MuiOutlinedInput-root": { backgroundColor: "transparent" },
            "& .MuiOutlinedInput-notchedOutline": { border: "none" },
            "& .MuiOutlinedInput-input": {
              paddingLeft: SPACING.none,
              ...TYPOGRAPHY.sans.title,
              letterSpacing: "0.02em"
            }
          }}
        />
        {!readOnly && (
          <Box className="section-remove">
            <ToolbarIconButton
              tooltip="Remove section"
              onClick={() => removeSection(scriptId, section.id)}
              icon={<CloseIcon fontSize="small" />}
            />
          </Box>
        )}
      </FlexRow>
      {section.lines.map((line, index) => {
        const nextLineId = section.lines[index + 1]?.id ?? null;
        return (
          <div key={line.id}>
            {!readOnly && (
              <InsertLineGap
                onInsert={() => insertLine(scriptId, section.id, index)}
                onDragOver={onGapDragOver(line.id)}
                onDrop={onGapDrop}
                active={isTarget(line.id)}
                inset={inset}
              />
            )}
            <ScriptLineRow
              scriptId={scriptId}
              line={line}
              cast={cast}
              highlighted={line.id === currentLineId}
              readOnly={readOnly}
              mobile={mobile}
              onKeyNav={onKeyNav}
              isDragging={dnd.draggingLineId === line.id}
              onDragStart={
                readOnly ? undefined : () => dnd.onLineDragStart(line.id)
              }
              onDragEnd={readOnly ? undefined : dnd.onLineDragEnd}
              onDragOver={onRowDragOver(line.id, nextLineId)}
              onDrop={onGapDrop}
            />
          </div>
        );
      })}
      {!readOnly && (
        <InsertLineGap
          onInsert={() => insertLine(scriptId, section.id, section.lines.length)}
          onDragOver={onGapDragOver(null)}
          onDrop={onGapDrop}
          active={isTarget(null)}
          inset={inset}
        />
      )}
      {!readOnly && (
        <FlexRow sx={{ marginLeft: `${inset}px` }}>
          <EditorButton
            size="small"
            variant="text"
            startIcon={<AddIcon fontSize="small" />}
            onClick={() => addLine(scriptId, section.id)}
          >
            Add line
          </EditorButton>
        </FlexRow>
      )}
    </FlexColumn>
  );
};

const ScriptDocumentPane = ({
  scriptId,
  readOnly
}: ScriptDocumentPaneProps) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { sections, timelineId } = useScript(scriptId);
  const addLine = useScriptStore((s) => s.addLine);
  const addSection = useScriptStore((s) => s.addSection);
  const moveLine = useScriptStore((s) => s.moveLine);
  const insertLine = useScriptStore((s) => s.insertLine);
  const patchLine = useScriptStore((s) => s.patchLine);
  const removeLine = useScriptStore((s) => s.removeLine);
  const undo = useScriptStore((s) => s.undo);
  const redo = useScriptStore((s) => s.redo);
  const canUndo = useScriptCanUndo(scriptId);
  const canRedo = useScriptCanRedo(scriptId);
  const onUndo = useCallback(() => undo(scriptId), [undo, scriptId]);
  const onRedo = useCallback(() => redo(scriptId), [redo, scriptId]);
  const { playing, currentLineId, play, stop } =
    useScriptPlaythrough(scriptId);
  const [voicingAll, setVoicingAll] = useState(false);
  const { assemble, assembling, error: assembleError } =
    useAssembleScriptTimeline();

  const [draggingLineId, setDraggingLineId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  // `dnd` is rebuilt every render, so these handlers see the current drag state
  // directly — no memoization needed and no stale closures.
  const dnd: LineDnd = {
    draggingLineId,
    dropTarget,
    onLineDragStart: setDraggingLineId,
    onLineDragEnd: () => {
      setDraggingLineId(null);
      setDropTarget(null);
    },
    setDropTarget,
    onLineDrop: () => {
      if (draggingLineId && dropTarget)
        moveLine(
          scriptId,
          draggingLineId,
          dropTarget.sectionId,
          dropTarget.beforeLineId
        );
      setDraggingLineId(null);
      setDropTarget(null);
    }
  };

  // Flat, document-order line id list — drives arrow-key focus moves and
  // delete-and-focus-previous.
  const flatLineIds = useMemo(
    () => sections.flatMap((s) => s.lines.map((l) => l.id)),
    [sections]
  );

  // Focus a line's text field once React has committed the mutation, placing
  // the caret at the start or end.
  const focusLine = useCallback((lineId: string, caret: "start" | "end") => {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLTextAreaElement>(
        `[data-script-line="${lineId}"]`
      );
      if (!el) return;
      el.focus();
      const pos = caret === "start" ? 0 : el.value.length;
      el.setSelectionRange(pos, pos);
    });
  }, []);

  const onLineKeyNav = useCallback(
    (lineId: string, nav: LineKeyNav) => {
      const located = (() => {
        for (const section of sections) {
          const index = section.lines.findIndex((l) => l.id === lineId);
          if (index >= 0) return { section, index };
        }
        return null;
      })();
      if (!located) return;
      const { section, index } = located;
      const line = section.lines[index];

      if (nav.type === "split") {
        patchLine(scriptId, lineId, { text: nav.before });
        const newId = insertLine(scriptId, section.id, index + 1);
        // Continue the same speaker so a run of dialogue doesn't need
        // re-tagging after every Enter.
        patchLine(scriptId, newId, {
          text: nav.after,
          speakerId: line.speakerId ?? null
        });
        focusLine(newId, "start");
        return;
      }
      if (nav.type === "delete-empty") {
        const pos = flatLineIds.indexOf(lineId);
        const prevId = pos > 0 ? flatLineIds[pos - 1] : null;
        removeLine(scriptId, lineId);
        if (prevId) focusLine(prevId, "end");
        return;
      }
      // Arrow move: hop to the sibling in document order.
      const pos = flatLineIds.indexOf(lineId);
      const targetId = flatLineIds[pos + nav.dir];
      if (targetId) focusLine(targetId, nav.dir < 0 ? "end" : "start");
    },
    [
      sections,
      flatLineIds,
      scriptId,
      patchLine,
      insertLine,
      removeLine,
      focusLine
    ]
  );

  const onVoiceAll = useCallback(async () => {
    setVoicingAll(true);
    try {
      await voiceAll(scriptId);
    } finally {
      setVoicingAll(false);
    }
  }, [scriptId]);

  const onSendToTimeline = useCallback(() => {
    void assemble(scriptId).catch(() => {
      // Errors surface via the hook's `error`; swallow to keep the click quiet.
    });
  }, [assemble, scriptId]);

  const onExportSubtitles = useCallback(() => {
    const script = useScriptStore.getState().getScript(scriptId);
    if (!script) return;
    const result = exportScriptSubtitles(script, { format: "srt" });
    if (!result) return;
    const base =
      script.title.trim().replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "") ||
      "script";
    const blob = new Blob([result.text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${base}.${result.format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [scriptId]);

  const isEmpty = sections.every((s) => s.lines.length === 0);
  const { lineCount, wordCount } = useMemo(() => {
    let lines = 0;
    let words = 0;
    for (const section of sections)
      for (const line of section.lines) {
        lines += 1;
        const trimmed = line.text.trim();
        if (trimmed) words += trimmed.split(/\s+/).length;
      }
    return { lineCount: lines, wordCount: words };
  }, [sections]);
  const hasVoicedLine = sections.some((section) =>
    section.lines.some((line) =>
      line.takes.some((t) => t.id === line.currentTakeId)
    )
  );

  return (
    <FlexColumn
      gap={SPACING.md}
      sx={{ flex: 1, minWidth: 0, height: "100%", overflowY: "auto" }}
    >
      <FlexRow
        align="center"
        gap={SPACING.sm}
        wrap={isMobile}
        sx={{
          paddingY: SPACING.sm,
          paddingX: isMobile ? SPACING.sm : SPACING.md,
          borderBottom: "1px solid",
          borderColor: "divider",
          position: "sticky",
          top: 0,
          backgroundColor: "background.paper",
          zIndex: Z_INDEX.sticky
        }}
      >
        {!readOnly && (
          <UndoRedoButtons
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
            undoTooltip="Undo (⌘Z)"
            redoTooltip="Redo (⌘⇧Z)"
          />
        )}
        {!readOnly &&
          (voicingAll ? (
            <FlexRow align="center" gap={SPACING.xs}>
              <LoadingSpinner size={18} />
              <Text size="smaller">Voicing…</Text>
            </FlexRow>
          ) : (
            <EditorButton
              size="small"
              variant="contained"
              startIcon={<GraphicEqIcon fontSize="small" />}
              onClick={() => void onVoiceAll()}
            >
              Voice all
            </EditorButton>
          ))}
        {playing ? (
          <EditorButton
            size="small"
            variant="text"
            startIcon={<StopIcon fontSize="small" />}
            onClick={stop}
          >
            Stop
          </EditorButton>
        ) : (
          <EditorButton
            size="small"
            variant="text"
            startIcon={<PlayArrowIcon fontSize="small" />}
            onClick={play}
          >
            Play through
          </EditorButton>
        )}
        <Box sx={{ flex: 1 }} />
        {!isEmpty && (
          <Text size="smaller" sx={{ color: "text.secondary" }}>
            {lineCount} {lineCount === 1 ? "line" : "lines"} · {wordCount}{" "}
            {wordCount === 1 ? "word" : "words"}
          </Text>
        )}
        {!readOnly && <ScriptSaveIndicator scriptId={scriptId} />}
        {!readOnly && (
          <EditorButton
            size="small"
            variant="text"
            startIcon={<MovieIcon fontSize="small" />}
            onClick={onSendToTimeline}
            disabled={assembling || !hasVoicedLine}
            title={
              hasVoicedLine
                ? undefined
                : "Voice at least one line to send it to a timeline"
            }
          >
            {assembling
              ? "Assembling…"
              : timelineId
                ? "Update timeline"
                : "Send to timeline"}
          </EditorButton>
        )}
        {!readOnly && (
          <EditorButton
            size="small"
            variant="text"
            startIcon={<SubtitlesIcon fontSize="small" />}
            onClick={onExportSubtitles}
            disabled={!hasVoicedLine}
            title={
              hasVoicedLine
                ? "Download SRT subtitles from the voiced takes"
                : "Voice at least one line to export subtitles"
            }
          >
            Export SRT
          </EditorButton>
        )}
      </FlexRow>

      {!readOnly && assembleError && (
        <AlertBanner
          severity="error"
          compact
          sx={{ marginX: SPACING.md }}
        >
          {assembleError}
        </AlertBanner>
      )}

      <FlexColumn
        gap={SPACING.xxl}
        style={{ maxWidth: 780, width: "100%", margin: "0 auto" }}
        sx={{
          paddingX: isMobile ? SPACING.sm : SPACING.xl,
          paddingY: isMobile ? SPACING.md : SPACING.xl
        }}
      >
        {isEmpty && (
          <EmptyState
            title="Empty script"
            description="Add a line to start writing. Assign speakers and voices in the Cast panel, then voice each line into a take."
            actionText={readOnly ? undefined : "Add first line"}
            onAction={readOnly ? undefined : () => addLine(scriptId)}
          />
        )}
        {sections.map((section) => (
          <SectionBlock
            key={section.id}
            scriptId={scriptId}
            section={section}
            currentLineId={currentLineId}
            readOnly={readOnly}
            mobile={isMobile}
            dnd={dnd}
            onKeyNav={onLineKeyNav}
          />
        ))}
        {!readOnly && !isEmpty && (
          <FlexRow
            gap={SPACING.sm}
            sx={{ marginLeft: isMobile ? 0 : `${TEXT_INSET}px` }}
          >
            <EditorButton
              size="small"
              variant="text"
              startIcon={<AddIcon fontSize="small" />}
              onClick={() => addSection(scriptId)}
            >
              Add section
            </EditorButton>
          </FlexRow>
        )}
      </FlexColumn>
    </FlexColumn>
  );
};

export default ScriptDocumentPane;
