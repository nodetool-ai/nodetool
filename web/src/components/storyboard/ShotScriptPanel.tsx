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
import { useTranslation } from "react-i18next";
import type { Shot } from "@nodetool-ai/protocol";
import GraphicEqIcon from "@mui/icons-material/GraphicEq";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";

import ErrorBanner from "../support/ErrorBanner";
import {
  Caption,
  Card,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  StatusIndicator,
  Text,
  ToolbarIconButton,
  Tooltip,
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

const STATUS_META: Record<LineStatus, { status: StatusType; key: string }> = {
  draft: { status: "default", key: "notVoiced" },
  stale: { status: "warning", key: "stale" },
  voiced: { status: "success", key: "voiced" }
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
  const { t } = useTranslation();
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
      onError(getErrorMessage(error, t("screens4_19.storyboard.shotScript.voicingFailed")));
    }
  }, [scriptId, line.id, onError, t]);

  return (
    <FlexRow align="flex-start" gap={SPACING.xs} fullWidth>
      <Chip
        compact
        label={speaker?.name ?? t("screens4_19.storyboard.shotScript.narrator")}
        variant="outlined"
        sx={{ flexShrink: 0 }}
      />
      <Text size="small" sx={{ flex: 1, minWidth: 0 }} lineClamp={2}>
        {line.text}
      </Text>
      <FlexRow align="center" gap={SPACING.micro} sx={{ flexShrink: 0 }}>
        <StatusIndicator
          status={meta.status}
          label={t(`screens4_19.storyboard.shotScript.${meta.key}`)}
        />
        {voicing ? (
          <LoadingSpinner size="small" />
        ) : (
          <Tooltip
            title={
              !canVoice
                ? t("screens4_19.storyboard.shotScript.openScriptToVoice")
                : voice
                  ? status === "stale"
                    ? t("screens4_19.storyboard.shotScript.revoiceLine")
                    : t("screens4_19.storyboard.shotScript.voiceLine")
                  : t("screens4_19.storyboard.shotScript.assignVoiceFirst")
            }
          >
            <span>
              <ToolbarIconButton
                tooltip=""
                ariaLabel={t("screens4_19.storyboard.shotScript.voiceLineAria", { text: line.text })}
                disabled={!canVoice || !voice}
                onClick={() => void onVoice()}
                icon={<GraphicEqIcon fontSize="small" />}
              />
            </span>
          </Tooltip>
        )}
        <ToolbarIconButton
          tooltip={t("screens4_19.storyboard.shotScript.playCurrentTake")}
          ariaLabel={t("screens4_19.storyboard.shotScript.playTakeAria", { text: line.text })}
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
  const { t } = useTranslation();
  const { scriptId, source, draftLoaded } = useLinkedScript(boardId);
  const { reproject, reprojecting } = useReprojectShots();
  const [error, setError] = useState<string | null>(null);

  const lineIds = shot.script_line_ids ?? [];

  const onReproject = useCallback(async () => {
    setError(null);
    try {
      await reproject(boardId, { shotIds: [shot.id] });
    } catch (err) {
      setError(getErrorMessage(err, t("screens4_19.storyboard.shotScript.reprojectFailed")));
    }
  }, [reproject, boardId, shot.id, t]);

  if (!scriptId || lineIds.length === 0 || !source) {
    return null;
  }

  const lines = lineIds
    .map((id) => source.linesById.get(id))
    .filter((line): line is ScriptLine => line !== undefined);
  const drifted = shotDialogueDrifted(shot, source.linesById);

  return (
    <Card variant="outlined" padding="normal">
      <FlexColumn gap={SPACING.xs} fullWidth>
        <FlexRow align="center" justify="space-between" gap={SPACING.xs} wrap>
          <Caption color="secondary">{t("screens4_19.storyboard.shotScript.title")}</Caption>
          {drifted && (
            <FlexRow align="center" gap={SPACING.xs}>
              <StatusIndicator
                status="warning"
                label={t("screens4_19.storyboard.shotScript.scriptChanged")}
                tooltip={t("screens4_19.storyboard.shotScript.scriptChangedTooltip")}
              />
              {!readOnly && (
                <EditorButton onClick={() => void onReproject()} disabled={reprojecting}>
                  {t("screens4_19.storyboard.shotScript.reproject")}
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
            {t("screens4_19.storyboard.shotScript.missingLinkedLines", {
              count: lineIds.length - lines.length
            })}
          </Caption>
        )}

        {error && (
          <ErrorBanner
            report={{
              source: "operation-failure",
              summary: t("screens4_19.storyboard.shotScript.actionFailed"),
              errorText: error
            }}
          >
            {error}
          </ErrorBanner>
        )}
      </FlexColumn>
    </Card>
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
