/**
 * The Blockout rows of the Shot tab: which 3D clip stages this shot.
 *
 * The picker offers the `model3d` clips that overlap the shot's clip. The
 * linked clip's grey reference render goes to the video model with the next
 * take, so the take follows the blocked camera and staging. The rows also
 * show a running reference render, and say when the current take was made
 * from a Blockout that has changed since.
 */

import React, { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import type { Shot } from "@nodetool-ai/protocol";
import { isBlockoutTakeStale } from "@nodetool-ai/protocol";
import type { TimelineClip } from "@nodetool-ai/timeline";
import { blockoutCandidatesForClip } from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import {
  blockoutReferenceKey,
  useBlockoutReferenceStore
} from "../../../stores/timeline/BlockoutReferenceStore";
import { useBlockoutLink } from "../../../hooks/timeline/useBlockoutLink";
import type { ShotBlockout } from "../../../hooks/timeline/useShotBlockout";
import ErrorBanner from "../../support/ErrorBanner";
import {
  Caption,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  SPACING,
  SelectField
} from "../../ui_primitives";

/** The picker value of a shot with no Blockout. */
const NO_BLOCKOUT = "";

export interface ShotBlockoutSectionProps {
  /** The shot's clip on the timeline. */
  clip: TimelineClip;
  boardId: string;
  shot: Shot;
  /** The shot's linked Blockout, or null. */
  blockout: ShotBlockout | null;
}

export const ShotBlockoutSection: React.FC<ShotBlockoutSectionProps> = memo(
  ({ clip, boardId, shot, blockout }) => {
    const { t } = useTranslation();
    const linkBlockout = useBlockoutLink();
    const candidates = useTimelineStore(
      useShallow((s) => blockoutCandidatesForClip(s.clips, clip))
    );
    const linkedId = blockout?.clip.id ?? NO_BLOCKOUT;
    const key = useTimelineStore((s) =>
      blockoutReferenceKey(s.sequenceId, linkedId)
    );
    const render = useBlockoutReferenceStore((s) => s.renders[key]);
    const error = useBlockoutReferenceStore((s) => s.errors[key]);

    const options = useMemo(() => {
      const list = [
        { value: NO_BLOCKOUT, label: t("blockout3d.shotPanel.none") },
        ...candidates.map((candidate) => ({
          value: candidate.id,
          label: candidate.name
        }))
      ];
      // A linked clip that no longer overlaps stays listed, so the picker
      // shows what is stored.
      if (blockout && !list.some((option) => option.value === linkedId)) {
        list.push({ value: linkedId, label: blockout.clip.name });
      }
      return list;
    }, [candidates, blockout, linkedId, t]);

    const shotId = shot.id;
    const handleChange = useCallback(
      (value: string) => {
        if (value === NO_BLOCKOUT) {
          if (linkedId !== NO_BLOCKOUT) {
            linkBlockout(linkedId, null);
          }
          return;
        }
        linkBlockout(value, { boardId, shotId });
      },
      [linkBlockout, linkedId, boardId, shotId]
    );
    const handleSelectClip = useCallback(() => {
      if (linkedId !== NO_BLOCKOUT) {
        useTimelineUIStore.getState().selectClip(linkedId);
      }
    }, [linkedId]);

    const takeStale =
      blockout !== null && isBlockoutTakeStale(shot.clip, blockout.referenceHash);
    const noChoice = candidates.length === 0 && !blockout;

    return (
      <FlexColumn gap={SPACING.sm}>
        <SelectField
          label={t("blockout3d.shotPanel.clip")}
          value={linkedId}
          onChange={handleChange}
          options={options}
          disabled={noChoice}
          appearance="inspector"
        />
        <Caption color="secondary">
          {noChoice
            ? t("blockout3d.shotPanel.noCandidates")
            : t("blockout3d.shotPanel.help")}
        </Caption>
        {blockout && (
          <>
            <Caption color="secondary">
              {t("blockout3d.shotPanel.camera", { move: blockout.cameraMove })}
            </Caption>
            <FlexRow gap={SPACING.sm} wrap align="center">
              <EditorButton
                size="small"
                onClick={handleSelectClip}
                tooltip={t("blockout3d.shotPanel.selectClipTooltip")}
              >
                {t("blockout3d.shotPanel.selectClip")}
              </EditorButton>
              {takeStale && (
                <Chip
                  compact
                  color="warning"
                  label={t("blockout3d.shotPanel.takeStale")}
                />
              )}
            </FlexRow>
          </>
        )}
        {render && (
          <FlexRow gap={SPACING.sm} align="center">
            <LoadingSpinner size="small" />
            <Caption color="secondary">
              {render.progress && render.progress.total > 0
                ? t("blockout3d.shotPanel.renderingProgress", render.progress)
                : t("blockout3d.shotPanel.rendering")}
            </Caption>
          </FlexRow>
        )}
        {error && (
          <ErrorBanner
            report={{
              source: "operation-failure",
              summary: t("blockout3d.reference.failed"),
              errorText: error
            }}
          >
            {error}
          </ErrorBanner>
        )}
      </FlexColumn>
    );
  }
);
ShotBlockoutSection.displayName = "ShotBlockoutSection";

export default ShotBlockoutSection;
