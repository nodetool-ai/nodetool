/** @jsxImportSource @emotion/react */
import { useCallback, useState } from "react";
import AddIcon from "@mui/icons-material/Add";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import {
  FlexColumn,
  FlexRow,
  Text,
  TextInput,
  EditorButton,
  ToolbarIconButton,
  Divider,
  EmptyState,
  LoadingSpinner,
  SPACING,
  Z_INDEX
} from "../ui_primitives";
import {
  useScript,
  useScriptStore,
  type ScriptSection
} from "../../stores/script/ScriptStore";
import { voiceAll } from "../../stores/script/scriptVoicing";
import { useScriptPlaythrough } from "../../hooks/script/useScriptPlaythrough";
import ScriptLineRow from "./ScriptLineRow";

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
    <FlexColumn gap={SPACING.xs} fullWidth>
      <FlexRow align="center" gap={SPACING.sm} fullWidth>
        <TextInput
          value={section.title ?? ""}
          onChange={(e) =>
            setSectionTitle(scriptId, section.id, e.target.value)
          }
          placeholder="Section title (optional)…"
          hideLabel
          label="Section title"
          compact
          fullWidth
          disabled={readOnly}
        />
        {!readOnly && (
          <ToolbarIconButton
            tooltip="Remove section"
            onClick={() => removeSection(scriptId, section.id)}
            icon={<Text size="smaller">✕</Text>}
          />
        )}
      </FlexRow>
      <Divider />
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
        <FlexRow>
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
  const { sections } = useScript(scriptId);
  const addLine = useScriptStore((s) => s.addLine);
  const addSection = useScriptStore((s) => s.addSection);
  const { playing, currentLineId, play, stop } =
    useScriptPlaythrough(scriptId);
  const [voicingAll, setVoicingAll] = useState(false);

  const onVoiceAll = useCallback(async () => {
    setVoicingAll(true);
    try {
      await voiceAll(scriptId);
    } finally {
      setVoicingAll(false);
    }
  }, [scriptId]);

  const isEmpty = sections.every((s) => s.lines.length === 0);

  return (
    <FlexColumn
      gap={SPACING.md}
      sx={{ flex: 1, minWidth: 0, height: "100%", overflowY: "auto" }}
    >
      <FlexRow
        align="center"
        gap={SPACING.sm}
        sx={{
          padding: SPACING.sm,
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
              variant="outlined"
              startIcon={<GraphicEqIcon fontSize="small" />}
              onClick={() => void onVoiceAll()}
            >
              Voice all
            </EditorButton>
          ))}
        {playing ? (
          <EditorButton
            size="small"
            variant="outlined"
            startIcon={<StopIcon fontSize="small" />}
            onClick={stop}
          >
            Stop
          </EditorButton>
        ) : (
          <EditorButton
            size="small"
            variant="outlined"
            startIcon={<PlayArrowIcon fontSize="small" />}
            onClick={play}
          >
            Play through
          </EditorButton>
        )}
      </FlexRow>

      <FlexColumn
        gap={SPACING.lg}
        sx={{ padding: SPACING.md, maxWidth: 860, width: "100%" }}
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
          <FlexRow gap={SPACING.sm}>
            <EditorButton
              size="small"
              variant="text"
              startIcon={<AddIcon fontSize="small" />}
              onClick={() => addLine(scriptId)}
            >
              Add line
            </EditorButton>
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
