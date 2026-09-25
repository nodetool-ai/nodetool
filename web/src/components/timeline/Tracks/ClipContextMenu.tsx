import { useMemo } from "react";
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
import { canClipFade } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { useInStudio } from "../../../studio/StudioContext";
import type { WorkflowMediaItem } from "../../../hooks/handlers/useGenerationToCanvas";
import { clipWorkflowMedia } from "../clipWorkflowMedia";

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
  onError
}: ClipContextMenuProps) {
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
  const applyFades = useTimelineStore((s) => s.applyFades);
  const patchClip = useTimelineStore((s) => s.patchClip);
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
    <ContextMenu open position={position} onClose={onClose} compact>
      <MenuItemPrimitive
        label="Split at playhead"
        icon={<ContentCutOutlinedIcon fontSize="small" />}
        compact
        onClick={run(actions.splitAtPlayhead)}
      />
      {actions.isMidi && (
        <MenuItemPrimitive
          label="Edit notes"
          icon={<MusicNoteOutlinedIcon fontSize="small" />}
          compact
          onClick={run(actions.editNotes)}
        />
      )}
      {actions.canEditVideo && (
        <MenuItemPrimitive
          label="Edit video…"
          icon={<AutoAwesomeOutlinedIcon fontSize="small" />}
          compact
          onClick={run(actions.openAiEdit)}
        />
      )}
      <MenuItemPrimitive
        label="Duplicate"
        icon={<ContentCopyIcon fontSize="small" />}
        compact
        onClick={run(actions.duplicate)}
      />
      <MenuItemPrimitive
        label={hasTransition ? "Remove transition" : "Cross-fade in"}
        icon={<GradientOutlinedIcon fontSize="small" />}
        compact
        onClick={run(() =>
          hasTransition
            ? removeTransition(clipId)
            : applyDefaultTransition(new Set([clipId]))
        )}
      />
      {canFade && (
        <MenuItemPrimitive
          label={hasFade ? "Remove fades" : "Fade in and out"}
          icon={<GraphicEqOutlinedIcon fontSize="small" />}
          compact
          onClick={run(() =>
            hasFade
              ? patchClip(clipId, { fadeInMs: 0, fadeOutMs: 0 })
              : applyFades(new Set([clipId]))
          )}
        />
      )}
      {actions.isGenerated && (
        <MenuItemPrimitive
          label="Regenerate as new clip"
          icon={<AutoAwesomeMotionIcon fontSize="small" />}
          compact
          onClick={run(actions.regenerateAsCopy)}
        />
      )}
      <MenuItemPrimitive
        label={actions.locked ? "Unlock" : "Lock"}
        icon={
          actions.locked ? (
            <LockIcon fontSize="small" />
          ) : (
            <LockOpenIcon fontSize="small" />
          )
        }
        compact
        onClick={run(actions.toggleLock)}
      />
      {actions.canReplace && (
        <MenuItemPrimitive
          label="Replace clip…"
          icon={<ImageIcon fontSize="small" />}
          compact
          onClick={run(actions.openReplace)}
        />
      )}
      {!inStudio && workflowMedia.length > 0 && (
        <MenuItemPrimitive
          label={
            workflowMedia.length === 1
              ? "Send to workflow…"
              : `Send ${workflowMedia.length} clips to workflow…`
          }
          icon={<AccountTreeOutlinedIcon fontSize="small" />}
          compact
          onClick={run(() => onSendToWorkflow(workflowMedia, position))}
        />
      )}
      {actions.canOpenInNodeEditor && (
        <MenuItemPrimitive
          label="Open in node editor"
          icon={<OpenInNewIcon fontSize="small" />}
          compact
          onClick={run(actions.openInNodeEditor)}
        />
      )}
      {isLinked && (
        <MenuItemPrimitive
          label="Unlink"
          icon={<LinkOffIcon fontSize="small" />}
          compact
          onClick={run(onUnlink)}
        />
      )}
      <MenuItemPrimitive
        label="Delete"
        icon={<DeleteOutlineOutlinedIcon fontSize="small" />}
        compact
        onClick={run(onDelete)}
      />
    </ContextMenu>
  );
}
