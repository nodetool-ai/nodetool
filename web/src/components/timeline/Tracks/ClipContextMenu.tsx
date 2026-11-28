import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { canClipFade } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { useInStudio } from "../../../studio/StudioContext";
import type { WorkflowMediaItem } from "../../../hooks/handlers/useGenerationToCanvas";
import { clipWorkflowMedia } from "../clipWorkflowMedia";
import { clipEnabledPatch, isClipDisabled } from "./clipEnabled";
import { canTransformClip } from "./TransformClipDialog";

import { ContextMenu, MenuItemPrimitive } from "../../ui_primitives";
import { useSettingsStore } from "../../../stores/SettingsStore";
import { formatActionShortcut, type TimelineAction } from "../timelineKeymap";
import { ClipMenuDialog, type ClipMenuDialogApply } from "./ClipMenuDialog";
import {
  useClipMenuActions,
  type ClipMenuActionCallbacks
} from "./useClipMenuActions";

interface ClipContextMenuProps extends ClipMenuActionCallbacks {
  clipId: string;
  position: { x: number; y: number };
  isLinked: boolean;
  onUnlink: () => void;
  onDelete: () => void;
  /** Hands the clips' media to a "Send to workflow" menu at `position`. */
  onSendToWorkflow: (
    items: WorkflowMediaItem[],
    position: { x: number; y: number }
  ) => void;
  /** Opens "Transform with workflow" on this clip's media. */
  onRequestTransform: () => void;
  onClose: () => void;
}

/**
 * Right-click menu for a timeline clip — the single home for clip operations
 * (the inspector no longer carries a button row). "Delete" is always
 * available so a leftover failed/"generating" clip can be removed; "Unlink"
 * shows only for clips in a link group (e.g. a video and its extracted audio).
 */
export function ClipContextMenu({
  clipId,
  position,
  isLinked,
  onUnlink,
  onDelete,
  onSendToWorkflow,
  onClose,
  onRequestReplace,
  onRequestTransform,
  onError
}: ClipContextMenuProps) {
  const { t } = useTranslation();
  // The keys shown beside an item follow the chosen keyboard preset.
  const preset = useSettingsStore((s) => s.settings.timelineKeyboardPreset);
  const keyFor = (action: TimelineAction): string | undefined =>
    formatActionShortcut(preset, action) ?? undefined;
  const actions = useClipMenuActions(clipId, { onRequestReplace, onError });
  const hasTransition = useTimelineStore(
    (s) => (findClipById(s.clips, clipId)?.transitionIn?.durationMs ?? 0) > 0
  );
  const applyDefaultTransition = useTimelineStore((s) => s.applyDefaultTransition);
  const removeTransition = useTimelineStore((s) => s.removeTransition);
  const canFade = useTimelineStore((s) => {
    const clip = findClipById(s.clips, clipId);
    return clip ? canClipFade(clip.mediaType) : false;
  });
  const hasFade = useTimelineStore((s) => {
    const clip = findClipById(s.clips, clipId);
    return ((clip?.fadeInMs ?? 0) || (clip?.fadeOutMs ?? 0)) > 0;
  });
  const canTransform = useTimelineStore((s) =>
    canTransformClip(findClipById(s.clips, clipId))
  );
  const disabled = useTimelineStore((s) => {
    const clip = findClipById(s.clips, clipId);
    return clip ? isClipDisabled(clip) : false;
  });
  const patchClip = useTimelineStore((s) => s.patchClip);
  const duplicateSelected = useTimelineStore((s) => s.duplicateSelected);
  const selectClip = useTimelineUIStore((s) => s.selectClip);
  const [dialog, setDialog] = useState<"repeat" | "rename" | "color" | null>(
    null
  );
  const dialogClip = useTimelineStore((s) => findClipById(s.clips, clipId));
  const applyFades = useTimelineStore((s) => s.applyFades);
  const clearFades = useTimelineStore((s) => s.clearFades);
  // A right-click inside the selection acts on the whole selection, like the
  // timeline's other multi-clip commands; outside it, on this clip alone.
  const inStudio = useInStudio();
  const clips = useTimelineStore((s) => s.clips);
  const selectedClipIds = useTimelineUIStore((s) => s.selectedClipIds);
  const workflowMedia = useMemo(() => {
    const ids = selectedClipIds.has(clipId) ? [...selectedClipIds] : [clipId];
    return clipWorkflowMedia(
      ids.flatMap((id) => {
        const clip = findClipById(clips, id);
        return clip ? [clip] : [];
      })
    );
  }, [clipId, clips, selectedClipIds]);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const applyDialog = (result: ClipMenuDialogApply) => {
    if ("count" in result) {
      const ids = duplicateSelected(new Set([clipId]), 0, result.count);
      const last = ids[ids.length - 1];
      if (last) selectClip(last);
    } else if ("name" in result) {
      patchClip(clipId, { name: result.name });
    } else {
      patchClip(clipId, { labelColor: result.labelColor ?? undefined });
    }
    onClose();
  };

  return (
    <>
    <ContextMenu open={dialog === null} position={position} onClose={onClose}>
      <MenuItemPrimitive
        label={t("i18n-next59.clipMenu.splitAtPlayhead")}
        shortcut={keyFor("splitAtPlayhead")}
        onClick={run(() => actions.splitAtPlayhead())}
      />
      {actions.isMidi && (
        <MenuItemPrimitive
          label={t("i18n-next59.clipMenu.splitKeepNotes")}
          onClick={run(() => actions.splitAtPlayhead("split"))}
        />
      )}
      {actions.isMidi && (
        <MenuItemPrimitive
          label={t("i18n-next59.clipMenu.editNotes")}
          onClick={run(actions.editNotes)}
        />
      )}
      {actions.canEditVideo && (
        <MenuItemPrimitive
          label={t("i18n-next59.clipMenu.editVideo")}
          onClick={run(actions.openAiEdit)}
        />
      )}
      <MenuItemPrimitive
        label={t("i18n-next59.clipMenu.duplicate")}
        shortcut={keyFor("duplicate")}
        dividerBefore
        onClick={run(actions.duplicate)}
      />
      <MenuItemPrimitive
        label={t("i18n-next59.clipMenu.repeat")}
        onClick={() => setDialog("repeat")}
      />
      <MenuItemPrimitive
        label={t("i18n-next59.clipMenu.rename")}
        onClick={() => setDialog("rename")}
      />
      <MenuItemPrimitive
        label={t("i18n-next59.clipMenu.color")}
        onClick={() => setDialog("color")}
      />
      <MenuItemPrimitive
        label={t("i18n-next59.clipMenu.insertSilence")}
        dividerBefore
        onClick={run(actions.insertSilence)}
      />
      <MenuItemPrimitive
        label={t("i18n-next59.clipMenu.deleteSection")}
        onClick={run(actions.deleteSection)}
      />
      <MenuItemPrimitive
        label={t("i18n-next59.clipMenu.duplicateSection")}
        onClick={run(actions.duplicateSection)}
      />
      <MenuItemPrimitive
        label={t(hasTransition ? "i18n-next59.clipMenu.removeTransition" : "i18n-next59.clipMenu.crossFadeIn")}
        dividerBefore
        onClick={run(() =>
          hasTransition
            ? removeTransition(clipId)
            : applyDefaultTransition(new Set([clipId]))
        )}
      />
      {canFade && (
        <MenuItemPrimitive
          label={t(hasFade ? "i18n-next59.clipMenu.removeFades" : "i18n-next59.clipMenu.fadeInOut")}
          onClick={run(() =>
            hasFade
              ? clearFades(new Set([clipId]))
              : applyFades(new Set([clipId]))
          )}
        />
      )}
      {actions.canDetectBeats && (
        <MenuItemPrimitive
          label={t("i18n-next59.clipMenu.detectBeats")}
          onClick={run(actions.detectBeats)}
        />
      )}
      {actions.isGenerated && (
        <MenuItemPrimitive
          label={t("i18n-next59.clipMenu.regenerateClip")}
          onClick={run(actions.regenerateAsCopy)}
        />
      )}
      <MenuItemPrimitive
        label={t(actions.locked ? "i18n-next59.clipMenu.unlock" : "i18n-next59.clipMenu.lock")}
        dividerBefore
        onClick={run(actions.toggleLock)}
      />
      {!actions.locked && (
        <MenuItemPrimitive
          label={t(disabled ? "i18n-next59.clipMenu.enable" : "i18n-next59.clipMenu.disable")}
        shortcut={keyFor("toggleClipEnabled")}
          onClick={run(() => {
            const clip = findClipById(clips, clipId);
            if (clip) patchClip(clipId, clipEnabledPatch(clip, disabled));
          })}
        />
      )}
      {actions.canReplace && (
        <MenuItemPrimitive
          label={t("i18n-next59.clipMenu.replaceClip")}
          onClick={run(actions.openReplace)}
        />
      )}
      {canTransform && (
        <MenuItemPrimitive
          label={t("transformWithWorkflow.open")}
          onClick={run(onRequestTransform)}
        />
      )}
      {!inStudio && workflowMedia.length > 0 && (
        <MenuItemPrimitive
          label={t("i18n-next59.clipMenu.sendClipsToWorkflow", { count: workflowMedia.length })}
          onClick={run(() => onSendToWorkflow(workflowMedia, position))}
        />
      )}
      {actions.canOpenInNodeEditor && (
        <MenuItemPrimitive
          label={t("i18n-next59.clipMenu.openNodeEditor")}
          onClick={run(actions.openInNodeEditor)}
        />
      )}
      {isLinked && (
        <MenuItemPrimitive
          label={t("i18n-next59.clipMenu.unlink")}
          onClick={run(onUnlink)}
        />
      )}
      <MenuItemPrimitive
        label={t("i18n-next59.clipMenu.delete")}
        shortcut={keyFor("deleteSelected")}
        color="error"
        dividerBefore
        onClick={run(onDelete)}
      />
    </ContextMenu>
    {dialog && (
      <ClipMenuDialog
        mode={dialog}
        clipName={dialogClip?.name ?? ""}
        currentColor={dialogClip?.labelColor}
        onApply={applyDialog}
        onClose={onClose}
      />
    )}
    </>
  );
}
