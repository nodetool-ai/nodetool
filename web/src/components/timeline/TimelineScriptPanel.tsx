/**
 * TimelineScriptPanel — the timeline's "Script" dock panel.
 *
 * With a linked script it lists the script's lines, compact and editable:
 * speaker, text, and a voice action on a line whose audio is missing or out of
 * date. Takes and waveforms stay in the script editor. Edits go to the script
 * store, and `useLinkedScriptSync` carries them into the timeline. Without a
 * linked script it shows the transcript editor and a way to link one.
 *
 * Uses `ui_primitives` only.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import LinkIcon from "@mui/icons-material/Link";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import MicNoneIcon from "@mui/icons-material/MicNone";
import AddIcon from "@mui/icons-material/AddOutlined";
import NoteAddOutlinedIcon from "@mui/icons-material/NoteAddOutlined";

import {
  Panel,
  FlexColumn,
  FlexRow,
  Text,
  Caption,
  EditorButton,
  EditorMenu,
  MenuItemPrimitive,
  ToolbarIconButton,
  TextArea,
  LoadingSpinner,
  BORDER_RADIUS,
  SPACING,
  TYPOGRAPHY
} from "../ui_primitives";

import { trpc, trpcClient } from "../../trpc/client";
import {
  effectiveVoice,
  lineStatus,
  useScriptStore,
  type ScriptLine,
  type ScriptSpeaker
} from "../../stores/script/ScriptStore";
import { voiceLine, scriptSpeed } from "../../stores/script/scriptVoicing";
import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../stores/timeline/TimelineUIStore";
import {
  useTimelinePlaybackStoreApi,
  useTimelineUIStoreApi
} from "../../stores/timeline/TimelineInstance";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useLinkedScriptId } from "../../hooks/timeline/useLinkedScript";
import { useTimeline } from "../../hooks/useTimelineSequence";
import { getErrorMessage } from "../../utils/errorHandling";
import { TranscriptPanel } from "./TranscriptPanel";

export const TimelineScriptPanel: React.FC = memo(() => {
  const sequenceId = useTimelineStore((s) => s.sequenceId);
  const scriptId = useLinkedScriptId(sequenceId);
  return scriptId ? (
    <LinkedScriptPanel scriptId={scriptId} />
  ) : (
    <TranscriptPanel headerAction={<LinkScriptButton />} />
  );
});
TimelineScriptPanel.displayName = "TimelineScriptPanel";

/** Point a script's `timelineId` at a sequence, or clear it with null. */
async function setScriptTimelineLink(
  scriptId: string,
  timelineId: string | null
): Promise<void> {
  // The server first: a script left in the store after its tab closed has no
  // sync to save a local-only link, and a later load would drop it. A failed
  // call leaves the local copy as it was.
  const updated = await trpcClient.scripts.update.mutate({ id: scriptId, timelineId });
  const store = useScriptStore.getState();
  if (!store.scripts[scriptId]) return;
  // A mounted sync saves against the new revision, so its next save neither
  // conflicts with this write nor reverts the link.
  if (store.serverRevisions[scriptId]) {
    store.setServerRevision(scriptId, updated.updatedAt);
  }
  store.setTimelineLink(scriptId, timelineId);
}

const LinkScriptButton: React.FC = memo(() => {
  const { t } = useTranslation();
  const sequenceId = useTimelineStore((s) => s.sequenceId);
  const { data: sequence } = useTimeline(sequenceId);
  const utils = trpc.useUtils();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const { data: scripts } = trpc.scripts.list.useQuery(
    { projectId: sequence?.projectId },
    { enabled: !!anchor && !!sequence, staleTime: 30_000 }
  );

  const link = useCallback(
    async (pick: { scriptId: string } | "new") => {
      setAnchor(null);
      if (!sequenceId || !sequence) return;
      try {
        let scriptId: string;
        if (pick === "new") {
          const created = await trpcClient.scripts.create.mutate({
            name: t("i18n-next65.timeline.linkedScript.newScriptName", {
              name: sequence.name || t("i18n-next65.timeline.linkedScript.timeline")
            }),
            projectId: sequence.projectId
          });
          scriptId = created.id;
        } else {
          scriptId = pick.scriptId;
        }
        await setScriptTimelineLink(scriptId, sequenceId);
        await utils.scripts.list.invalidate();
      } catch (err) {
        addNotification({
          content: t("i18n-next65.timeline.linkedScript.linkFailed", {
            error: getErrorMessage(err)
          }),
          type: "error",
          alert: true
        });
      }
    },
    [sequenceId, sequence, utils, addNotification, t]
  );

  return (
    <>
      <ToolbarIconButton
        icon={<LinkIcon fontSize="small" />}
        tooltip={t("i18n-next65.timeline.linkedScript.linkTooltip")}
        aria-label={t("i18n-next65.timeline.linkedScript.linkLabel")}
        disabled={!sequence}
        onClick={(event) => setAnchor(event.currentTarget)}
      />
      <EditorMenu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
      >
        <MenuItemPrimitive
          icon={<NoteAddOutlinedIcon fontSize="small" />}
          label={t("i18n-next65.timeline.linkedScript.newScript")}
          onClick={() => void link("new")}
        />
        {(scripts ?? []).map((script) => (
          <MenuItemPrimitive
            key={script.id}
            label={script.name}
            onClick={() => void link({ scriptId: script.id })}
          />
        ))}
      </EditorMenu>
    </>
  );
});
LinkScriptButton.displayName = "LinkScriptButton";

const LinkedScriptPanel: React.FC<{ scriptId: string }> = memo(
  ({ scriptId }) => {
    const { t } = useTranslation();
    const script = useScriptStore((s) => s.scripts[scriptId]);
    const addLine = useScriptStore((s) => s.addLine);
    const openTab = useWorkspaceTabsStore((s) => s.openTab);
    const utils = trpc.useUtils();
    const addNotification = useNotificationStore((s) => s.addNotification);

    const lineCount = useMemo(
      () => script?.sections.reduce((n, s) => n + s.lines.length, 0) ?? 0,
      [script]
    );

    const unlink = useCallback(async () => {
      try {
        await setScriptTimelineLink(scriptId, null);
        await utils.scripts.list.invalidate();
      } catch (err) {
        addNotification({
          content: t("i18n-next65.timeline.linkedScript.unlinkFailed", {
            error: getErrorMessage(err)
          }),
          type: "error",
          alert: true
        });
      }
    }, [scriptId, utils, addNotification, t]);

    const openInEditor = useCallback(() => {
      openTab({
        type: "script",
        ref: scriptId,
        mode: "edit",
        title: script?.title || t("i18n-next65.timeline.linkedScript.untitled")
      });
    }, [openTab, scriptId, script?.title, t]);

    return (
      <Panel
        data-testid="timeline-script-panel"
        background="default"
        bordered={false}
        sx={{ height: "100%", minHeight: 0, display: "flex", flexDirection: "column" }}
      >
        <FlexColumn gap={SPACING.sm} sx={{ p: 0.5, flex: 1, minHeight: 0 }}>
          <FlexRow align="center" justify="space-between" gap={SPACING.xs}>
            <FlexRow gap={SPACING.xs} align="baseline" sx={{ minWidth: 0 }}>
              <Text size="smaller" truncate>
                {script?.title || t("i18n-next65.timeline.linkedScript.untitled")}
              </Text>
              <Caption sx={{ color: "text.disabled", flexShrink: 0 }}>
                {t("i18n-next65.timeline.linkedScript.lines", { count: lineCount })}
              </Caption>
            </FlexRow>
            <FlexRow gap={SPACING.xs} align="center">
              <ToolbarIconButton
                icon={<OpenInNewIcon fontSize="small" />}
                tooltip={t("i18n-next65.timeline.linkedScript.openTooltip")}
                aria-label={t("i18n-next65.timeline.linkedScript.openLabel")}
                onClick={openInEditor}
              />
              <ToolbarIconButton
                icon={<LinkOffIcon fontSize="small" />}
                tooltip={t("i18n-next65.timeline.linkedScript.unlinkTooltip")}
                aria-label={t("i18n-next65.timeline.linkedScript.unlinkLabel")}
                onClick={() => void unlink()}
              />
            </FlexRow>
          </FlexRow>

          {!script ? (
            <FlexRow justify="center" sx={{ py: SPACING.lg }}>
              <LoadingSpinner size="small" />
            </FlexRow>
          ) : (
            <FlexColumn
              gap={SPACING.none}
              sx={{ flex: 1, minHeight: 0, overflowY: "auto" }}
              data-testid="timeline-script-lines"
            >
              {script.sections.map((section) => (
                <FlexColumn key={section.id} gap={SPACING.none}>
                  {section.title ? (
                    <Caption
                      sx={{
                        color: "text.secondary",
                        px: SPACING.xs,
                        pt: SPACING.sm,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em"
                      }}
                    >
                      {section.title}
                    </Caption>
                  ) : null}
                  {section.lines.map((line, index) => (
                    <ScriptLineItem
                      key={line.id}
                      scriptId={scriptId}
                      line={line}
                      cast={script.cast}
                      speed={scriptSpeed(script)}
                      showSpeaker={
                        index === 0 ||
                        section.lines[index - 1].speakerId !== line.speakerId
                      }
                    />
                  ))}
                </FlexColumn>
              ))}
              <FlexRow sx={{ pt: SPACING.xs }}>
                <EditorButton
                  size="small"
                  variant="text"
                  startIcon={<AddIcon />}
                  onClick={() => addLine(scriptId)}
                >
                  {t("i18n-next65.timeline.linkedScript.addLine")}
                </EditorButton>
              </FlexRow>
            </FlexColumn>
          )}
        </FlexColumn>
      </Panel>
    );
  }
);
LinkedScriptPanel.displayName = "LinkedScriptPanel";

interface ScriptLineItemProps {
  scriptId: string;
  line: ScriptLine;
  cast: ScriptSpeaker[];
  speed: number | null;
  /** The speaker name heads a run of lines by one speaker, as in a screenplay. */
  showSpeaker: boolean;
}

const ScriptLineItem: React.FC<ScriptLineItemProps> = memo(
  ({ scriptId, line, cast, speed, showSpeaker }) => {
    const { t } = useTranslation();
    const patchLine = useScriptStore((s) => s.patchLine);
    const removeLine = useScriptStore((s) => s.removeLine);
    const voicing = useScriptStore((s) => !!s.voicingLineIds[line.id]);
    const addNotification = useNotificationStore((s) => s.addNotification);
    const docApi = useTimelineStoreApi();
    const playbackApi = useTimelinePlaybackStoreApi();
    const uiApi = useTimelineUIStoreApi();
    const clipId = useTimelineStore(
      (s) => s.clips.find((c) => c.scriptLineId === line.id && c.scriptId === scriptId)?.id
    );
    const selected = useTimelineUIStore(
      (s) => !!clipId && s.selectedClipIds.has(clipId)
    );

    const speaker = cast.find((s) => s.id === line.speakerId) ?? null;
    const status = lineStatus(line, effectiveVoice(line, cast), speed);

    const onTextChange = useCallback(
      (text: string) => patchLine(scriptId, line.id, { text }),
      [patchLine, scriptId, line.id]
    );

    // Backspace in an empty line deletes the line, as in a text editor.
    const onTextKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        if (event.key !== "Backspace" || line.text !== "") return;
        event.preventDefault();
        removeLine(scriptId, line.id);
      },
      [removeLine, scriptId, line.id, line.text]
    );

    // Focus in a line selects its clip and moves the playhead to it, the way
    // a click on a word does in the transcript.
    const onFocus = useCallback(() => {
      if (!clipId) return;
      const clip = docApi.getState().clips.find((c) => c.id === clipId);
      if (!clip) return;
      playbackApi.getState().seek(clip.startMs);
      uiApi.getState().setSelection([clip.id]);
    }, [clipId, docApi, playbackApi, uiApi]);

    const onVoice = useCallback(async () => {
      try {
        await voiceLine(scriptId, line.id);
      } catch (err) {
        addNotification({
          content: t("i18n-next65.timeline.linkedScript.voiceFailed", {
            error: getErrorMessage(err)
          }),
          type: "error",
          alert: true
        });
      }
    }, [scriptId, line.id, addNotification, t]);

    const voiceTooltip =
      status === "draft"
        ? t("i18n-next65.timeline.linkedScript.voiceDraftTooltip")
        : t("i18n-next65.timeline.linkedScript.voiceStaleTooltip");

    return (
      <FlexColumn
        gap={SPACING.none}
        onFocus={onFocus}
        data-testid="timeline-script-line"
        data-status={status}
        sx={{
          px: SPACING.xs,
          pt: showSpeaker ? SPACING.xs : SPACING.none,
          borderRadius: BORDER_RADIUS.sm,
          backgroundColor: selected ? "action.selected" : "transparent"
        }}
      >
        {showSpeaker && speaker ? (
          <Caption
            sx={{
              color: speaker.color ?? "text.secondary",
              letterSpacing: "0.04em"
            }}
          >
            {speaker.name}
          </Caption>
        ) : null}
        <FlexRow gap={SPACING.xs} align="flex-start">
          <TextArea
            value={line.text}
            onChange={onTextChange}
            onKeyDown={onTextKeyDown}
            assist={false}
            hideLabel
            label={t("i18n-next65.timeline.linkedScript.lineLabel")}
            placeholder={t("i18n-next65.timeline.linkedScript.linePlaceholder")}
            compact
            fullWidth
            sx={{
              "& .MuiOutlinedInput-root": { padding: 0 },
              "& .MuiOutlinedInput-notchedOutline": { border: "none" },
              "& .MuiOutlinedInput-input": {
                ...TYPOGRAPHY.sans.body,
                color: status === "draft" ? "text.secondary" : "text.primary",
                fontStyle: status === "draft" ? "italic" : "normal"
              }
            }}
          />
          {status !== "voiced" ? (
            <ToolbarIconButton
              icon={<MicNoneIcon fontSize="small" />}
              tooltip={voiceTooltip}
              aria-label={t("i18n-next65.timeline.linkedScript.voiceLabel")}
              variant={status === "stale" ? "primary" : "default"}
              loading={voicing}
              disabled={!line.text.trim()}
              onClick={() => void onVoice()}
            />
          ) : null}
        </FlexRow>
      </FlexColumn>
    );
  }
);
ScriptLineItem.displayName = "ScriptLineItem";

export default TimelineScriptPanel;
