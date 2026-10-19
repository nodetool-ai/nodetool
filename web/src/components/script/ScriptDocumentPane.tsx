/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DragEvent, ReactNode } from "react";
import { useTheme } from "@mui/material/styles";
import { useShallow } from "zustand/react/shallow";
import { useMediaQuery } from "@mui/material";
import AddIcon from "@mui/icons-material/AddOutlined";
import CloseIcon from "@mui/icons-material/CloseOutlined";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import MovieIcon from "@mui/icons-material/Movie";
import SubtitlesIcon from "@mui/icons-material/Subtitles";
import AudioFileIcon from "@mui/icons-material/AudioFile";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import MicNoneIcon from "@mui/icons-material/MicNone";
import {
  FlexColumn,
  FlexRow,
  Box,
  Text,
  TextInput,
  EditorButton,
  Toolbar,
  ToolbarIconButton,
  UndoRedoButtons,
  EmptyState,
  AlertBanner,
  Caption,
  LoadingSpinner,
  Tooltip,
  EditorMenu,
  MenuItemPrimitive,
  SPACING,
  BORDER_RADIUS,
  TYPOGRAPHY,
  EYEBROW,
  CONTROL,
  TruncatedText,
  MOTION,
  SPACING_PX,
  Z_INDEX,
  ICON_SIZE
} from "../ui_primitives";
import { formatDuration } from "../../utils/formatUtils";
import { useInStudio } from "../../studio/StudioContext";
import {
  useScript,
  useScriptCast,
  useScriptTitle,
  useScriptSetup,
  useScriptStore,
  useScriptStoryboardLink,
  useScriptCanUndo,
  useScriptCanRedo,
  type ScriptLine,
  type ScriptSection,
  type ScriptSpeaker
} from "../../stores/script/ScriptStore";
import {
  dismissVoicingRun,
  readVoicingRun,
  retryVoicing,
  useVoicingLive,
  voiceAll,
  type VoicingRun
} from "../../stores/script/scriptVoicing";
import { formatUsd } from "@nodetool-ai/model-pricing";
import {
  useVoiceCostEstimate,
  type VoiceCostEstimate
} from "../../hooks/script/useVoiceCostEstimate";
import { exportScriptSubtitles } from "../../stores/script/scriptSubtitles";
import { useScriptPlaythrough } from "../../hooks/script/useScriptPlaythrough";
import { useScriptWriting } from "../../hooks/script/scriptWrites";
import { useAssembleScriptTimeline } from "../../hooks/script/useAssembleScriptTimeline";
import {
  scriptFileBase,
  useScriptAudioExport
} from "../../hooks/script/useScriptAudioExport";
import ScriptLineRow, { TEXT_INSET, type LineKeyNav } from "./ScriptLineRow";
import { useScriptLineShotLink } from "../../hooks/script/useScriptShotLinks";
import { useScriptLineFocus } from "../../hooks/script/useScriptLineFocus";
import StoryboardLinkControl from "./StoryboardLinkControl";
import ScriptSaveIndicator from "./ScriptSaveIndicator";
import { scriptWorkflowMedia } from "./scriptWorkflowMedia";
import { SendToWorkflowButton } from "../workflows/SendToWorkflowMenu";
import { useContextCommands } from "../../hooks/useContextCommands";
import type { ContextCommand } from "../../stores/CommandMenuStore";

interface ScriptDocumentPaneProps {
  scriptId: string;
  readOnly: boolean;
  /** Whether the pane's tab is on screen; lists its commands in the Cmd+K menu. */
  active?: boolean;
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
 * A hover-revealed seam between lines: a hairline with a "+" that inserts a
 * new line at this position. It overlays the divider between two rows, so the
 * script keeps its printed rhythm, and doubles as a drop target so a line can
 * be dropped precisely between two others.
 */
const InsertLineGap = ({
  onInsert,
  onDragOver,
  onDrop,
  active,
  inset,
  edge
}: {
  onInsert: () => void;
  onDragOver: (e: DragEvent<HTMLElement>) => void;
  onDrop: (e: DragEvent<HTMLElement>) => void;
  active: boolean;
  inset: number;
  /** Where the seam sits: on the row's top border, or inside its bottom edge. */
  edge: "top" | "first" | "bottom";
}) => {
  const { t } = useTranslation();
  return (
  <FlexRow
    align="center"
    onDragOver={onDragOver}
    onDrop={onDrop}
    sx={{
      position: "absolute",
      left: `${inset}px`,
      right: 0,
      ...(edge === "bottom" ? { bottom: 0 } : { top: 0 }),
      transform: edge === "top" ? "translateY(-50%)" : undefined,
      height: SPACING_PX.lg,
      zIndex: Z_INDEX.raised,
      cursor: "pointer",
      "& .insert-line-rule": {
        opacity: active ? 1 : 0,
        transition: MOTION.opacity
      },
      "&:hover .insert-line-rule, &:focus-within .insert-line-rule": {
        opacity: 1
      }
    }}
  >
    <Box
      component="button"
      type="button"
      onClick={onInsert}
      aria-label={t("i18n-next25.script.document.insertLineHere")}
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
      <AddIcon sx={{ fontSize: ICON_SIZE.xs }} />
      <Box
        sx={{
          flex: 1,
          height: 2,
          borderRadius: BORDER_RADIUS.sm,
          backgroundColor: "primary.main"
        }}
      />
    </Box>
  </FlexRow>
  );
};

/**
 * One line: the insert/drop gap above it plus the row itself. Owns the per-line
 * closures the row needs, so typing in one line leaves every other row — six
 * icon buttons and a text field each — untouched.
 */
const SectionLine = memo(function SectionLine({
  scriptId,
  line,
  index,
  nextLineId,
  cast,
  highlighted,
  readOnly,
  mobile,
  inset,
  gapActive,
  isDragging,
  dragActive,
  onKeyNav,
  onInsert,
  onDragStart,
  onDragEnd,
  onDropTarget,
  onDrop
}: {
  scriptId: string;
  line: ScriptLine;
  index: number;
  nextLineId: string | null;
  cast: ScriptSpeaker[];
  highlighted: boolean;
  readOnly: boolean;
  mobile: boolean;
  inset: number;
  /** True when the pending drop lands right above this line. */
  gapActive: boolean;
  isDragging: boolean;
  /** True while any line in the document is being dragged. */
  dragActive: boolean;
  onKeyNav: (lineId: string, nav: LineKeyNav) => void;
  onInsert: (index: number) => void;
  onDragStart: (lineId: string) => void;
  onDragEnd: () => void;
  onDropTarget: (beforeLineId: string | null) => void;
  onDrop: () => void;
}) {
  const handleInsert = useCallback(
    () => onInsert(index),
    [onInsert, index]
  );

  const handleGapDragOver = useCallback(
    (e: DragEvent<HTMLElement>) => {
      if (!dragActive) return;
      e.preventDefault();
      onDropTarget(line.id);
    },
    [dragActive, onDropTarget, line.id]
  );

  // Snap a drag hovering the row to the nearest gap (before this line, or before
  // the next one), so the active gap's rule marks where the drop will land.
  const handleRowDragOver = useCallback(
    (e: DragEvent<HTMLElement>) => {
      if (!dragActive) return;
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const after = e.clientY - rect.top > rect.height / 2;
      onDropTarget(after ? nextLineId : line.id);
    },
    [dragActive, onDropTarget, nextLineId, line.id]
  );

  const handleDrop = useCallback(
    (e: DragEvent<HTMLElement>) => {
      e.preventDefault();
      onDrop();
    },
    [onDrop]
  );

  const handleDragStart = useCallback(
    () => onDragStart(line.id),
    [onDragStart, line.id]
  );

  // The storyboard side of the link: which shot covers this line, or that none
  // does. Nothing when the script links no board.
  const { shotLink, orphaned } = useScriptLineShotLink(scriptId, line.id);

  return (
    <Box
      data-focus-id={`script-line-${line.id}`}
      sx={{
        position: "relative",
        borderTop: index === 0 ? "none" : "1px solid",
        borderColor: "divider"
      }}
    >
      {!readOnly && (
        <InsertLineGap
          onInsert={handleInsert}
          onDragOver={handleGapDragOver}
          onDrop={handleDrop}
          active={gapActive}
          inset={inset}
          edge={index === 0 ? "first" : "top"}
        />
      )}
      <ScriptLineRow
        scriptId={scriptId}
        line={line}
        cast={cast}
        highlighted={highlighted}
        readOnly={readOnly}
        mobile={mobile}
        shotLink={shotLink}
        orphaned={orphaned}
        onKeyNav={onKeyNav}
        isDragging={isDragging}
        onDragStart={readOnly ? undefined : handleDragStart}
        onDragEnd={readOnly ? undefined : onDragEnd}
        onDragOver={handleRowDragOver}
        onDrop={handleDrop}
      />
    </Box>
  );
});

const SectionBlockInner = ({
  scriptId,
  section,
  highlightedLineId,
  readOnly,
  mobile,
  dnd,
  onKeyNav
}: {
  scriptId: string;
  section: ScriptSection;
  /** The line drawn as highlighted: the one playing, or one jumped to. */
  highlightedLineId: string | null;
  readOnly: boolean;
  mobile: boolean;
  dnd: LineDnd;
  onKeyNav: (lineId: string, nav: LineKeyNav) => void;
}) => {
  const cast = useScriptCast(scriptId);
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

  const dragActive = dnd.draggingLineId !== null;
  const { setDropTarget, onLineDragStart, onLineDragEnd, onLineDrop } = dnd;

  const onDropTarget = useCallback(
    (beforeLineId: string | null) =>
      setDropTarget({ sectionId: section.id, beforeLineId }),
    [setDropTarget, section.id]
  );

  const onInsertAt = useCallback(
    (index: number) => insertLine(scriptId, section.id, index),
    [insertLine, scriptId, section.id]
  );

  const onGapDragOver =
    (beforeLineId: string | null) => (e: DragEvent<HTMLElement>) => {
      if (!dragActive) return;
      e.preventDefault();
      onDropTarget(beforeLineId);
    };

  const onGapDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    onLineDrop();
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
      <FlexRow align="center" gap={SPACING.sm} fullWidth>
        <TextInput
          value={section.title ?? ""}
          onChange={(e) =>
            setSectionTitle(scriptId, section.id, e.target.value)
          }
          placeholder={t("i18n-next25.script.document.untitledSection")}
          hideLabel
          label={t("i18n-next25.script.document.sectionTitle")}
          compact
          fullWidth
          disabled={readOnly}
          sx={{
            "& .MuiOutlinedInput-root.MuiInputBase-root": {
              backgroundColor: "transparent"
            },
            "& .MuiOutlinedInput-notchedOutline": { border: "none" },
            "& .MuiOutlinedInput-input": {
              paddingLeft: SPACING.none,
              ...EYEBROW,
              color: "text.secondary"
            },
            "& .MuiOutlinedInput-input.Mui-disabled": {
              WebkitTextFillColor: "inherit"
            }
          }}
        />
        {!readOnly && (
          <Box className="section-remove">
            <ToolbarIconButton
              tooltip={t("i18n-next25.script.document.deleteSection")}
              onClick={() => removeSection(scriptId, section.id)}
              icon={<CloseIcon fontSize="small" />}
            />
          </Box>
        )}
      </FlexRow>
      {/* The section's lines read as one sheet, a hairline between rows. */}
      {section.lines.length > 0 && (
      <Box
        sx={{
          position: "relative",
          borderRadius: BORDER_RADIUS.lg,
          border: "1px solid",
          borderColor: "divider",
          backgroundColor: "background.paper",
          overflow: "hidden"
        }}
      >
        {section.lines.map((line, index) => (
          <SectionLine
            key={line.id}
            scriptId={scriptId}
            line={line}
            index={index}
            nextLineId={section.lines[index + 1]?.id ?? null}
            cast={cast}
            highlighted={line.id === highlightedLineId}
            readOnly={readOnly}
            mobile={mobile}
            inset={inset}
            gapActive={isTarget(line.id)}
            isDragging={dnd.draggingLineId === line.id}
            dragActive={dragActive}
            onKeyNav={onKeyNav}
            onInsert={onInsertAt}
            onDragStart={onLineDragStart}
            onDragEnd={onLineDragEnd}
            onDropTarget={onDropTarget}
            onDrop={onLineDrop}
          />
        ))}
        {!readOnly && (
          <InsertLineGap
            onInsert={() =>
              insertLine(scriptId, section.id, section.lines.length)
            }
            onDragOver={onGapDragOver(null)}
            onDrop={onGapDrop}
            active={isTarget(null)}
            inset={inset}
            edge="bottom"
          />
        )}
      </Box>
      )}
      {!readOnly && (
        <FlexRow sx={{ marginLeft: `${inset}px` }}>
          <EditorButton
            size="small"
            variant="text"
            startIcon={<AddIcon fontSize="small" />}
            onClick={() => addLine(scriptId, section.id)}
          >
            {t("i18n-next25.script.document.addLine")}
          </EditorButton>
        </FlexRow>
      )}
    </FlexColumn>
  );
};

/** `mapLine` keeps unedited sections referentially stable, so a keystroke only
 *  re-renders the section being edited. */
const SectionBlock = memo(SectionBlockInner);

/** A quiet pill of document facts in the header ("4 lines", "2 voices"). */
const MetaChip = ({
  icon,
  children
}: {
  icon?: ReactNode;
  children: ReactNode;
}) => (
  <FlexRow
    component="span"
    align="center"
    gap={SPACING.xs}
    sx={{
      flexShrink: 0,
      height: CONTROL.height.sm,
      paddingX: SPACING.lg,
      borderRadius: BORDER_RADIUS.pill,
      border: "1px solid",
      borderColor: "divider",
      backgroundColor: "action.hover",
      color: "text.secondary",
      whiteSpace: "nowrap",
      ...TYPOGRAPHY.sans.label
    }}
  >
    {icon}
    {children}
  </FlexRow>
);

/**
 * *Voice all* with what the click costs on it.
 *
 * The price sits in the label rather than beside it, so it reads as this
 * button's price and not as some figure the toolbar happens to carry. A script
 * whose speech models publish only per-token rates shows the plain label and
 * says why in the tooltip — a synthesized "$0" would be a lie about a billed
 * call.
 */
const VoiceAllButton = ({
  estimate,
  onClick
}: {
  estimate: VoiceCostEstimate;
  onClick: () => void;
}) => {
  const { lineCount, characters, cost, pricedLineCount, breakdowns, reasons, notes } =
    estimate;
  const priced = pricedLineCount > 0 && cost > 0;
  const partial = priced && pricedLineCount < lineCount;

  return (
    <Tooltip
      placement="bottom"
      title={
        <FlexColumn gap={SPACING.micro}>
          <Text size="small">
            {lineCount === 0
              ? t("i18n-next25.script.document.everyLineVoiced")
              : t("i18n-next25.script.document.voiceEstimate", {
                  count: lineCount,
                  characters,
                  price: priced ? t("i18n-next25.script.document.aboutPrice", { price: formatUsd(cost) }) : "",
                  partial: partial ? t("i18n-next25.script.document.partialPricing", { pricedLineCount, lineCount }) : ""
                })}
          </Text>
          {breakdowns.map((breakdown) => (
            <Caption key={breakdown} color="secondary">
              {breakdown}
            </Caption>
          ))}
          {reasons.map((reason) => (
            <Caption key={reason} color="secondary">
              {reason}
            </Caption>
          ))}
          {priced &&
            notes.map((note) => (
              <Caption key={note} color="secondary">
                {note}
              </Caption>
            ))}
          {priced && (
            <Caption color="secondary">
              {t("i18n-next25.script.document.providerListPriceNote")}
            </Caption>
          )}
        </FlexColumn>
      }
    >
      <EditorButton
        size="small"
        variant="contained"
        startIcon={<GraphicEqIcon fontSize="small" />}
        onClick={onClick}
      >
        {priced ? t("i18n-next25.script.document.voiceAllPrice", { price: formatUsd(cost) }) : t("i18n-next25.script.document.voiceAll")}
      </EditorButton>
    </Tooltip>
  );
};

/** The first words of a line, for naming it in the failure list. */
const lineLabel = (text: string): string => {
  const trimmed = text.trim();
  if (trimmed === "") {
    return "";
  }
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : `“${trimmed}”`;
};

/**
 * What the last *Voice all* did (F8).
 *
 * The guided flow writes stage `done` and opens this editor before the takes
 * arrive (PRD § 9.3), so the creator lands here with speech still being made
 * and, until now, learned nothing when a line produced no audio: the batch
 * caught each failure and logged it to a console nobody has open. The run is on
 * the document, so this strip says which state it is in — queued, running with
 * a count, or completed — names every line that failed with the reason it gave,
 * and retries them through the same path that voiced the rest.
 *
 * A queued or running record with no run going in this page was left by a page
 * that closed mid-run. No take is still coming, so it reads as stopped rather
 * than as a spinner that never ends.
 *
 * A script nobody has voiced carries no record, and this renders nothing.
 */
const VoicingStrip = ({
  scriptId,
  readOnly
}: {
  scriptId: string;
  readOnly?: boolean;
}) => {
  const { t } = useTranslation();
  const setup = useScriptSetup(scriptId);
  const lineText = useScriptStore(
    useShallow((state) => {
      const map: Record<string, string> = {};
      for (const section of state.scripts[scriptId]?.sections ?? []) {
        for (const line of section.lines) {
          map[line.id] = line.text;
        }
      }
      return map;
    })
  );
  const [retrying, setRetrying] = useState<readonly string[]>([]);
  const live = useVoicingLive(scriptId);
  // Voicing refuses while a write replaces the lines.
  const writing = useScriptWriting(scriptId);

  const run: VoicingRun | null = readVoicingRun(setup);

  const retry = useCallback(
    (lineIds: readonly string[]) => {
      setRetrying(lineIds);
      void retryVoicing(scriptId, lineIds).finally(() => setRetrying([]));
    },
    [scriptId]
  );

  if (!run || (run.total === 0 && run.failed.length === 0)) {
    return null;
  }

  const stopped = run.status !== "completed" && !live;

  if (run.status === "queued" && !stopped) {
    return (
      <AlertBanner severity="info" compact sx={{ marginX: SPACING.md }}>
        {t("i18n-next25.script.document.voicingQueued", { count: run.total })}
      </AlertBanner>
    );
  }

  if (run.status === "running" && !stopped) {
    return (
      <AlertBanner severity="info" compact sx={{ marginX: SPACING.md }}>
        <FlexRow align="center" gap={SPACING.xs}>
          <LoadingSpinner inline size={16} />
          <Text size="smaller">
            {t("i18n-next25.script.document.voicingProgress", { count: run.total, completed: run.voiced + run.failed.length, total: run.total, failed: run.failed.length })}
          </Text>
        </FlexRow>
      </AlertBanner>
    );
  }

  const busy = retrying.length > 0 || live || writing;

  if (run.failed.length === 0 && !stopped) {
    return (
      <AlertBanner
        severity="success"
        compact
        onClose={readOnly ? undefined : () => dismissVoicingRun(scriptId)}
        sx={{ marginX: SPACING.md }}
      >
        {t("i18n-next25.script.document.voicedComplete", { count: run.voiced })}
      </AlertBanner>
    );
  }

  return (
    <AlertBanner
      severity="warning"
      compact
      onClose={readOnly ? undefined : () => dismissVoicingRun(scriptId)}
      sx={{ marginX: SPACING.md }}
    >
      <FlexColumn gap={SPACING.xs}>
        <Text size="smaller">
          {t("i18n-next25.script.document.voicingSummary", {
            count: run.total,
            stoppedPrefix: stopped ? t("i18n-next25.script.document.stoppedPrefix") : "",
            voiced: run.voiced,
            total: run.total,
            failureSummary: run.failed.length > 0 ? t("i18n-next25.script.document.failureSummary", { count: run.failed.length }) : "",
            continuePrompt: stopped && !readOnly ? t("i18n-next25.script.document.continuePrompt") : ""
          })}
        </Text>
        {run.failed.length === 0 ? null : (
          <FlexColumn
            gap={SPACING.xs}
            component="ul"
            sx={{ margin: 0, paddingLeft: 0, listStyle: "none" }}
          >
            {run.failed.map((failure) => (
              <FlexRow
                key={failure.lineId}
                component="li"
                gap={SPACING.sm}
                align="center"
                wrap
              >
                <Caption>
                  {`${lineLabel(lineText[failure.lineId] ?? "") ? t("i18n-next25.script.document.lineLabel", { text: lineLabel(lineText[failure.lineId] ?? "") }) : t("i18n-next25.script.document.emptyLine")} — ${failure.error}`}
                </Caption>
                {readOnly ? null : (
                  <EditorButton
                    size="small"
                    variant="text"
                    disabled={busy}
                    onClick={() => retry([failure.lineId])}
                  >
                    {t("i18n-next25.script.document.retry")}
                  </EditorButton>
                )}
              </FlexRow>
            ))}
          </FlexColumn>
        )}
        {readOnly || run.failed.length < 2 ? null : (
          <FlexRow>
            <EditorButton
              size="small"
              variant="outlined"
              disabled={busy}
              onClick={() => retry(run.failed.map((failure) => failure.lineId))}
            >
              {retrying.length > 0
                ? t("i18n-next25.script.document.retrying")
                : t("i18n-next25.script.document.retryAll", { count: run.failed.length })}
            </EditorButton>
          </FlexRow>
        )}
      </FlexColumn>
    </AlertBanner>
  );
};

const ScriptDocumentPane = ({
  scriptId,
  readOnly,
  active = false
}: ScriptDocumentPaneProps) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const inStudio = useInStudio();
  const { sections, timelineId } = useScript(scriptId);
  // A linked board means the cut carries picture as well as voice, so the
  // button stops promising a voiceover track and offers the whole video.
  const storyboardId = useScriptStoryboardLink(scriptId);
  const title = useScriptTitle(scriptId);
  const castCount = useScriptCast(scriptId).length;
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
  // A shot's "Appears in" chip opens the script at one line; playback's own
  // highlight wins while it runs.
  const focusedLineId = useScriptLineFocus(scriptId, sections.length > 0);
  const highlightedLineId = currentLineId ?? focusedLineId;
  const [voicingAll, setVoicingAll] = useState(false);
  // A run started elsewhere in this page, such as the guided flow's last step,
  // is voicing these lines already: a second Voice all would pay for them twice.
  const voicingLive = useVoicingLive(scriptId);
  // A write the agent started replaces these lines, so voicing them now would
  // pay for takes the write throws away. Voicing refuses it.
  const writing = useScriptWriting(scriptId);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const { assemble, assembling, error: assembleError } =
    useAssembleScriptTimeline();
  const { exportAudio, exporting: exportingAudio } =
    useScriptAudioExport(scriptId);

  const [draggingLineId, setDraggingLineId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const onLineDragEnd = useCallback(() => {
    setDraggingLineId(null);
    setDropTarget(null);
  }, []);

  const onLineDrop = useCallback(() => {
    if (draggingLineId && dropTarget)
      moveLine(
        scriptId,
        draggingLineId,
        dropTarget.sectionId,
        dropTarget.beforeLineId
      );
    setDraggingLineId(null);
    setDropTarget(null);
  }, [draggingLineId, dropTarget, moveLine, scriptId]);

  // Changes only when a drag starts, moves, or ends — never on a keystroke,
  // which would invalidate every memoized section.
  const dnd: LineDnd = useMemo(
    () => ({
      draggingLineId,
      dropTarget,
      onLineDragStart: setDraggingLineId,
      onLineDragEnd,
      setDropTarget,
      onLineDrop
    }),
    [draggingLineId, dropTarget, onLineDragEnd, onLineDrop]
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

  // Reads the document from the store rather than closing over `sections`, so
  // typing doesn't hand every row a new callback.
  const onLineKeyNav = useCallback(
    (lineId: string, nav: LineKeyNav) => {
      const script = useScriptStore.getState().getScript(scriptId);
      if (!script) return;
      const located = (() => {
        for (const section of script.sections) {
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

      // Flat, document-order line id list — drives arrow-key focus moves and
      // delete-and-focus-previous.
      const flatLineIds = script.sections.flatMap((s) =>
        s.lines.map((l) => l.id)
      );
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
    [scriptId, patchLine, insertLine, removeLine, focusLine]
  );

  const onVoiceAll = useCallback(async () => {
    setVoicingAll(true);
    try {
      await voiceAll(scriptId);
    } finally {
      setVoicingAll(false);
    }
  }, [scriptId]);

  // What the click above is about to spend, over the same lines it will voice.
  const voiceCost = useVoiceCostEstimate(scriptId);

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
    const base = scriptFileBase(script.title);
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

  // Every header stat from one walk; `hasVoicedLine` used to rescan the whole
  // document on each render.
  const { lineCount, wordCount, hasVoicedLine, voicedDurationMs } = useMemo(() => {
    let lines = 0;
    let words = 0;
    let voiced = false;
    let durationMs = 0;
    for (const section of sections)
      for (const line of section.lines) {
        lines += 1;
        const trimmed = line.text.trim();
        if (trimmed) words += trimmed.split(/\s+/).length;
        const take = line.takes.find((t) => t.id === line.currentTakeId);
        if (take) {
          voiced = true;
          durationMs += take.durationMs + (line.pauseAfterMs ?? 0);
        }
      }
    return {
      lineCount: lines,
      wordCount: words,
      hasVoicedLine: voiced,
      voicedDurationMs: durationMs
    };
  }, [sections]);
  const isEmpty = lineCount === 0;
  const durationLabel = voicedDurationMs > 0 ? formatDuration(voicedDurationMs) : null;
  const showAssemble = !readOnly && !inStudio;
  const workflowMedia = useMemo(() => scriptWorkflowMedia(sections), [sections]);

  const menuCommands = useMemo<ContextCommand[]>(() => {
    if (!hasVoicedLine) {
      return [];
    }
    const commands: ContextCommand[] = [];
    if (showAssemble && !assembling) {
      commands.push({
        id: "send-to-timeline",
        label: storyboardId
          ? t("i18n-next25.script.document.assembleVideo")
          : timelineId
            ? t("i18n-next25.script.document.updateTimeline")
            : t("i18n-next25.script.document.sendToTimeline"),
        run: onSendToTimeline
      });
    }
    commands.push({
      id: "export-subtitles",
      label: t("i18n-next25.script.document.exportSubtitlesSrt"),
      run: onExportSubtitles
    });
    if (!exportingAudio) {
      commands.push(
        {
          id: "export-audio-wav",
          label: t("i18n-next25.script.document.exportAudioWav"),
          run: () => void exportAudio("wav")
        },
        {
          id: "export-audio-mp3",
          label: t("i18n-next25.script.document.exportAudioMp3"),
          run: () => void exportAudio("mp3")
        }
      );
    }
    return commands;
  }, [
    hasVoicedLine,
    showAssemble,
    assembling,
    storyboardId,
    timelineId,
    onSendToTimeline,
    onExportSubtitles,
    exportingAudio,
    exportAudio
  ]);
  useContextCommands(t("i18n-next25.script.document.scriptContext"), menuCommands, active);

  return (
    <FlexColumn
      data-focus-id="script-document"
      gap={SPACING.md}
      sx={{ flex: 1, minWidth: 0, height: "100%", overflowY: "auto" }}
    >
      {/* A stacked two-row header: Toolbar's surface and rule, column layout. */}
      <Toolbar
        sx={{
          position: "sticky",
          top: 0,
          zIndex: Z_INDEX.sticky,
          flexDirection: "column",
          alignItems: "stretch",
          gap: SPACING.none,
          px: SPACING.none
        }}
      >
      <FlexRow
        align="center"
        gap={SPACING.md}
        wrap
        sx={{
          paddingTop: SPACING.lg,
          paddingBottom: SPACING.sm,
          paddingX: isMobile ? SPACING.md : SPACING.xl
        }}
      >
        <DescriptionOutlinedIcon
          fontSize="small"
          sx={{ color: "warning.main", flexShrink: 0 }}
        />
        <TruncatedText
          component="h2"
          sx={{
            ...TYPOGRAPHY.sans.title,
            margin: SPACING.none,
            minWidth: 0,
            flex: "1 1 auto",
            color: "text.primary"
          }}
        >
          {title ? t("i18n-next25.script.document.titledScript", { title }) : t("i18n-next25.script.document.untitledScript")}
        </TruncatedText>
        {!isEmpty && (
          <MetaChip>
            {t("i18n-next25.script.document.lineWordCount", { lines: lineCount, words: wordCount })}
            {durationLabel ? ` · ${durationLabel}` : ""}
          </MetaChip>
        )}
        {castCount > 0 && (
          <MetaChip icon={<MicNoneIcon fontSize="inherit" />}>
            {t("i18n-next25.script.document.voiceCount", { count: castCount })}
          </MetaChip>
        )}
        {!readOnly && <ScriptSaveIndicator scriptId={scriptId} />}
      </FlexRow>
      <FlexRow
        align="center"
        gap={SPACING.sm}
        wrap
        sx={{
          paddingBottom: SPACING.sm,
          paddingX: isMobile ? SPACING.sm : SPACING.lg,
          "& .MuiButton-root": { whiteSpace: "nowrap", flexShrink: 0 }
        }}
      >
        {!readOnly && (
          <UndoRedoButtons
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
            undoTooltip={t("i18n-next25.script.document.undo")}
            redoTooltip={t("i18n-next25.script.document.redo")}
          />
        )}
        {!readOnly &&
          (voicingAll || voicingLive || writing ? (
            <FlexRow align="center" gap={SPACING.xs}>
              <LoadingSpinner inline size={16} />
              <Text size="smaller">
                {voicingAll || voicingLive ? t("i18n-next25.script.document.voicing") : t("i18n-next25.script.document.writing")}
              </Text>
            </FlexRow>
          ) : (
            <VoiceAllButton
              estimate={voiceCost}
              onClick={() => void onVoiceAll()}
            />
          ))}
        {playing ? (
          <EditorButton
            size="small"
            variant="text"
            startIcon={<StopIcon fontSize="small" />}
            onClick={stop}
          >
            {t("i18n-next25.script.document.stop")}
          </EditorButton>
        ) : (
          <Tooltip
            title={
              hasVoicedLine
                ? t("i18n-next25.script.document.playCurrentTakesTooltip")
                : t("i18n-next25.script.document.voiceToPlayTooltip")
            }
          >
            <span>
              <EditorButton
                size="small"
                variant="text"
                startIcon={<PlayArrowIcon fontSize="small" />}
                onClick={play}
                disabled={!hasVoicedLine}
              >
                {t("i18n-next25.script.document.playThrough")}
              </EditorButton>
            </span>
          </Tooltip>
        )}
        <Box sx={{ flex: 1 }} />
        {exportingAudio && (
          <FlexRow align="center" gap={SPACING.xs}>
            <LoadingSpinner inline size={16} />
            <Text size="smaller">
              {t("i18n-next25.script.document.exportingAudio", { format: exportingAudio.toUpperCase() })}
            </Text>
          </FlexRow>
        )}
        {showAssemble && (
          <EditorButton
            size="small"
            variant="text"
            startIcon={<MovieIcon fontSize="small" />}
            onClick={onSendToTimeline}
            disabled={assembling || !hasVoicedLine}
            tooltip={
              storyboardId
                ? t("i18n-next25.script.document.assembleStoryboardTooltip")
                : undefined
            }
            disabledReason={
              hasVoicedLine
                ? undefined
                : t("i18n-next25.script.document.voiceToTimelineTooltip")
            }
          >
            {assembling
              ? t("i18n-next25.script.document.assembling")
              : storyboardId
                ? t("i18n-next25.script.document.assembleVideo")
                : timelineId
                  ? t("i18n-next25.script.document.updateTimeline")
                  : t("i18n-next25.script.document.sendToTimeline")}
          </EditorButton>
        )}
        {hasVoicedLine && (
          <SendToWorkflowButton
            items={workflowMedia}
            tooltip={t("i18n-next25.script.document.sendTakesToWorkflow")}
          />
        )}
        {!readOnly && <StoryboardLinkControl scriptId={scriptId} />}
        {!readOnly && (
          <>
            <ToolbarIconButton
              tooltip={t("i18n-next25.script.document.moreActions")}
              ariaLabel={t("i18n-next25.script.document.moreActions")}
              onClick={(e) => setMoreAnchor(e.currentTarget)}
              icon={<MoreVertIcon fontSize="small" />}
            />
            <EditorMenu
              anchorEl={moreAnchor}
              open={!!moreAnchor}
              onClose={() => setMoreAnchor(null)}
            >
              <MenuItemPrimitive
                icon={<SubtitlesIcon fontSize="small" />}
                label={t("i18n-next25.script.document.exportSrt")}
                disabled={!hasVoicedLine}
                tooltip={
                  hasVoicedLine
                    ? undefined
                    : t("i18n-next25.script.document.voiceToExportSubtitles")
                }
                onClick={() => {
                  setMoreAnchor(null);
                  onExportSubtitles();
                }}
              />
              {(["wav", "mp3"] as const).map((format) => (
                <MenuItemPrimitive
                  key={format}
                  icon={<AudioFileIcon fontSize="small" />}
                  label={t("i18n-next25.script.document.exportFormat", { format: format.toUpperCase() })}
                  disabled={!hasVoicedLine || exportingAudio !== null}
                  tooltip={
                    hasVoicedLine
                      ? undefined
                      : t("i18n-next25.script.document.voiceToExportAudio")
                  }
                  onClick={() => {
                    setMoreAnchor(null);
                    void exportAudio(format);
                  }}
                />
              ))}
            </EditorMenu>
          </>
        )}
      </FlexRow>
      </Toolbar>

      <VoicingStrip scriptId={scriptId} readOnly={readOnly} />

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
        style={{ maxWidth: 1180, width: "100%", margin: "0 auto" }}
        sx={{
          paddingX: isMobile ? SPACING.sm : SPACING.xl,
          paddingY: isMobile ? SPACING.md : SPACING.xl,
          // Rows reflow on the column's own width, not the viewport's:
          // the cast rail and the assistant dock both take from it.
          containerType: "inline-size",
          containerName: "script-lines"
        }}
      >
        {isEmpty && (
          <EmptyState
            title={t("i18n-next25.script.document.emptyScript")}
            description={t("i18n-next25.script.document.emptyScriptDescription")}
            actionText={readOnly ? undefined : t("i18n-next25.script.document.addFirstLine")}
            onAction={readOnly ? undefined : () => addLine(scriptId)}
          />
        )}
        <FlexColumn data-focus-id="script-lines" gap={SPACING.xxl}>
          {sections.map((section) => (
            <SectionBlock
              key={section.id}
              scriptId={scriptId}
              section={section}
              highlightedLineId={highlightedLineId}
              readOnly={readOnly}
              mobile={isMobile}
              dnd={dnd}
              onKeyNav={onLineKeyNav}
            />
          ))}
        </FlexColumn>
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
              {t("i18n-next25.script.document.addSection")}
            </EditorButton>
          </FlexRow>
        )}
      </FlexColumn>
    </FlexColumn>
  );
};

export default ScriptDocumentPane;
