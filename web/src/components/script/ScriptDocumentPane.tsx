/** @jsxImportSource @emotion/react */
import { useCallback, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
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
  EmptyState,
  LoadingSpinner,
  SPACING,
  TYPOGRAPHY,
  MOTION,
  Z_INDEX
} from "../ui_primitives";
import {
  useScript,
  useScriptStore,
  type ScriptSection
} from "../../stores/script/ScriptStore";
import { voiceAll } from "../../stores/script/scriptVoicing";
import { exportScriptSubtitles } from "../../stores/script/scriptSubtitles";
import { useScriptPlaythrough } from "../../hooks/script/useScriptPlaythrough";
import { useAssembleScriptTimeline } from "../../hooks/script/useAssembleScriptTimeline";
import ScriptLineRow, { GUTTER } from "./ScriptLineRow";

interface ScriptDocumentPaneProps {
  scriptId: string;
  readOnly: boolean;
}

const SectionBlock = ({
  scriptId,
  section,
  currentLineId,
  readOnly
}: {
  scriptId: string;
  section: ScriptSection;
  currentLineId: string | null;
  readOnly: boolean;
}) => {
  const cast = useScript(scriptId).cast;
  const setSectionTitle = useScriptStore((s) => s.setSectionTitle);
  const addLine = useScriptStore((s) => s.addLine);
  const removeSection = useScriptStore((s) => s.removeSection);

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
              icon={<Text size="smaller">✕</Text>}
            />
          </Box>
        )}
      </FlexRow>
      {section.lines.map((line) => (
        <ScriptLineRow
          key={line.id}
          scriptId={scriptId}
          line={line}
          cast={cast}
          highlighted={line.id === currentLineId}
          readOnly={readOnly}
        />
      ))}
      {!readOnly && (
        <FlexRow sx={{ marginLeft: `${GUTTER + 8}px` }}>
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
  const { sections, timelineId } = useScript(scriptId);
  const addLine = useScriptStore((s) => s.addLine);
  const addSection = useScriptStore((s) => s.addSection);
  const { playing, currentLineId, play, stop } =
    useScriptPlaythrough(scriptId);
  const [voicingAll, setVoicingAll] = useState(false);
  const { assemble, assembling } = useAssembleScriptTimeline();

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
        sx={{
          paddingY: SPACING.sm,
          paddingX: SPACING.md,
          borderBottom: "1px solid",
          borderColor: "divider",
          position: "sticky",
          top: 0,
          backgroundColor: "background.paper",
          zIndex: Z_INDEX.sticky
        }}
      >
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

      <FlexColumn
        gap={SPACING.xxl}
        style={{ maxWidth: 780, width: "100%", margin: "0 auto" }}
        sx={{ paddingX: SPACING.xl, paddingY: SPACING.xl }}
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
          />
        ))}
        {!readOnly && !isEmpty && (
          <FlexRow gap={SPACING.sm} sx={{ marginLeft: `${GUTTER + 8}px` }}>
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
