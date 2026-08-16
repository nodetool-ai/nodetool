/**
 * ShotScriptPanel
 *
 * The "Script" section of a shot: the lines the shot covers, each with its
 * speaker, voice status, and a play button on the current take — plus the
 * drift badge and *Re-project* when the script now reads differently from
 * what was last projected onto the shot (design §2.5, §4).
 *
 * Renders nothing on a board that links no script or a shot that covers no
 * line. Voicing writes into the script store, and only an open script tab
 * saves it, so that action waits for the script's editor.
 */

import React, { memo, useCallback, useState } from "react";
import type { Shot } from "@nodetool-ai/protocol";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

import {
  Box,
  Caption,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  StatusIndicator,
  Text,
  ToolbarIconButton,
  Tooltip,
  BORDER_RADIUS,
  SPACING,
  type StatusType
} from "../ui_primitives";
import {
  effectiveVoice,
  lineStatus,
  useLineVoicing,
  type LineStatus,
  type ScriptLine,
  type ScriptSpeaker
} from "../../stores/script/ScriptStore";
import { voiceLine } from "../../stores/script/scriptVoicing";
import { playTake } from "../../stores/script/playTake";
import { getErrorMessage } from "../../utils/errorHandling";
import { useStoryboardStore } from "../../stores/storyboard/StoryboardStore";
import { linkedScriptId } from "../../lib/scriptStoryboardLink";
import { useLinkedScript } from "../../hooks/storyboard/useLinkedScript";
import { useReprojectShots } from "../../hooks/storyboard/useReprojectShots";
import { shotDialogueDrifted } from "@nodetool-ai/protocol";

interface ShotScriptPanelProps {
  boardId: string;
  shot: Shot;
  readOnly?: boolean;
}

const STATUS_META: Record<LineStatus, { status: StatusType; label: string }> = {
  draft: { status: "default", label: "Not voiced" },
  stale: { status: "warning", label: "Stale" },
  voiced: { status: "success", label: "Voiced" }
};

const ScriptLineEntry = ({
  scriptId,
  line,
  cast,
  canVoice,
  onError
}: {
  scriptId: string;
  line: ScriptLine;
  cast: ScriptSpeaker[];
  canVoice: boolean;
  onError: (message: string | null) => void;
}) => {
  const voicing = useLineVoicing(line.id);
  const voice = effectiveVoice(line, cast);
  const status = lineStatus(line, voice);
  const meta = STATUS_META[status];
  const speaker = cast.find((s) => s.id === line.speakerId) ?? null;
  const take = line.takes.find((t) => t.id === line.currentTakeId) ?? null;

  const onVoice = useCallback(async () => {
    onError(null);
    try {
      await voiceLine(scriptId, line.id);
    } catch (error) {
      onError(getErrorMessage(error, "Voicing failed"));
    }
  }, [scriptId, line.id, onError]);

  return (
    <FlexRow align="flex-start" gap={SPACING.xs} fullWidth>
      <Chip
        compact
        label={speaker?.name ?? "Narrator"}
        variant="outlined"
        sx={{ borderRadius: BORDER_RADIUS.sm, flexShrink: 0 }}
      />
      <Text size="small" sx={{ flex: 1, minWidth: 0 }} lineClamp={2}>
        {line.text}
      </Text>
      <FlexRow align="center" gap={SPACING.micro} sx={{ flexShrink: 0 }}>
        <StatusIndicator status={meta.status} label={meta.label} />
        {voicing ? (
          <LoadingSpinner size={20} />
        ) : (
          <Tooltip
            title={
              !canVoice
                ? "Open the script to voice this line"
                : voice
                  ? status === "stale"
                    ? "Re-voice line"
                    : "Voice line"
                  : "Assign a voice to this speaker first"
            }
          >
            <span>
              <ToolbarIconButton
                tooltip=""
                ariaLabel={`Voice line: ${line.text}`}
                disabled={!canVoice || !voice}
                onClick={() => void onVoice()}
                icon={<GraphicEqIcon fontSize="small" />}
              />
            </span>
          </Tooltip>
        )}
        <ToolbarIconButton
          tooltip="Play current take"
          ariaLabel={`Play take: ${line.text}`}
          disabled={!take}
          onClick={() => void (take && playTake(take.assetId))}
          icon={<PlayArrowIcon fontSize="small" />}
        />
      </FlexRow>
    </FlexRow>
  );
};

/**
 * The section itself. Split from the gate below so an unlinked board — the
 * common case — never mounts the script query at all.
 */
const LinkedScriptSection: React.FC<ShotScriptPanelProps> = ({
  boardId,
  shot,
  readOnly
}) => {
  const { scriptId, source, draftLoaded } = useLinkedScript(boardId);
  const { reproject, reprojecting } = useReprojectShots();
  const [error, setError] = useState<string | null>(null);

  const lineIds = shot.script_line_ids ?? [];

  const onReproject = useCallback(async () => {
    setError(null);
    try {
      await reproject(boardId, { shotIds: [shot.id] });
    } catch (err) {
      setError(getErrorMessage(err, "Re-projection failed"));
    }
  }, [reproject, boardId, shot.id]);

  if (!scriptId || lineIds.length === 0 || !source) {
    return null;
  }

  const lines = lineIds
    .map((id) => source.linesById.get(id))
    .filter((line): line is ScriptLine => line !== undefined);
  const drifted = shotDialogueDrifted(shot, source.linesById);

  return (
    <FlexColumn
      gap={SPACING.xs}
      fullWidth
      sx={{
        paddingTop: SPACING.xs,
        borderTop: "1px solid",
        borderColor: "divider"
      }}
    >
      <FlexRow align="center" justify="space-between" gap={SPACING.xs} wrap>
        <Caption color="secondary">Script</Caption>
        {drifted && (
          <FlexRow align="center" gap={SPACING.xs}>
            <StatusIndicator
              status="warning"
              label="Script changed"
              tooltip="The linked lines read differently from this shot's text"
            />
            {!readOnly && (
              <EditorButton onClick={() => void onReproject()} disabled={reprojecting}>
                Re-project
              </EditorButton>
            )}
          </FlexRow>
        )}
      </FlexRow>

      {lines.map((line) => (
        <ScriptLineEntry
          key={line.id}
          scriptId={scriptId}
          line={line}
          cast={source.cast}
          canVoice={!readOnly && draftLoaded}
          onError={setError}
        />
      ))}

      {lineIds.length > lines.length && (
        <Caption color="warning">
          {`${lineIds.length - lines.length} linked line(s) are no longer in the script.`}
        </Caption>
      )}

      {error && (
        <Box>
          <Caption color="error">{error}</Caption>
        </Box>
      )}
    </FlexColumn>
  );
};

const ShotScriptPanelInner: React.FC<ShotScriptPanelProps> = (props) => {
  const linked = useStoryboardStore(
    (state) => !!linkedScriptId(state.boards[props.boardId])
  );
  if (!linked || (props.shot.script_line_ids ?? []).length === 0) {
    return null;
  }
  return <LinkedScriptSection {...props} />;
};

export const ShotScriptPanel = memo(ShotScriptPanelInner);
ShotScriptPanel.displayName = "ShotScriptPanel";

export default ShotScriptPanel;
