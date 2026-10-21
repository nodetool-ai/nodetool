/**
 * "Transform with workflow" for a timeline clip: runs the clip's current
 * media through a saved workflow, and an output of the same kind can replace
 * that media the way "Replace clip…" does.
 *
 * The clip context menu unmounts the moment an item is clicked, so `Clip`
 * mounts this dialog once the menu has asked for it.
 */

import React, { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { TransformWithWorkflowView } from "../../assets/TransformWithWorkflowDialog";
import {
  transformSourceFromAssetId,
  type TransformApplyAction,
  type TransformKind
} from "../../assets/transformWorkflow";

/** The transform kind of a clip's media, or null for clips without a file. */
export const clipTransformKind = (
  mediaType: TimelineClip["mediaType"] | undefined
): TransformKind | null => {
  switch (mediaType) {
    case "image":
    case "video":
    case "audio":
    case "model3d":
      return mediaType;
    default:
      return null;
  }
};

/** Whether a clip has media a workflow can take. */
export const canTransformClip = (clip: TimelineClip | undefined): boolean =>
  Boolean(clip?.currentAssetId && clipTransformKind(clip.mediaType));

interface TransformClipDialogProps {
  clipId: string;
  onClose: () => void;
}

export const TransformClipDialog: React.FC<TransformClipDialogProps> = memo(
  ({ clipId, onClose }) => {
    const { t } = useTranslation();
    const replaceClipOutput = useTimelineStore((s) => s.replaceClipOutput);
    const assetId = useTimelineStore(
      (s) => findClipById(s.clips, clipId)?.currentAssetId
    );
    const mediaType = useTimelineStore(
      (s) => findClipById(s.clips, clipId)?.mediaType
    );
    const clipName = useTimelineStore(
      (s) => findClipById(s.clips, clipId)?.name
    );
    const kind = clipTransformKind(mediaType);

    // Read once: a replaced output must not swap the dialog's source mid-run.
    const [source] = useState(() =>
      assetId && kind
        ? transformSourceFromAssetId(assetId, kind, clipName || t("transformWithWorkflow.clipName"))
        : null
    );
    const apply = useMemo<TransformApplyAction | undefined>(
      () =>
        kind
          ? {
              label: t("transformWithWorkflow.apply.replaceClip"),
              kinds: [kind],
              onApply: (result) => replaceClipOutput(clipId, result.assetId)
            }
          : undefined,
      [clipId, kind, replaceClipOutput, t]
    );

    return (
      <TransformWithWorkflowView source={source} onClose={onClose} apply={apply} />
    );
  }
);

TransformClipDialog.displayName = "TransformClipDialog";
