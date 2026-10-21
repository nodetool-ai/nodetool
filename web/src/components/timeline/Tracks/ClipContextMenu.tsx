import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import ContentCutOutlinedIcon from "@mui/icons-material/ContentCutOutlined";
import MusicNoteOutlinedIcon from "@mui/icons-material/MusicNoteOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import AutoAwesomeMotionIcon from "@mui/icons-material/AutoAwesomeMotion";
import LockIcon from "@mui/icons-material/Lock";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import ImageIcon from "@mui/icons-material/Image";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import LinkOffIcon from "@mui/icons-material/LinkOff";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import GradientOutlinedIcon from "@mui/icons-material/GradientOutlined";
import GraphicEqOutlinedIcon from "@mui/icons-material/GraphicEqOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import QueueMusicOutlinedIcon from "@mui/icons-material/QueueMusicOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import AutoFixHighOutlinedIcon from "@mui/icons-material/AutoFixHighOutlined";
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

  return (
    <ContextMenu open position={position} onClose={onClose}>
      <MenuItemPrimitive
        label={t("i18n-next59.clipMenu.splitAtPlayhead")}
        icon={<ContentCutOutlinedIcon fontSize="small" />}
        onClick={run(actions.splitAtPlayhead)}
      />
      {actions.isMidi && (
        <MenuItemPrimitive
          label={t("i18n-next59.clipMenu.editNotes")}
          icon={<MusicNoteOutlinedIcon fontSize="small" />}
          onClick={run(actions.editNotes)}
        />
      )}
      {actions.canEditVideo && (
        <MenuItemPrimitive
          label={t("i18n-next59.clipMenu.editVideo")}
          icon={<AutoAwesomeOutlinedIcon fontSize="small" />}
          onClick={run(actions.openAiEdit)}
        />
      )}
      <MenuItemPrimitive
        label={t("i18n-next59.clipMenu.duplicate")}
        icon={<ContentCopyIcon fontSize="small" />}
        onClick={run(actions.duplicate)}
      />
      <MenuItemPrimitive
        label={t(hasTransition ? "i18n-next59.clipMenu.removeTransition" : "i18n-next59.clipMenu.crossFadeIn")}
        icon={<GradientOutlinedIcon fontSize="small" />}
        onClick={run(() =>
          hasTransition
            ? removeTransition(clipId)
            : applyDefaultTransition(new Set([clipId]))
        )}
      />
      {canFade && (
        <MenuItemPrimitive
          label={t(hasFade ? "i18n-next59.clipMenu.removeFades" : "i18n-next59.clipMenu.fadeInOut")}
          icon={<GraphicEqOutlinedIcon fontSize="small" />}
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
          icon={<QueueMusicOutlinedIcon fontSize="small" />}
          onClick={run(actions.detectBeats)}
        />
      )}
      {actions.isGenerated && (
        <MenuItemPrimitive
          label={t("i18n-next59.clipMenu.regenerateClip")}
          icon={<AutoAwesomeMotionIcon fontSize="small" />}
          onClick={run(actions.regenerateAsCopy)}
        />
      )}
      <MenuItemPrimitive
        label={t(actions.locked ? "i18n-next59.clipMenu.unlock" : "i18n-next59.clipMenu.lock")}
        icon={
          actions.locked ? (
            <LockIcon fontSize="small" />
          ) : (
            <LockOpenIcon fontSize="small" />
          )
        }
        onClick={run(actions.toggleLock)}
      />
      {!actions.locked && (
        <MenuItemPrimitive
          label={t(disabled ? "i18n-next59.clipMenu.enable" : "i18n-next59.clipMenu.disable")}
          icon={
            disabled ? (
              <VisibilityOutlinedIcon fontSize="small" />
            ) : (
              <VisibilityOffOutlinedIcon fontSize="small" />
            )
          }
          onClick={run(() => {
            const clip = findClipById(clips, clipId);
            if (clip) patchClip(clipId, clipEnabledPatch(clip, disabled));
          })}
        />
      )}
      {actions.canReplace && (
        <MenuItemPrimitive
          label={t("i18n-next59.clipMenu.replaceClip")}
          icon={<ImageIcon fontSize="small" />}
          onClick={run(actions.openReplace)}
        />
      )}
      {canTransform && (
        <MenuItemPrimitive
          label={t("transformWithWorkflow.open")}
          icon={<AutoFixHighOutlinedIcon fontSize="small" />}
          onClick={run(onRequestTransform)}
        />
      )}
      {!inStudio && workflowMedia.length > 0 && (
        <MenuItemPrimitive
          label={t("i18n-next59.clipMenu.sendClipsToWorkflow", { count: workflowMedia.length })}
          icon={<AccountTreeOutlinedIcon fontSize="small" />}
          onClick={run(() => onSendToWorkflow(workflowMedia, position))}
        />
      )}
      {actions.canOpenInNodeEditor && (
        <MenuItemPrimitive
          label={t("i18n-next59.clipMenu.openNodeEditor")}
          icon={<OpenInNewIcon fontSize="small" />}
          onClick={run(actions.openInNodeEditor)}
        />
      )}
      {isLinked && (
        <MenuItemPrimitive
          label={t("i18n-next59.clipMenu.unlink")}
          icon={<LinkOffIcon fontSize="small" />}
          onClick={run(onUnlink)}
        />
      )}
      <MenuItemPrimitive
        label={t("i18n-next59.clipMenu.delete")}
        icon={<DeleteOutlineOutlinedIcon fontSize="small" />}
        color="error"
        dividerBefore
        onClick={run(onDelete)}
      />
    </ContextMenu>
  );
}
